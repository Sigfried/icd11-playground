/**
 * Tree expansion and navigation slice.
 *
 * Uses materialized TreeRow[] from treeData. Expansion is tracked as
 * Set<number> of expanded row indices. Visible rows are computed from
 * the expansion set + DFS order.
 */

import type { TreePath } from '../../api/foundationData';
import { getRowsForNode, getTreeRows, getTreeRow } from '../../api/treeData';
import type { SetState, GetState } from '../types';

export { type TreePath };

/**
 * Expand all ancestors of a row (make it visible).
 * Returns ancestor row indices (excludes self).
 */
function expandAncestors(rowIndex: number): number[] {
  const row = getTreeRow(rowIndex);
  if (!row) return [];
  return row.pathFromRoot.slice(0, -1);
}

/**
 * Compute tree navigation: find the first row for a node, expand its ancestors.
 */
export function computeTreeNav(targetId: string, prevExpandedRows: Set<number>): {
  expandedRows: Set<number>;
  targetRowIndex: number;
} {
  const nodeRows = getRowsForNode(targetId);
  if (nodeRows.length === 0) return { expandedRows: prevExpandedRows, targetRowIndex: -1 };
  const targetRow = nodeRows[0]; // first occurrence
  const ancestors = expandAncestors(targetRow);
  const next = new Set(prevExpandedRows);
  for (const idx of ancestors) next.add(idx);
  return { expandedRows: next, targetRowIndex: targetRow };
}

/** Find the row index matching a TreePath (nodeId[] from root to target). */
export function findRowForPath(path: TreePath): number {
  const rows = getTreeRows();
  if (path.length === 0 || rows.length === 0) return -1;

  // Find root rows for path[0]
  const rootRows = getRowsForNode(path[0]);
  if (rootRows.length === 0) return -1;
  if (path.length === 1) return rootRows[0];

  // For each candidate root row, walk down matching children
  for (const startRow of rootRows) {
    let currentRow = startRow;
    let matched = true;
    for (let p = 1; p < path.length; p++) {
      const parent = rows[currentRow];
      let found = false;
      for (const childIdx of parent.childRowIndices) {
        if (rows[childIdx].nodeId === path[p]) {
          currentRow = childIdx;
          found = true;
          break;
        }
      }
      if (!found) { matched = false; break; }
    }
    if (matched) return currentRow;
  }
  return -1;
}

export interface TreeSliceState {
  expandedRows: Set<number>;
  targetRowIndex: number | null;
}

export interface TreeSliceActions {
  setExpandedRows: (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  toggleExpandRow: (rowIndex: number) => void;
  expandParentPaths: (nodeId: string) => void;
  navigateTreeToNode: (targetId: string) => void;
  navigateToRow: (rowIndex: number) => void;
  navigateToTreePath: (path: TreePath) => void;
  clearTargetRow: () => void;
}

export function createTreeSlice(set: SetState, _get: GetState): TreeSliceState & TreeSliceActions {
  return {
    expandedRows: new Set<number>(),
    targetRowIndex: null,

    setExpandedRows: (updater) => set(state => ({
      expandedRows: typeof updater === 'function' ? updater(state.expandedRows) : updater,
    })),

    toggleExpandRow: (rowIndex) => set(state => {
      const next = new Set(state.expandedRows);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return { expandedRows: next };
    }),

    expandParentPaths: (nodeId) => set(state => {
      const nodeRows = getRowsForNode(nodeId);
      if (nodeRows.length <= 1) return state;
      const next = new Set(state.expandedRows);
      for (const rowIdx of nodeRows) {
        for (const a of expandAncestors(rowIdx)) next.add(a);
      }
      return { expandedRows: next };
    }),

    navigateTreeToNode: (targetId) => set(state =>
      computeTreeNav(targetId, state.expandedRows)
    ),

    navigateToRow: (rowIndex) => set(state => {
      const next = new Set(state.expandedRows);
      for (const a of expandAncestors(rowIndex)) next.add(a);
      return { expandedRows: next, targetRowIndex: rowIndex };
    }),

    navigateToTreePath: (path) => set(state => {
      const rowIndex = findRowForPath(path);
      if (rowIndex === -1) return state;
      const next = new Set(state.expandedRows);
      for (const a of expandAncestors(rowIndex)) next.add(a);
      return { expandedRows: next, targetRowIndex: rowIndex };
    }),

    clearTargetRow: () => set({ targetRowIndex: null }),
  };
}
