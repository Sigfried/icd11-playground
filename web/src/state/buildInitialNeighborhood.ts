/**
 * Build the initial neighborhood for a focus node.
 *
 * Returns a Set<string> of displayedNodeIds including:
 * - Ancestor DAG (BFS through all parents, stopping at ANCESTOR_MIN_DEPTH)
 * - Direct parents of focus
 * - Focus node itself
 * - Children (with clustering if > MAX_VISIBLE_CHILDREN)
 *
 * Cluster pseudo-nodes use the convention "cluster:parentId".
 */

import type { ConceptNode } from '../api/foundationData';

const ANCESTOR_MIN_DEPTH = 2; // exclude root (0) and top-level chapters (1)
export const MAX_VISIBLE_CHILDREN = 2;

/**
 * BFS upward through ALL parents from focusId, building a full ancestor DAG.
 * Stops at ANCESTOR_MIN_DEPTH (excludes root and top-level chapters).
 */
function getAncestorDAG(
  focusId: string,
  getParentsFn: (id: string) => ConceptNode[],
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [focusId];
  const visited = new Set<string>([focusId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const parent of getParentsFn(currentId)) {
      if (parent.depth < ANCESTOR_MIN_DEPTH) continue;
      if (visited.has(parent.id)) continue;
      visited.add(parent.id);
      ancestors.add(parent.id);
      queue.push(parent.id);
    }
  }

  if (ancestors.size > 100) {
    console.warn(`Large ancestor DAG: ${ancestors.size} nodes for ${focusId}`);
  }

  return ancestors;
}

/**
 * Build the default neighborhood for a newly selected focus node.
 * Returns a Set<string> of node IDs to display (including cluster pseudo-nodes).
 */
export function buildInitialNeighborhood(
  focusId: string,
  getParentsFn: (id: string) => ConceptNode[],
  getChildrenFn: (id: string) => ConceptNode[],
  getNodeFn: (id: string) => ConceptNode | null,
): Set<string> {
  const nodeIds = new Set<string>();

  function add(id: string) {
    nodeIds.add(id);
  }

  // 1. Full ancestor DAG
  const ancestorIds = getAncestorDAG(focusId, getParentsFn);

  // 2. Add ancestors sorted by depth ascending (shallowest first), then id for stability
  const sortedAncestors = [...ancestorIds].sort((a, b) => {
    const nodeA = getNodeFn(a);
    const nodeB = getNodeFn(b);
    const depthDiff = (nodeA?.depth ?? 0) - (nodeB?.depth ?? 0);
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  });
  for (const id of sortedAncestors) add(id);

  // 3. Direct parents of focus (defensive — should already be in DAG)
  for (const p of getParentsFn(focusId)) {
    if (p.depth >= ANCESTOR_MIN_DEPTH) add(p.id);
  }

  // 4. Focus node
  add(focusId);

  // 5. Children — cluster if too many
  const focusChildren = getChildrenFn(focusId);

  if (focusChildren.length > MAX_VISIBLE_CHILDREN) {
    // Show first N real children, then a cluster for the rest
    for (const c of focusChildren.slice(0, MAX_VISIBLE_CHILDREN)) {
      add(c.id);
    }
    add(`cluster:${focusId}`);
  } else {
    for (const c of focusChildren) add(c.id);
  }

  return nodeIds;
}
