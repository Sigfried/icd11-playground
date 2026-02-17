/**
 * React hook wrapping the pure nlHistory logic.
 *
 * Manages state, persists to IndexedDB on change, and restores on init.
 * Undo/redo is via keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) and UI buttons
 * only — no browser history integration.
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
  undo as historyUndo,
  redo as historyRedo,
  currentSnapshot,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  serializeHistory,
  deserializeHistory,
} from '../state/nlHistory';
import { foundationStore } from '../api/foundationStore';

export interface PendingRestore {
  focusNodeId: string | null;
  displayedCount: number;
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
  // Stash the deserialized history until the user chooses resume
  const pendingHistoryRef = useRef<AppHistory | null>(null);

  // Check IndexedDB for saved history on mount
  useEffect(() => {
    foundationStore.getHistory()
      .then(data => {
        if (data && data.snapshots.length > 0) {
          const restored = deserializeHistory(data);
          const snap = currentSnapshot(restored);
          pendingHistoryRef.current = restored;

          setPendingRestore({
            focusNodeId: snap?.focusNodeId ?? null,
            displayedCount: snap?.displayedNodeIds.size ?? 0,
            snapshotCount: data.snapshots.length,
            description: snap?.description ?? 'Previous session',
            resume: () => {
              if (pendingHistoryRef.current) {
                setHistory(pendingHistoryRef.current);
                pendingHistoryRef.current = null;
              }
              setPendingRestore(null);
              setRestored(true);
            },
            startFresh: () => {
              pendingHistoryRef.current = null;
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
