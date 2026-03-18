/**
 * Build the initial neighborhood for a focus node.
 *
 * Returns a Set<string> of displayedNodeIds. Contents depend on the
 * neighborhood mode:
 *   Mode 1: Direct parents + focus + children
 *   Mode 2: Full ancestor DAG + focus + children (default)
 *   Mode 3: Mode 2 + ancestor DAGs for each visible (non-clustered) child
 *
 * Cluster pseudo-nodes use the convention "cluster:parentId".
 */

import type { ConceptNode } from '../api/foundationData';

export type NeighborhoodMode = 1 | 2 | 3;

const ANCESTOR_MIN_DEPTH = 2; // exclude root (0) and top-level chapters (1)

/**
 * Clustering configuration — structured for future user configurability.
 *   clusterThreshold: minimum child count before clustering kicks in.
 *                     If a node has fewer children, show all.
 *   visibleBeforeCluster: how many children to show before the cluster node.
 */
export interface ClusterConfig {
  clusterThreshold: number;
  visibleBeforeCluster: number;
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  clusterThreshold: 6,
  visibleBeforeCluster: 3,
};

/**
 * BFS upward through ALL parents from startId, building a full ancestor DAG.
 * Stops at ANCESTOR_MIN_DEPTH (excludes root and top-level chapters).
 * Skips any IDs already in `exclude` (avoids duplicating work in Mode 3).
 */
export function getAncestorDAG(
  startId: string,
  getParentsFn: (id: string) => ConceptNode[],
  exclude?: Set<string>,
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [startId];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const parent of getParentsFn(currentId)) {
      if (parent.depth < ANCESTOR_MIN_DEPTH) continue;
      if (visited.has(parent.id)) continue;
      visited.add(parent.id);
      if (!exclude?.has(parent.id)) {
        ancestors.add(parent.id);
      }
      queue.push(parent.id);
    }
  }

  return ancestors;
}

/**
 * Add children of a node to the displayedNodeIds set, applying clustering.
 * Returns the IDs of the *visible* (non-clustered) children.
 */
function addChildrenWithClustering(
  parentId: string,
  children: ConceptNode[],
  nodeIds: Set<string>,
  config: ClusterConfig,
): string[] {
  if (children.length === 0) return [];

  if (children.length < config.clusterThreshold) {
    // Few enough children — show all, no cluster
    for (const c of children) nodeIds.add(c.id);
    return children.map(c => c.id);
  }

  // Show first N, cluster the rest
  const visible = children.slice(0, config.visibleBeforeCluster);
  for (const c of visible) nodeIds.add(c.id);
  nodeIds.add(`cluster:${parentId}`);
  return visible.map(c => c.id);
}

/**
 * Build the neighborhood for a newly selected focus node.
 * Returns a Set<string> of node IDs to display (including cluster pseudo-nodes).
 */
export function buildInitialNeighborhood(
  focusId: string,
  getParentsFn: (id: string) => ConceptNode[],
  getChildrenFn: (id: string) => ConceptNode[],
  getNodeFn: (id: string) => ConceptNode | null,
  mode: NeighborhoodMode = 2,
  clusterConfig: ClusterConfig = DEFAULT_CLUSTER_CONFIG,
): Set<string> {
  const nodeIds = new Set<string>();

  // --- Ancestors ---
  if (mode === 1) {
    // Mode 1: direct parents only
    for (const p of getParentsFn(focusId)) {
      if (p.depth >= ANCESTOR_MIN_DEPTH) nodeIds.add(p.id);
    }
  } else {
    // Mode 2 & 3: full ancestor DAG
    const ancestorIds = getAncestorDAG(focusId, getParentsFn);

    // Add ancestors sorted by depth ascending (shallowest first), then id for stability
    const sortedAncestors = [...ancestorIds].sort((a, b) => {
      const nodeA = getNodeFn(a);
      const nodeB = getNodeFn(b);
      const depthDiff = (nodeA?.depth ?? 0) - (nodeB?.depth ?? 0);
      if (depthDiff !== 0) return depthDiff;
      return a.localeCompare(b);
    });
    for (const id of sortedAncestors) nodeIds.add(id);

    // Direct parents (defensive — should already be in DAG)
    for (const p of getParentsFn(focusId)) {
      if (p.depth >= ANCESTOR_MIN_DEPTH) nodeIds.add(p.id);
    }
  }

  // --- Focus node ---
  nodeIds.add(focusId);

  // --- Children (with clustering) ---
  const focusChildren = getChildrenFn(focusId);
  const visibleChildIds = addChildrenWithClustering(
    focusId, focusChildren, nodeIds, clusterConfig,
  );

  // --- Mode 3: ancestor DAGs for visible children ---
  if (mode === 3) {
    for (const childId of visibleChildIds) {
      const childAncestors = getAncestorDAG(childId, getParentsFn, nodeIds);
      for (const id of childAncestors) nodeIds.add(id);
    }
  }

  return nodeIds;
}
