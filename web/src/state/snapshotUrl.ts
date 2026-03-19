/**
 * Encode/decode node-link snapshots as compact URL parameters.
 *
 * Encodes the sequence of operations (SnapshotOp) that produced the view.
 * Decoder replays them to reconstruct full history with undo/redo support.
 *
 * URL format: ?s=<base64url-encoded JSON>
 */

import { getNode, getGraph, getChildren, getParents, getGraphRelease } from '../api/foundationData';
import { buildInitialNeighborhood, getAncestorDAG, type NeighborhoodMode } from './buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning, removeNodesWithPruning } from './nlSubgraph';
import type { Snapshot, SnapshotOp } from './nlHistory';

/** Compact serialized op: [type, ...params] */
type SerializedOp =
  | ['select', string]
  | ['reselect', string]
  | ['add', string[]]
  | ['addChildren', string]
  | ['addParents', string]
  | ['addDescThrough', string, number]
  | ['remove', string]
  | ['removeChildren', string]
  | ['removeParents', string]
  | ['removeBatch', string[]]  // legacy, still deserializable
  | ['reset']
  | ['mode', number];

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
    case 'addChildren': return ['addChildren', op.nodeId];
    case 'addParents': return ['addParents', op.nodeId];
    case 'addDescThrough': return ['addDescThrough', op.nodeId, op.depth];
    case 'remove': return ['remove', op.id];
    case 'removeBatch': return ['removeBatch', op.ids]; // legacy compat
    case 'removeChildren': return ['removeChildren', op.nodeId];
    case 'removeParents': return ['removeParents', op.nodeId];
    case 'reset': return ['reset'];
    case 'mode': return ['mode', op.mode];
  }
}

function deserializeOp(raw: SerializedOp): SnapshotOp {
  switch (raw[0]) {
    case 'select': return { type: 'select', nodeId: raw[1] };
    case 'reselect': return { type: 'reselect', nodeId: raw[1] };
    case 'add': return { type: 'add', ids: raw[1] };
    case 'addChildren': return { type: 'addChildren', nodeId: raw[1] };
    case 'addParents': return { type: 'addParents', nodeId: raw[1] };
    case 'addDescThrough': return { type: 'addDescThrough', nodeId: raw[1], depth: raw[2] };
    case 'remove': return { type: 'remove', id: raw[1] };
    case 'removeChildren': return { type: 'removeChildren', nodeId: raw[1] };
    case 'removeParents': return { type: 'removeParents', nodeId: raw[1] };
    case 'removeBatch': return { type: 'removeBatch', ids: raw[1] }; // legacy compat
    case 'reset': return { type: 'reset' };
    case 'mode': return { type: 'mode', mode: raw[1] as NeighborhoodMode };
  }
}

// --- Replay ---

const MODE_LABELS: Record<NeighborhoodMode, string> = {
  1: 'Parents + Children',
  2: 'Ancestors + Children',
  3: 'Ancestors + Children + Child Ancestors',
};

function buildNeighborhood(nodeId: string, mode: NeighborhoodMode): Set<string> {
  return buildInitialNeighborhood(nodeId, getParents, getChildren, getNode, mode);
}

