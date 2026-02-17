/**
 * React hook wrapping the pure nlHistory logic.
 *
 * Manages state, persists to IndexedDB on change, and restores on init.
 * Undo/redo is via keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) and UI buttons
 * only — no browser history integration.
 *
 * IndexedDB stores ops only — displayedNodeIds is recomputed by replaying ops
 * on restore (same replay used for share URL decode).
 *
 * When saved history exists, exposes a `pendingRestore` object so the UI can
 * show a Resume/Start Fresh modal instead of auto-restoring.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '../state/nlHistory';
import { foundationStore } from '../api/foundationStore';
import { replayOpsToSnapshots } from '../state/snapshotUrl';

export interface PendingRestore {
  focusNodeId: string | null;
  snapshotCount: number;
  description: string;
  resume: () => void;
  startFresh: () => void;
}

interface UseNlHistoryReturn {
  /** Current snapshot (null if history is empty) */
  snapshot: Snapshot | null;
  /** Push a new snapshot (truncates forward history) */
  push: (snapshot: Snapshot) => void;
  /** Replace the entire history (used when loading from share URL) */
  loadSnapshots: (snapshots: Snapshot[], pointer: number) => void;
  /** Go back one step */
  back: () => void;
  /** Go forward one step */
  forward: () => void;
  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
  /** Clear all history */
  clear: () => void;
  /** Whether history has been restored from IndexedDB (or user chose fresh) */
  restored: boolean;
  /** Non-null when saved history exists and user hasn't chosen yet */
  pendingRestore: PendingRestore | null;
  /** True once the IndexedDB check is done (before user chooses resume/fresh) */
  initComplete: boolean;
  /** Ops from snapshots[0..pointer] for URL encoding */
  historyOps: SnapshotOp[];
}

export function useNlHistory(): UseNlHistoryReturn {
  const [history, setHistory] = useState<AppHistory>(createHistory);
  const [restored, setRestored] = useState(false);
  const [initComplete, setInitComplete] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  // Stash pending data until user chooses resume
  const pendingDataRef = useRef<{
    ops: SnapshotOp[];
    pointer: number;
    lastDescription: string;
    lastFocusNodeId: string | null;
  } | null>(null);

  // Check IndexedDB for saved history on mount.
  // We store ops only — replay is deferred until the user chooses "Resume"
  // (which requires the graph to be initialized).
  useEffect(() => {
    foundationStore.getHistory()
      .then(data => {
        if (data && data.snapshots.length > 0) {
          const ops = data.snapshots
            .map(s => s.op)
            .filter((op): op is SnapshotOp => op !== undefined);

          if (ops.length === 0) {
            // Legacy history without ops — can't replay, start fresh
            setRestored(true);
            setInitComplete(true);
            return;
          }

          const lastSnap = data.snapshots[data.pointer] ?? data.snapshots[data.snapshots.length - 1];
          pendingDataRef.current = {
            ops,
            pointer: data.pointer,
            lastDescription: lastSnap?.description ?? 'Previous session',
            lastFocusNodeId: lastSnap?.focusNodeId ?? null,
          };

          setPendingRestore({
            focusNodeId: lastSnap?.focusNodeId ?? null,
            snapshotCount: data.snapshots.length,
            description: lastSnap?.description ?? 'Previous session',
            resume: () => {
              const pending = pendingDataRef.current;
              if (pending) {
                const snapshots = replayOpsToSnapshots(pending.ops);
                const pointer = Math.min(pending.pointer, snapshots.length - 1);
                setHistory(replaceHistory(snapshots, pointer));
                pendingDataRef.current = null;
              }
              setPendingRestore(null);
              setRestored(true);
            },
            startFresh: () => {
              pendingDataRef.current = null;
              foundationStore.clearHistory().catch(() => {});
              setPendingRestore(null);
              setRestored(true);
            },
          });
          setInitComplete(true);
        } else {
          // No saved history — just start fresh
          setRestored(true);
          setInitComplete(true);
        }
      })
      .catch(err => {
        console.warn('Failed to restore NL history from IndexedDB:', err);
        setRestored(true);
        setInitComplete(true);
      });
  }, []);

  // Persist to IndexedDB on every change (fire-and-forget)
  const prevSerializedRef = useRef<string>('');
  useEffect(() => {
    if (!restored) return;
    const serialized = serializeHistory(history);
    const json = JSON.stringify(serialized);
    if (json === prevSerializedRef.current) return;
    prevSerializedRef.current = json;
    foundationStore.putHistory(serialized).catch(err =>
      console.warn('Failed to persist NL history to IndexedDB:', err)
    );
  }, [history, restored]);

  const push = useCallback((snapshot: Snapshot) => {
    setHistory(prev => pushSnapshot(prev, snapshot));
  }, []);

  const loadSnapshots = useCallback((snapshots: Snapshot[], pointer: number) => {
    setHistory(replaceHistory(snapshots, pointer));
  }, []);

  const back = useCallback(() => {
    setHistory(prev => historyUndo(prev));
  }, []);

  const forward = useCallback(() => {
    setHistory(prev => historyRedo(prev));
  }, []);

  const clear = useCallback(() => {
    setHistory(createHistory());
    foundationStore.clearHistory().catch(err =>
      console.warn('Failed to clear NL history from IndexedDB:', err)
    );
  }, []);

  const snapshot = currentSnapshot(history);

  const historyOps: SnapshotOp[] = history.snapshots
    .slice(0, history.pointer + 1)
    .map(s => s.op)
    .filter((op): op is SnapshotOp => op !== undefined);

  return {
    snapshot,
    push,
    loadSnapshots,
    back,
    forward,
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
    clear,
    restored,
    pendingRestore,
    initComplete,
    historyOps,
  };
}
