/**
 * Share slice — URL sharing and snapshot restore from URL.
 */

import { getSnapshotFromUrl, decodeSnapshots, clearSnapshotFromUrl, buildShareUrl } from '../../state/snapshotUrl';
import { currentSnapshot } from '../../state/nlHistory';
import type { SetState, GetState } from '../types';

export interface ShareSliceState {
  showAbout: boolean;
}

export interface ShareSliceActions {
  setShowAbout: (show: boolean) => void;
  shareCurrentView: () => Promise<boolean>;
  applyUrlSnapshot: () => void;
}

export function createShareSlice(set: SetState, get: GetState): ShareSliceState & ShareSliceActions {
  return {
    showAbout: false,

    setShowAbout: (show) => set({ showAbout: show }),

    shareCurrentView: async () => {
      const state = get();
      const snapshot = currentSnapshot(state.history);
      const ops = state.historyOps();
      if (!snapshot || snapshot.displayedNodeIds.size === 0 || ops.length === 0) return false;
      try {
        const url = buildShareUrl(ops);
        await navigator.clipboard.writeText(url);
        return true;
      } catch (err) {
        if (err instanceof Error && err.message.includes('too long')) {
          alert(err.message);
        } else {
          console.warn('Failed to copy share URL:', err);
        }
        return false;
      }
    },

    applyUrlSnapshot: () => {
      const urlParam = getSnapshotFromUrl();
      if (!urlParam) return;
      const state = get();
      if (!state.historyInitComplete) return;
      try {
        const snapshots = decodeSnapshots(urlParam);
        if (snapshots.length === 0) return;
        if (state.pendingRestore) state.pendingRestore.startFresh();
        state.loadSnapshots(snapshots, snapshots.length - 1);
        set({ historyRestored: true });
        clearSnapshotFromUrl();
      } catch (err) {
        console.warn('Failed to decode snapshot URL:', err);
      }
    },
  };
}