/** BFS descendants through N depth levels. */
function getDescendantsThrough(nodeId: string, depth: number): string[] {
  const result: string[] = [];
  let frontier = [nodeId];
  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const child of getChildren(id)) {
        result.push(child.id);
        nextFrontier.push(child.id);
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

function describeOp(op: SnapshotOp): string {
  switch (op.type) {
    case 'select': return `Selected ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'reselect': return `Selected ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'add': return `Added ${op.ids.length} node${op.ids.length === 1 ? '' : 's'}`;
    case 'addChildren': return `Added children of ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'addParents': return `Added parents of ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'addDescThrough': return `Added descendants of ${getNode(op.nodeId)?.title ?? op.nodeId} through depth ${op.depth}`;
    case 'remove': return `Removed ${getNode(op.id)?.title ?? op.id}`;
    case 'removeBatch': return `Removed ${op.ids.length} node${op.ids.length === 1 ? '' : 's'}`;
    case 'removeChildren': return `Removed children of ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'removeParents': return `Removed parents of ${getNode(op.nodeId)?.title ?? op.nodeId}`;
    case 'reset': return 'Reset neighborhood';
    case 'mode': return `Mode: ${MODE_LABELS[op.mode]}`;
  }
}

interface ReplayState {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
  mode: NeighborhoodMode;
}

/** Add IDs to a set, plus ancestor DAGs if mode is 3. */
function addIdsWithMode3(ids: string[], existing: Set<string>, mode: NeighborhoodMode): Set<string> {
  const next = new Set(existing);
  for (const id of ids) next.add(id);
  if (mode === 3) {
    for (const id of ids) {
      if (!existing.has(id)) {
        for (const aid of getAncestorDAG(id, getParents, next)) next.add(aid);
      }
    }
  }
  return next;
}

/** Apply a single op to produce new state. */
function applyOp(op: SnapshotOp, state: ReplayState): ReplayState {
  const { focusNodeId, displayedNodeIds, mode } = state;
  switch (op.type) {
    case 'select':
      return { ...state, focusNodeId: op.nodeId, displayedNodeIds: buildNeighborhood(op.nodeId, mode) };
    case 'reselect': {
      const merged = new Set(displayedNodeIds);
      for (const id of buildNeighborhood(op.nodeId, mode)) merged.add(id);
      return { ...state, focusNodeId: op.nodeId, displayedNodeIds: merged };
    }
    case 'add': {
      const next = addIdsWithMode3(op.ids, displayedNodeIds, mode);
      return { ...state, displayedNodeIds: next };
    }
    case 'addChildren': {
      const childIds = getChildren(op.nodeId).map(c => c.id);
      return { ...state, displayedNodeIds: addIdsWithMode3(childIds, displayedNodeIds, mode) };
    }
    case 'addParents': {
      const parentIds = getParents(op.nodeId).map(p => p.id);
      return { ...state, displayedNodeIds: addIdsWithMode3(parentIds, displayedNodeIds, mode) };
    }
    case 'addDescThrough': {
      const descIds = getDescendantsThrough(op.nodeId, op.depth);
      return { ...state, displayedNodeIds: addIdsWithMode3(descIds, displayedNodeIds, mode) };
    }
    case 'remove': {
      if (!focusNodeId) return state;
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { ...state, displayedNodeIds: removeNodeWithPruning(sub, op.id, focusNodeId).displayedNodeIds };
    }
    case 'removeBatch': {
      if (!focusNodeId) return state;
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { ...state, displayedNodeIds: removeNodesWithPruning(sub, op.ids, focusNodeId).displayedNodeIds };
    }
    case 'removeChildren': {
      if (!focusNodeId) return state;
      const childIds = getChildren(op.nodeId).map(c => c.id);
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { ...state, displayedNodeIds: removeNodesWithPruning(sub, childIds, focusNodeId).displayedNodeIds };
    }
    case 'removeParents': {
      if (!focusNodeId) return state;
      const parentIds = getParents(op.nodeId).map(p => p.id);
      const sub = buildNlSubgraph(getGraph(), displayedNodeIds);
      return { ...state, displayedNodeIds: removeNodesWithPruning(sub, parentIds, focusNodeId).displayedNodeIds };
    }
    case 'reset': {
      if (!focusNodeId) return state;
      return { ...state, displayedNodeIds: buildNeighborhood(focusNodeId, mode) };
    }
    case 'mode': {
      const newMode = op.mode;
      if (!focusNodeId) return { ...state, mode: newMode };
      return { ...state, mode: newMode, displayedNodeIds: buildNeighborhood(focusNodeId, newMode) };
    }
  }
}

/** Replay a sequence of ops, returning only the final state. */
export function replayOps(ops: SnapshotOp[]): {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
  mode: NeighborhoodMode;
} {
  let state: ReplayState = { focusNodeId: null, displayedNodeIds: new Set(), mode: 2 };
  for (const op of ops) {
    state = applyOp(op, state);
  }
  return state;
}

/** Replay a sequence of ops, returning a Snapshot for each step (full history). */
export function replayOpsToSnapshots(ops: SnapshotOp[]): Snapshot[] {
  const snapshots: Snapshot[] = [];
  let state: ReplayState = { focusNodeId: null, displayedNodeIds: new Set(), mode: 2 };

  for (const op of ops) {
    state = applyOp(op, state);
    snapshots.push({
      focusNodeId: state.focusNodeId,
      displayedNodeIds: new Set(state.displayedNodeIds), // defensive copy
      neighborhoodMode: state.mode,
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
