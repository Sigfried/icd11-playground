/**
 * Pure snapshot-based history for the Node-Link view.
 *
 * `displayedNodeIds` is the single source of truth — no manual/default distinction.
 * All functions are immutable: they return new objects, never mutate.
 */

export interface Snapshot {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
  timestamp: number;
  description: string;
}

export interface AppHistory {
  snapshots: Snapshot[];
  pointer: number; // -1 when empty
}

/** Serializable form for IndexedDB storage (Set → array). */
export interface SerializedHistory {
  snapshots: Array<{
    focusNodeId: string | null;
    displayedNodeIds: string[];
    timestamp: number;
    description: string;
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

export function serializeHistory(history: AppHistory): SerializedHistory {
  return {
    snapshots: history.snapshots.map(s => ({
      focusNodeId: s.focusNodeId,
      displayedNodeIds: [...s.displayedNodeIds],
      timestamp: s.timestamp,
      description: s.description,
    })),
    pointer: history.pointer,
  };
}

export function deserializeHistory(data: SerializedHistory): AppHistory {
  return {
    snapshots: data.snapshots.map(s => ({
      focusNodeId: s.focusNodeId,
      displayedNodeIds: new Set(s.displayedNodeIds),
      timestamp: s.timestamp,
      description: s.description,
    })),
    pointer: data.pointer,
  };
}
