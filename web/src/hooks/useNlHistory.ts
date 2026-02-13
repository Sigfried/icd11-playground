/**
 * React hook wrapping the pure nlHistory logic.
 *
 * Manages state, persists to IndexedDB on change, and restores on init.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AppHistory,
  type Snapshot,
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
  /** Whether history has been restored from IndexedDB */
  restored: boolean;
}

export function useNlHistory(): UseNlHistoryReturn {
  const [history, setHistory] = useState<AppHistory>(createHistory);
  const [restored, setRestored] = useState(false);
  // Ref to avoid stale closure in persist effect
  const historyRef = useRef(history);
  historyRef.current = history;

  // Restore from IndexedDB on mount
  useEffect(() => {
    foundationStore.getHistory()
      .then(data => {
        if (data) {
          setHistory(deserializeHistory(data));
        }
        setRestored(true);
      })
      .catch(err => {
        console.warn('Failed to restore NL history from IndexedDB:', err);
        setRestored(true);
      });
  }, []);

  // Persist to IndexedDB on every change (fire-and-forget)
  const prevSerializedRef = useRef<string>('');
  useEffect(() => {
    if (!restored) return;
    const serialized = serializeHistory(history);
    const json = JSON.stringify(serialized);
    // Skip write if nothing changed (avoids IDB churn on restore)
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

  return {
    snapshot,
    push,
    back,
    forward,
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
    clear,
    restored,
  };
}
