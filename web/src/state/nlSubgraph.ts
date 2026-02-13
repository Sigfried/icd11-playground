/**
 * NL subgraph builder and connectivity pruning.
 *
 * The NL subgraph is a subset of the main graph containing only nodes
 * in `displayedNodeIds` plus edges between them. Cluster pseudo-nodes
 * (e.g. "cluster:parentId") are added with a parent edge.
 */

import Graph from 'graphology';
import type { ConceptNode } from '../api/foundationData';

/**
 * Build a subgraph from the main graph containing only nodes in displayedNodeIds
 * plus edges between them. Cluster IDs (matching "cluster:*") are added as nodes
 * with a parent edge from their parent.
 */
export function buildNlSubgraph(
  mainGraph: Graph<ConceptNode>,
  displayedNodeIds: Set<string>,
): Graph<ConceptNode> {
  const sub = new Graph<ConceptNode>();

  // Add real nodes
  for (const id of displayedNodeIds) {
    if (id.startsWith('cluster:')) continue;
    if (mainGraph.hasNode(id)) {
      sub.addNode(id, mainGraph.getNodeAttributes(id));
    }
  }

  // Add edges between real nodes in the subgraph
  sub.forEachNode(id => {
    for (const childId of mainGraph.outNeighbors(id)) {
      if (sub.hasNode(childId) && !sub.hasEdge(id, childId)) {
        sub.addEdge(id, childId);
      }
    }
  });

  // Add cluster pseudo-nodes with a parent edge
  for (const id of displayedNodeIds) {
    if (!id.startsWith('cluster:')) continue;
    const parentId = id.slice('cluster:'.length);
    if (!sub.hasNode(parentId)) continue;
    // Add cluster as a node with minimal attributes
    sub.addNode(id, {
      id,
      title: `Cluster of ${parentId}`,
      parentCount: 1,
      childCount: 0,
      childOrder: [],
      descendantCount: 0,
      height: 0,
      depth: 0,
      maxDepth: 0,
    });
    sub.addEdge(parentId, id);
  }

  return sub;
}

/**
 * Remove a node from the NL subgraph, then BFS from focusNodeId to find
 * reachable nodes. Unreachable nodes are pruned.
 *
 * Returns the new displayedNodeIds set and the count of pruned nodes.
 * Operates entirely on the subgraph — no main graph needed.
 */
export function removeNodeWithPruning(
  nlSubgraph: Graph<ConceptNode>,
  removeId: string,
  focusNodeId: string,
): { displayedNodeIds: Set<string>; prunedCount: number } {
  // Work on a copy so we don't mutate the input
  const sub = nlSubgraph.copy();

  if (!sub.hasNode(removeId)) {
    // Nothing to remove — return current nodes
    const ids = new Set<string>();
    sub.forEachNode(id => ids.add(id));
    return { displayedNodeIds: ids, prunedCount: 0 };
  }

  const originalSize = sub.order;
  sub.dropNode(removeId);

  if (!sub.hasNode(focusNodeId)) {
    // Focus node was removed — everything is gone
    return { displayedNodeIds: new Set(), prunedCount: originalSize };
  }

  // BFS from focusNodeId treating edges as undirected
  const reachable = new Set<string>();
  const queue = [focusNodeId];
  reachable.add(focusNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of sub.neighbors(current)) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Everything not reachable is pruned
  const prunedCount = (sub.order - reachable.size);

  return { displayedNodeIds: reachable, prunedCount };
}
