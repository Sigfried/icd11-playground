/**
 * Tree expansion and navigation slice.
 *
 * Owns: expandedPaths, targetTreePath, tree navigation.
 * Uses foundationData directly for parent lookups.
 */

import type { TreePath } from '../../api/foundationData';
import { getParents, hasNode } from '../../api/foundationData';
import type { SetState, GetState } from '../types';

export { type TreePath };

/** Convert TreePath to string key for Set storage */
export function pathKey(path: TreePath): string {
  return path.join('/');
}

export interface TreeSliceState {
  expandedPaths: Set<string>;
  targetTreePath: TreePath | null;
}

export interface TreeSliceActions {
  setExpandedPaths: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  toggleExpand: (path: TreePath) => void;
  expandParentPaths: (nodeId: string) => void;
  navigateTreeToNode: (targetId: string) => void;
  navigateToTreePath: (path: TreePath) => void;
  clearTargetTreePath: () => void;
}

/**
 * Build first-parent path and expand all prefixes.
 * Shared by navigateTreeToNode and other callers that need tree nav.
 */
export function computeTreeNav(targetId: string, prevExpandedPaths: Set<string>): {
  expandedPaths: Set<string>;
  targetTreePath: TreePath;
} {
  if (!hasNode(targetId)) return { expandedPaths: prevExpandedPaths, targetTreePath: [] };
  const path: string[] = [targetId];
  let currentId = targetId;
  for (let i = 0; i < 30; i++) {
    const parents = getParents(currentId);
    if (parents.length === 0) break;
    path.unshift(parents[0].id);
    currentId = parents[0].id;
  }
  const next = new Set(prevExpandedPaths);
  for (let i = 1; i <= path.length; i++) {
    next.add(pathKey(path.slice(0, i)));
  }
  return { expandedPaths: next, targetTreePath: path };
}

export function createTreeSlice(set: SetState, _get: GetState): TreeSliceState & TreeSliceActions {
  return {
    expandedPaths: new Set<string>(),
    targetTreePath: null,

    setExpandedPaths: (updater) => set(state => ({
      expandedPaths: typeof updater === 'function' ? updater(state.expandedPaths) : updater,
    })),

    toggleExpand: (path) => set(state => {
      const key = pathKey(path);
      const next = new Set(state.expandedPaths);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { expandedPaths: next };
    }),

    expandParentPaths: (nodeId) => set(state => {
      const nodeParents = getParents(nodeId);
      if (nodeParents.length <= 1) return state;
      const next = new Set(state.expandedPaths);
      for (const parent of nodeParents) {
        const ancestorPath: string[] = [parent.id, nodeId];
        let currentId = parent.id;
        for (let i = 0; i < 30; i++) {
          const grandparents = getParents(currentId);
          if (grandparents.length === 0) break;
          ancestorPath.unshift(grandparents[0].id);
          currentId = grandparents[0].id;
        }
        for (let i = 1; i <= ancestorPath.length; i++) {
          next.add(pathKey(ancestorPath.slice(0, i)));
        }
      }
      return { expandedPaths: next };
    }),

    navigateTreeToNode: (targetId) => set(state =>
      computeTreeNav(targetId, state.expandedPaths)
    ),

    navigateToTreePath: (path) => set(state => {
      const next = new Set(state.expandedPaths);
      for (let i = 1; i <= path.length; i++) {
        next.add(pathKey(path.slice(0, i)));
      }
      return { expandedPaths: next, targetTreePath: path };
    }),

    clearTargetTreePath: () => set({ targetTreePath: null }),
  };
}
