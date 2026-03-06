/**
 * Materialized tree array for the Foundation polyhierarchy.
 *
 * Built once at graph init. Every root-to-leaf path is materialized as a
 * sequence of TreeRow entries. Polyhierarchy nodes appear in multiple rows.
 *
 * ~200K rows for ~69K nodes (2.9x inflation from polyhierarchy).
 */

import { getChildren, getGraph } from './foundationData';

/** One row in the materialized tree. */
export interface TreeRow {
  index: number;          // position in treeRows[] (= array index)
  nodeId: string;         // graph node id
  parentIndex: number;    // index of parent row (-1 for root)
  depth: number;          // 0 for root, 1 for children, etc.
  childRowIndices: number[];  // row indices of direct children
  pathFromRoot: number[];     // row indices from root to this row (inclusive)
}

/** Per-node metadata + row lookup. */
export interface NodeEntry {
  rows: number[];         // indices into treeRows[] where this node appears
  title: string;
  parentCount: number;
  childCount: number;
  descendantCount: number;
  maxDepth: number;
  height: number;
  depth: number;
}

// Module-level data — built once in buildTree()
let treeRows: TreeRow[] = [];
let nodeEntries: Map<string, NodeEntry> = new Map();

/** Build the materialized tree. Call after initGraph(). */
export function buildTree(): void {
  const graph = getGraph();
  const rows: TreeRow[] = [];
  const entries = new Map<string, NodeEntry>();

  // Initialize NodeEntry for every node
  graph.forEachNode((id, attrs) => {
    entries.set(id, {
      rows: [],
      title: attrs.title,
      parentCount: attrs.parentCount,
      childCount: attrs.childCount,
      descendantCount: attrs.descendantCount,
      maxDepth: attrs.maxDepth,
      height: attrs.height,
      depth: attrs.depth,
    });
  });

  // DFS from roots, respecting childOrder
  function dfs(nodeId: string, parentRowIndex: number, depth: number, pathFromRoot: number[]): number {
    const rowIndex = rows.length;
    const row: TreeRow = {
      index: rowIndex,
      nodeId,
      parentIndex: parentRowIndex,
      depth,
      childRowIndices: [],
      pathFromRoot: [...pathFromRoot, rowIndex],
    };
    rows.push(row);
    entries.get(nodeId)!.rows.push(rowIndex);

    // Get children in API order
    const children = getChildren(nodeId);
    for (const child of children) {
      const childRowIdx = dfs(child.id, rowIndex, depth + 1, row.pathFromRoot);
      row.childRowIndices.push(childRowIdx);
    }

    return rowIndex;
  }

  // Find roots (nodes with no parents)
  const rootIds: string[] = [];
  graph.forEachNode((id) => {
    if (graph.inDegree(id) === 0) rootIds.push(id);
  });

  for (const rootId of rootIds) {
    dfs(rootId, -1, 0, []);
  }

  treeRows = rows;
  nodeEntries = entries;

  console.log(`Tree materialized: ${rows.length.toLocaleString()} rows, ${entries.size.toLocaleString()} nodes`);
}

// --- Accessors ---

export function getTreeRows(): TreeRow[] {
  return treeRows;
}

export function getNodeEntry(id: string): NodeEntry | undefined {
  return nodeEntries.get(id);
}

export function hasNodeEntry(id: string): boolean {
  return nodeEntries.has(id);
}

export function getTreeRow(index: number): TreeRow | undefined {
  return treeRows[index];
}

/** Total number of materialized rows. */
export function getTotalRows(): number {
  return treeRows.length;
}

/**
 * Compute visible rows given expanded row set.
 * Leverages DFS order: parents always precede children.
 * A row is visible if its parent is both visible AND expanded.
 * Root rows (parentIndex === -1) are always visible.
 */
export function computeVisibleRows(expandedRows: Set<number>): number[] {
  const visible: number[] = [];
  const visibleSet = new Set<number>();

  for (let i = 0; i < treeRows.length; i++) {
    const row = treeRows[i];
    if (row.parentIndex === -1) {
      visible.push(i);
      visibleSet.add(i);
    } else if (visibleSet.has(row.parentIndex) && expandedRows.has(row.parentIndex)) {
      visible.push(i);
      visibleSet.add(i);
    }
  }
  return visible;
}

/**
 * Get all row indices for a given nodeId.
 */
export function getRowsForNode(nodeId: string): number[] {
  return nodeEntries.get(nodeId)?.rows ?? [];
}
