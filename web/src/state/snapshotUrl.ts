/**
 * Encode/decode node-link snapshots as compact URL parameters.
 *
 * Two encoding modes:
 * 1. **Instruction replay** (primary) — encodes the sequence of operations that
 *    produced the view. Decoder replays them to reconstruct exact state.
 * 2. **Diff mode** (fallback) — encodes focus node + added/removed IDs relative
 *    to the default neighborhood. Used when instruction sequence > 2KB.
 *
 * URL format: ?s=<base64url-encoded JSON>
 */

import { getNode, getGraph, getChildren, getParents, getGraphRelease } from '../api/foundationData';
import { buildInitialNeighborhood } from './buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning, removeNodesWithPruning } from './nlSubgraph';
import type { SnapshotOp } from './nlHistory';

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

interface DiffPayload {
  v: string;
  f: string;
  a?: string[];
  r?: string[];
}

const MAX_ENCODED_LENGTH = 2000;

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

/** Replay a sequence of ops to reconstruct focus + displayed nodes. */
export function replayOps(ops: SnapshotOp[]): {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
} {
  let focusNodeId: string | null = null;
  let displayedNodeIds = new Set<string>();

  for (const op of ops) {
    switch (op.type) {
      case 'select': {
        focusNodeId = op.nodeId;
        displayedNodeIds = buildNeighborhood(op.nodeId);
        break;
      }
      case 'reselect': {
        focusNodeId = op.nodeId;
        const neighborhood = buildNeighborhood(op.nodeId);
        for (const id of neighborhood) displayedNodeIds.add(id);
        break;
      }
      case 'add': {
        for (const id of op.ids) displayedNodeIds.add(id);
        break;
      }
      case 'remove': {
        if (!focusNodeId) break;
        const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
        ({ displayedNodeIds } = removeNodeWithPruning(sub, op.id, focusNodeId));
        break;
      }
      case 'removeBatch': {
        if (!focusNodeId) break;
        const sub2 = buildNlSubgraph(getGraph(), displayedNodeIds);
        ({ displayedNodeIds } = removeNodesWithPruning(sub2, op.ids, focusNodeId));
        break;
      }
      case 'reset': {
        if (focusNodeId) {
          displayedNodeIds = buildNeighborhood(focusNodeId);
        }
        break;
      }
    }
  }

  return { focusNodeId, displayedNodeIds };
}

// --- Encode ---

function encodeInstructions(ops: SnapshotOp[]): string {
  const release = getGraphRelease();
  const payload: InstructionPayload = {
    v: release ?? 'unknown',
    ops: ops.map(serializeOp),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return toBase64url(bytes);
}

function encodeDiff(
  focusNodeId: string,
  displayedNodeIds: Set<string>,
): string {
  // Filter clusters from displayed
  const realDisplayed = new Set<string>();
  for (const id of displayedNodeIds) {
    if (!id.startsWith('cluster:')) realDisplayed.add(id);
  }

  // Compute base neighborhood
  const base = buildNeighborhood(focusNodeId);
  const realBase = new Set<string>();
  for (const id of base) {
    if (!id.startsWith('cluster:')) realBase.add(id);
  }

  // Compute diff
  const added: string[] = [];
  for (const id of realDisplayed) {
    if (!realBase.has(id)) added.push(id);
  }
  const removed: string[] = [];
  for (const id of realBase) {
    if (!realDisplayed.has(id)) removed.push(id);
  }

  const release = getGraphRelease();
  const payload: DiffPayload = {
    v: release ?? 'unknown',
    f: focusNodeId,
  };
  if (added.length > 0) payload.a = added;
  if (removed.length > 0) payload.r = removed;

  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return toBase64url(bytes);
}

/**
 * Encode a snapshot for sharing. Uses instruction replay by default,
 * falls back to diff encoding if the instruction sequence is too long.
 */
export function encodeSnapshot(
  ops: SnapshotOp[],
  focusNodeId: string | null,
  displayedNodeIds: Set<string>,
): string {
  // Try instruction encoding first
  if (ops.length > 0) {
    const encoded = encodeInstructions(ops);
    if (encoded.length <= MAX_ENCODED_LENGTH) {
      return encoded;
    }
  }

  // Fall back to diff encoding
  if (!focusNodeId) {
    throw new Error('Cannot encode snapshot: no focus node and instruction encoding too long');
  }
  return encodeDiff(focusNodeId, displayedNodeIds);
}

// --- Decode ---

export function decodeSnapshot(encoded: string): {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
} {
  const bytes = fromBase64url(encoded);
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json) as InstructionPayload | DiffPayload;

  // Version check
  const currentRelease = getGraphRelease();
  if (currentRelease && payload.v !== currentRelease) {
    console.warn(
      `Share URL was encoded with graph release "${payload.v}" but current graph is "${currentRelease}". ` +
      'Results may differ.'
    );
  }

  // Detect format by key presence
  if ('ops' in payload) {
    // Instruction replay mode
    const ops = (payload as InstructionPayload).ops.map(deserializeOp);
    return replayOps(ops);
  } else if ('f' in payload) {
    // Diff mode
    const diff = payload as DiffPayload;
    const base = buildNeighborhood(diff.f);

    // Filter clusters from base
    const displayedNodeIds = new Set<string>();
    for (const id of base) {
      if (!id.startsWith('cluster:')) displayedNodeIds.add(id);
    }

    // Apply diff
    if (diff.a) {
      for (const id of diff.a) displayedNodeIds.add(id);
    }
    if (diff.r) {
      for (const id of diff.r) displayedNodeIds.delete(id);
    }

    return { focusNodeId: diff.f, displayedNodeIds };
  }

  throw new Error('Unknown snapshot URL format');
}

// --- URL helpers ---

export function buildShareUrl(
  ops: SnapshotOp[],
  focusNodeId: string | null,
  displayedNodeIds: Set<string>,
): string {
  const encoded = encodeSnapshot(ops, focusNodeId, displayedNodeIds);
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
