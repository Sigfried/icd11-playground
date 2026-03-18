/**
 * Pure snapshot-based history for the Node-Link view.
 *
 * Ops (SnapshotOp) are the source of truth. Each snapshot's displayedNodeIds
 * is computed by replaying ops and only lives in memory — never persisted.
 * Undo/redo moves the pointer across pre-computed snapshots.
 */

export type SnapshotOp =
  | { type: 'select'; nodeId: string }
  | { type: 'reselect'; nodeId: string }
  | { type: 'add'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'removeBatch'; ids: string[] }
  | { type: 'reset' }
  | { type: 'mode'; mode: 1 | 2 | 3 };

export interface Snapshot {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
  timestamp: number;
  description: string;
  searchQuery?: string;
  op?: SnapshotOp;
}

export interface AppHistory {
  snapshots: Snapshot[];
  pointer: number; // -1 when empty
}

/** Serializable form for IndexedDB storage — ops only, no displayedNodeIds. */
export interface SerializedHistory {
  snapshots: Array<{
    focusNodeId: string | null;
    timestamp: number;
    description: string;
    searchQuery?: string;
    op?: SnapshotOp;
  }>;
  pointer: number;
}

export function createHistory(): AppHistory {
  return { snapshots: [], pointer: -1 };
}

/** Push a new snapshot, truncating any forward history. */
export function pushSnapshot(history: AppHistory, snapshot: Snapshot): AppHistory {
  const snapshots = history.snapshots.slice(0, history.pointer + 1);
  snapshots.push(snapshot);
  return { snapshots, pointer: snapshots.length - 1 };
}

/** Replace the entire history (used when restoring from IndexedDB or URL). */
export function replaceHistory(snapshots: Snapshot[], pointer: number): AppHistory {
  return { snapshots, pointer };
}

export function undo(history: AppHistory): AppHistory {
  if (!canUndo(history)) return history;
  return { ...history, pointer: history.pointer - 1 };
}

export function redo(history: AppHistory): AppHistory {
  if (!canRedo(history)) return history;
  return { ...history, pointer: history.pointer + 1 };
}

export function jumpTo(history: AppHistory, index: number): AppHistory {
  if (index < 0 || index >= history.snapshots.length) return history;
  return { ...history, pointer: index };
}

export function currentSnapshot(history: AppHistory): Snapshot | null {
  if (history.pointer < 0 || history.pointer >= history.snapshots.length) return null;
  return history.snapshots[history.pointer];
}

export function canUndo(history: AppHistory): boolean {
  return history.pointer > 0;
}

export function canRedo(history: AppHistory): boolean {
  return history.pointer < history.snapshots.length - 1;
}

/** Serialize history for IndexedDB — ops only, displayedNodeIds omitted. */
export function serializeHistory(history: AppHistory): SerializedHistory {
  return {
    snapshots: history.snapshots.map(s => ({
      focusNodeId: s.focusNodeId,
      timestamp: s.timestamp,
      description: s.description,
      searchQuery: s.searchQuery,
      op: s.op,
    })),
    pointer: history.pointer,
  };
}
