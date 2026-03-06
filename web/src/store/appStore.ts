/**
 * Central Zustand store — replaces GraphProvider.
 *
 * Composes slices and re-exports the public API.
 * Components import from here (useAppState), never from slice files.
 */

import { create } from 'zustand';
import type { AppState } from './types';
import { createGraphSlice } from './slices/graphSlice';
import { createHelpSlice } from './slices/helpSlice';
import { createTreeSlice } from './slices/treeSlice';
import { createHistorySlice } from './slices/historySlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createShareSlice } from './slices/shareSlice';

// Re-export types consumers need
export type { ConceptNode, EntityDetail, TreePath } from '../api/foundationData';
export type { PendingRestore } from './slices/historySlice';
export { pathKey } from './slices/treeSlice';

export const useAppStore = create<AppState>()((set, get) => ({
  ...createGraphSlice(set, get),
  ...createHelpSlice(set, get),
  ...createTreeSlice(set, get),
  ...createHistorySlice(set, get),
  ...createSelectionSlice(set, get),
  ...createShareSlice(set, get),
}));
