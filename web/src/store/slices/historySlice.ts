/**
 * NL history slice.
 *
 * Owns: history state, undo/redo, IndexedDB persistence, pending restore.
 * Does NOT own selectNode — that's in selectionSlice (which pushes snapshots here).
 *
 * Derived state (selectedNodeId, displayedNodeIds, searchQuery, canUndo, canRedo)
 * is eagerly computed and stored whenever history changes.
 */

import {
  type AppHistory,
  type Snapshot,
  type SnapshotOp,
  createHistory,
  pushSnapshot,
  replaceHistory,
  undo as historyUndo,
  redo as historyRedo,
  currentSnapshot,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  serializeHistory,
} from '../../state/nlHistory';
import { foundationStore } from '../../api/foundationStore';
import { hasNode } from '../../api/foundationData';
import { replayOpsToSnapshots } from '../../state/snapshotUrl';
import { computeTreeNav } from './treeSlice';
import type { SetState, GetState } from '../types';

export type { Snapshot, SnapshotOp };

export interface PendingRestore {
  focusNodeId: string | null;
  snapshotCount: number;
  description: string;
  resume: () => void;
  startFresh: () => void;
}

const EMPTY_SET = new Set<string>();

export interface HistorySliceState {
  history: AppHistory;
  historyRestored: boolean;
  historyInitComplete: boolean;
  pendingRestore: PendingRestore | null;

  // Derived (eagerly updated when history changes)
  selectedNodeId: string | null;
  displayedNodeIds: Set<string>;
  searchQuery: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface HistorySliceActions {
  initHistory: () => Promise<void>;
  pushSnapshot: (snapshot: Snapshot) => void;
  historyBack: () => void;
  historyForward: () => void;
  historyOps: () => SnapshotOp[];
  loadSnapshots: (snapshots: Snapshot[], pointer: number) => void;
}

// --- IndexedDB persistence (debounced) ---

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastSerialized = '';

export function persistHistory(get: GetState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { history, historyRestored } = get();
    if (!historyRestored) return;
    const serialized = serializeHistory(history);
    const json = JSON.stringify(serialized);
    if (json === lastSerialized) return;
    lastSerialized = json;
    foundationStore.putHistory(serialized).catch(err =>
      console.warn('Failed to persist NL history to IndexedDB:', err)
    );
  }, 300);
}

/** Compute derived state from history + graph readiness. */
function deriveFromHistory(history: AppHistory, graphReady: boolean): {
  selectedNodeId: string | null;
  displayedNodeIds: Set<string>;
  searchQuery: string;
  canUndo: boolean;
  canRedo: boolean;
} {
  const snapshot = currentSnapshot(history);
  return {
    selectedNodeId: graphReady ? (snapshot?.focusNodeId ?? null) : null,
    displayedNodeIds: graphReady ? (snapshot?.displayedNodeIds ?? EMPTY_SET) : EMPTY_SET,
    searchQuery: snapshot?.searchQuery ?? '',
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
  };
}

/** Set history and its derived state in one batch. */
function setHistoryWithDerived(set: SetState, get: GetState, newHistory: AppHistory): void {
  const { graphLoading, rootId } = get();
  const graphReady = !graphLoading && rootId !== null;
  set({ history: newHistory, ...deriveFromHistory(newHistory, graphReady) });
}

export function createHistorySlice(set: SetState, get: GetState): HistorySliceState & HistorySliceActions {
  return {
    history: createHistory(),
    historyRestored: false,
    historyInitComplete: false,
    pendingRestore: null,

    // Derived (initial)
    selectedNodeId: null,
    displayedNodeIds: EMPTY_SET,
    searchQuery: '',
    canUndo: false,
    canRedo: false,

    initHistory: async () => {
      try {
        const data = await foundationStore.getHistory();
        if (data && data.snapshots.length > 0) {
          const ops = data.snapshots
            .map(s => s.op)
            .filter((op): op is SnapshotOp => op !== undefined);

          if (ops.length === 0) {
            set({ historyRestored: true, historyInitComplete: true });
            return;
          }

          const lastSnap = data.snapshots[data.pointer] ?? data.snapshots[data.snapshots.length - 1];
          const pendingData = { ops, pointer: data.pointer };

          set({
            historyInitComplete: true,
            pendingRestore: {
              focusNodeId: lastSnap?.focusNodeId ?? null,
              snapshotCount: data.snapshots.length,
              description: lastSnap?.description ?? 'Previous session',
              resume: () => {
                const snapshots = replayOpsToSnapshots(pendingData.ops);
                const pointer = Math.min(pendingData.pointer, snapshots.length - 1);
                const newHistory = replaceHistory(snapshots, pointer);
                const snapshot = currentSnapshot(newHistory);
                const focusId = snapshot?.focusNodeId;

                const { graphLoading, rootId } = get();
                const graphReady = !graphLoading && rootId !== null;
                const derived = deriveFromHistory(newHistory, graphReady);

                const updates: Record<string, unknown> = {
                  history: newHistory,
                  pendingRestore: null,
                  historyRestored: true,
                  ...derived,
                };

                if (focusId && hasNode(focusId)) {
                  const nav = computeTreeNav(focusId, get().expandedPaths);
                  updates.expandedPaths = nav.expandedPaths;
                  updates.targetTreePath = nav.targetTreePath;
                }

                set(updates as Partial<import('../types').AppState>);
                persistHistory(get);
              },
              startFresh: () => {
                foundationStore.clearHistory().catch(() => {});
                set({ pendingRestore: null, historyRestored: true });
              },
            },
          });
        } else {
          set({ historyRestored: true, historyInitComplete: true });
        }
      } catch (err) {
        console.warn('Failed to restore NL history from IndexedDB:', err);
        set({ historyRestored: true, historyInitComplete: true });
      }
    },

    pushSnapshot: (snapshot) => {
      const newHistory = pushSnapshot(get().history, snapshot);
      setHistoryWithDerived(set, get, newHistory);
      persistHistory(get);
    },

    historyBack: () => {
      const state = get();
      const newHistory = historyUndo(state.history);
      if (newHistory === state.history) return;
      setHistoryWithDerived(set, get, newHistory);

      const snapshot = currentSnapshot(newHistory);
      if (snapshot?.focusNodeId && hasNode(snapshot.focusNodeId)) {
        const nav = computeTreeNav(snapshot.focusNodeId, get().expandedPaths);
        set(nav);
      }
      persistHistory(get);
    },

    historyForward: () => {
      const state = get();
      const newHistory = historyRedo(state.history);
      if (newHistory === state.history) return;
      setHistoryWithDerived(set, get, newHistory);

      const snapshot = currentSnapshot(newHistory);
      if (snapshot?.focusNodeId && hasNode(snapshot.focusNodeId)) {
        const nav = computeTreeNav(snapshot.focusNodeId, get().expandedPaths);
        set(nav);
      }
      persistHistory(get);
    },

    historyOps: () => {
      const { history } = get();
      return history.snapshots
        .slice(0, history.pointer + 1)
        .map(s => s.op)
        .filter((op): op is SnapshotOp => op !== undefined);
    },

    loadSnapshots: (snapshots, pointer) => {
      const newHistory = replaceHistory(snapshots, pointer);
      setHistoryWithDerived(set, get, newHistory);
      persistHistory(get);
    },
  };
}
