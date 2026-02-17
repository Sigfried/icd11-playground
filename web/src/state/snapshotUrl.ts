/**
 * Encode/decode node-link snapshots as compact URL parameters.
 *
 * Encodes the sequence of operations (SnapshotOp) that produced the view.
 * Decoder replays them to reconstruct full history with undo/redo support.
 *
 * URL format: ?s=<base64url-encoded JSON>
 */

import { getNode, getGraph, getChildren, getParents, getGraphRelease } from '../api/foundationData';
import { buildInitialNeighborhood } from './buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning, removeNodesWithPruning } from './nlSubgraph';
import type { Snapshot, SnapshotOp } from './nlHistory';

/** Compact serialized op: [type, ...params] */
type SerializedOp =
  | ['select', string]
  | ['reselect', string]
  | ['add', string[]]
  | ['remove', string]
  | ['removeBatch', string[]]
  | ['reset'];

interface InstructionPayload {
  v: string;
  ops: SerializedOp[];
}

// --- Base64url ---

export function toBase64url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Serialize/Deserialize ops ---

function serializeOp(op: SnapshotOp): SerializedOp {
  switch (op.type) {
    case 'select': return ['select', op.nodeId];
    case 'reselect': return ['reselect', op.nodeId];
    case 'add': return ['add', op.ids];
    case 'remove': return ['remove', op.id];
    case 'removeBatch': return ['removeBatch', op.ids];
    case 'reset': return ['reset'];
  }
}

function deserializeOp(raw: SerializedOp): SnapshotOp {
  switch (raw[0]) {
    case 'select': return { type: 'select', nodeId: raw[1] };
    case 'reselect': return { type: 'reselect', nodeId: raw[1] };
    case 'add': return { type: 'add', ids: raw[1] };
    case 'remove': return { type: 'remove', id: raw[1] };
    case 'removeBatch': return { type: 'removeBatch', ids: raw[1] };
    case 'reset': return { type: 'reset' };
  }
}

// --- Replay ---

function buildNeighborhood(nodeId: string): Set<string> {
  return buildInitialNeighborhood(nodeId, getParents, getChildren, getNode);
}

function describeOp(op: SnapshotOp): string {
  switch (op.type) {
    case 'select': return `Selected ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'reselect': return `Selected ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'add': return `Added ${op.ids.length} node${op.ids.length === 1 ? '' : 's'}`;
    case 'remove': return `Removed ${getNode(op.id)?.title ?? op.id}`;
    case 'removeBatch': return `Removed ${op.ids.length} node${op.ids.length === 1 ? '' : 's'}`;
    case 'reset': return 'Reset neighborhood';
  }
}

/** Apply a single op to produce new state. */
function applyOp(
  op: SnapshotOp,
  focusNodeId: string | null,
  displayedNodeIds: Set<string>,
): { focusNodeId: string | null; displayedNodeIds: Set<string> } {
  switch (op.type) {
    case 'select':
      return { focusNodeId: op.nodeId, displayedNodeIds: buildNeighborhood(op.nodeId) };
    case 'reselect': {
      const merged = new Set(displayedNodeIds);
      for (const id of buildNeighborhood(op.nodeId)) merged.add(id);
      return { focusNodeId: op.nodeId, displayedNodeIds: merged };
    }
    case 'add': {
      const next = new Set(displayedNodeIds);
      for (const id of op.ids) next.add(id);
      return { focusNodeId, displayedNodeIds: next };
    }
    case 'remove': {
      if (!focusNodeId) return { focusNodeId, displayedNodeIds };
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { focusNodeId, displayedNodeIds: removeNodeWithPruning(sub, op.id, focusNodeId).displayedNodeIds };
    }
    case 'removeBatch': {
      if (!focusNodeId) return { focusNodeId, displayedNodeIds };
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { focusNodeId, displayedNodeIds: removeNodesWithPruning(sub, op.ids, focusNodeId).displayedNodeIds };
    }
    case 'reset': {
      if (!focusNodeId) return { focusNodeId, displayedNodeIds };
      return { focusNodeId, displayedNodeIds: buildNeighborhood(focusNodeId) };
    }
  }
}

/** Replay a sequence of ops, returning only the final state. */
export function replayOps(ops: SnapshotOp[]): {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
} {
  let focusNodeId: string | null = null;
  let displayedNodeIds = new Set<string>();
  for (const op of ops) {
    ({ focusNodeId, displayedNodeIds } = applyOp(op, focusNodeId, displayedNodeIds));
  }
  return { focusNodeId, displayedNodeIds };
}

/** Replay a sequence of ops, returning a Snapshot for each step (full history). */
export function replayOpsToSnapshots(ops: SnapshotOp[]): Snapshot[] {
  const snapshots: Snapshot[] = [];
  let focusNodeId: string | null = null;
  let displayedNodeIds = new Set<string>();

  for (const op of ops) {
    ({ focusNodeId, displayedNodeIds } = applyOp(op, focusNodeId, displayedNodeIds));
    snapshots.push({
      focusNodeId,
      displayedNodeIds: new Set(displayedNodeIds), // defensive copy
      timestamp: Date.now(),
      description: describeOp(op),
      op,
    });
  }

  return snapshots;
}

// --- Encode ---

/** Encode ops for a share URL. Throws if the encoded result exceeds ~2KB. */
export function encodeOps(ops: SnapshotOp[]): string {
  if (ops.length === 0) {
    throw new Error('No operations to encode');
  }
  const release = getGraphRelease();
  const payload: InstructionPayload = {
    v: release ?? 'unknown',
    ops: ops.map(serializeOp),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const encoded = toBase64url(bytes);

  if (encoded.length > 2000) {
    throw new Error(
      `Share URL too long (${encoded.length} chars). ` +
      'Try a shorter exploration history, or reset and re-explore.'
    );
  }

  return encoded;
}

// --- Decode ---

/** Decode a share URL parameter into a full history of snapshots. */
export function decodeSnapshots(encoded: string): Snapshot[] {
  const bytes = fromBase64url(encoded);
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json) as InstructionPayload;

  // Version check
  const currentRelease = getGraphRelease();
  if (currentRelease && payload.v !== currentRelease) {
    console.warn(
      `Share URL was encoded with graph release "${payload.v}" but current graph is "${currentRelease}". ` +
      'Results may differ.'
    );
  }

  if (!payload.ops) {
    throw new Error('Invalid share URL format');
  }

  const ops = payload.ops.map(deserializeOp);
  return replayOpsToSnapshots(ops);
}

// --- URL helpers ---

export function buildShareUrl(ops: SnapshotOp[]): string {
  const encoded = encodeOps(ops);
  const url = new URL(window.location.href);
  // Clear other params, keep only `s`
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  url.searchParams.set('s', encoded);
  return url.toString();
}

export function getSnapshotFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('s');
}

export function clearSnapshotFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('s');
  window.history.replaceState(null, '', url.toString());
}
