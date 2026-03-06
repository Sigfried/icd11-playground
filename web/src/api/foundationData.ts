/**
 * Unified data API for ICD-11 Foundation concepts.
 *
 * Components call these functions — never graphology or IndexedDB directly.
 * Sync functions read from the in-memory graph (available after init).
 * getDetail() checks IndexedDB, then falls back to the ICD-11 API.
 */

import Graph from 'graphology';
import { type FoundationGraphJson, type FoundationGraphNodeEntry, foundationStore } from './foundationStore';
import { type FoundationEntity, getFoundationEntity, getTextValue } from './icd11';

export interface ConceptNode {
  id: string;
  title: string;
  parentCount: number;
  childCount: number;
  childOrder: string[];
  descendantCount: number;
  height: number;   // longest downward path to any leaf (leaf=0)
  depth: number;    // shortest path from root (root=0)
  maxDepth: number; // longest path from root (root=0); differs from depth for polyhierarchy nodes
}

export interface EntityDetail {
  definition?: string;
  longDefinition?: string;
  fullySpecifiedName?: string;
  synonyms: string[];
  narrowerTerms: string[];
  inclusions: string[];
  exclusions: Array<{ label: string; foundationReference?: string }>;
  browserUrl?: string;
}

/** Tree path from root to a node — enables multi-parent expansion */
export type TreePath = string[];

// Module-level graphology instance — created once in initGraph
let graph: Graph<ConceptNode> | null = null;

// Graph release version from _meta (e.g. "2024-01")
let graphRelease: string | null = null;

// Precomputed: sum of all root-to-node path counts across all nodes.
// Represents the total number of tree rows if every node were fully expanded.
let totalTreeRows: number = 0;

// In-flight detail requests to avoid duplicate fetches
const detailInflight = new Map<string, Promise<EntityDetail>>();

/** Initialize the graph from the preloaded JSON data. */
export function initGraph(data: FoundationGraphJson, release?: string): void {
  graph = new Graph<ConceptNode>();
  graphRelease = release ?? null;

  for (const [id, entry] of Object.entries(data)) {
    if (id === '_meta' || !entry) continue;
    const node = entry as FoundationGraphNodeEntry;
    graph.addNode(id, {
      id,
      title: node.title,
      parentCount: node.parents.length,
      childCount: node.children.length,
      childOrder: node.children,
      descendantCount: node.descendantCount,
      height: node.height,
      depth: node.depth,
      maxDepth: node.maxDepth,
    });
  }

  for (const [id, entry] of Object.entries(data)) {
    if (id === '_meta' || !entry) continue;
    const node = entry as FoundationGraphNodeEntry;
    for (const childId of node.children) {
      if (graph.hasNode(childId) && !graph.hasEdge(id, childId)) {
        graph.addEdge(id, childId);
      }
    }
  }

  // Compute totalTreeRows via topological DP:
  // pathsToNode[root] = 1; pathsToNode[v] = Σ pathsToNode[parent of v]
  // totalTreeRows = Σ pathsToNode[v] for all v
  const pathsTo = new Map<string, number>();
  // BFS in topological order (parents before children) using in-degree tracking
  const inDeg = new Map<string, number>();
  graph.forEachNode((id) => { inDeg.set(id, graph!.inDegree(id)); });
  const queue: string[] = [];
  inDeg.forEach((deg, id) => { if (deg === 0) queue.push(id); });
  for (const id of queue) pathsTo.set(id, 1); // roots have 1 path
  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    const myPaths = pathsTo.get(id)!;
    for (const child of graph.outNeighbors(id)) {
      pathsTo.set(child, (pathsTo.get(child) ?? 0) + myPaths);
      const remaining = inDeg.get(child)! - 1;
      inDeg.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
  }
  totalTreeRows = 0;
  pathsTo.forEach(count => { totalTreeRows += count; });

  // Expose for debugging
  (window as unknown as Record<string, unknown>).graph = graph;

  console.log(`Graph initialized: ${graph.order} nodes, ${graph.size} edges, ${totalTreeRows.toLocaleString()} total tree rows`);
}

/** Get the graph release version (e.g. "2024-01"), or null if not set. */
export function getGraphRelease(): string | null {
  return graphRelease;
}

function assertGraph(): Graph<ConceptNode> {
  if (!graph) throw new Error('Graph not initialized — call initGraph() first');
  return graph;
}

// --- Sync reads (safe to call before init — return null/empty/false) ---

export function getNode(id: string): ConceptNode | null {
  if (!graph) return null;
  return graph.hasNode(id) ? graph.getNodeAttributes(id) : null;
}

export function getChildren(id: string): ConceptNode[] {
  if (!graph) return [];
  if (!graph.hasNode(id)) return [];
  const attrs = graph.getNodeAttributes(id);
  return attrs.childOrder
    .filter(childId => graph!.hasNode(childId))
    .map(childId => graph!.getNodeAttributes(childId));
}

export function getParents(id: string): ConceptNode[] {
  if (!graph) return [];
  if (!graph.hasNode(id)) return [];
  return graph.inNeighbors(id).map(parentId => graph!.getNodeAttributes(parentId));
}

export function hasNode(id: string): boolean {
  if (!graph) return false;
  return graph.hasNode(id);
}

/** Escape hatch — NodeLinkView needs the raw graph for ELK layout. */
export function getGraph(): Graph<ConceptNode> {
  return assertGraph();
}

/**
 * In-memory fallback search: case-insensitive substring match on title.
 * Starts-with matches are ranked first.
 */
export function searchNodes(query: string, limit = 200): ConceptNode[] {
  const g = assertGraph();
  const q = query.toLowerCase();
  const startsWith: ConceptNode[] = [];
  const contains: ConceptNode[] = [];

  g.forEachNode((_id, attrs) => {
    if (startsWith.length + contains.length >= limit * 2) return;
    const idx = attrs.title.toLowerCase().indexOf(q);
    if (idx === 0) startsWith.push(attrs);
    else if (idx > 0) contains.push(attrs);
  });

  return [...startsWith.slice(0, limit), ...contains.slice(0, limit - startsWith.length)].slice(0, limit);
}

// --- Path computation ---

/**
 * Compute all distinct root-to-node paths via DFS upward through parents.
 * Each path: [root, ..., grandparent, parent, id].
 * Guards: maxDepth=30, cycle detection via path membership.
 */
export function getPathsToRoot(id: string): TreePath[] {
  const g = assertGraph();
  if (!g.hasNode(id)) return [];

  const results: TreePath[] = [];
  const MAX_DEPTH = 30;

  function dfs(current: string, pathSoFar: string[]): void {
    const parents = g.inNeighbors(current);
    if (parents.length === 0) {
      // Reached root — pathSoFar is already root-first
      results.push(pathSoFar);
      return;
    }
    for (const parentId of parents) {
      if (pathSoFar.includes(parentId)) continue; // cycle guard
      if (pathSoFar.length >= MAX_DEPTH) {
        results.push(pathSoFar);
        continue;
      }
      dfs(parentId, [parentId, ...pathSoFar]);
    }
  }

  dfs(id, [id]);
  return results;
}

/**
 * Sort paths lexicographically by each node's position in its parent's childOrder.
 * Walks from root, finds first divergence point, compares childOrder.indexOf().
 * Shorter path wins on tie (prefix is "earlier").
 */
export function sortPathsInTreeOrder(paths: TreePath[]): TreePath[] {
  const g = assertGraph();
  // Cache childOrder index lookups: parentId -> childId -> index
  const indexCache = new Map<string, Map<string, number>>();
  function childIndex(parentId: string, childId: string): number {
    let parentMap = indexCache.get(parentId);
    if (!parentMap) {
      parentMap = new Map<string, number>();
      const order = g.getNodeAttributes(parentId).childOrder;
      for (let i = 0; i < order.length; i++) parentMap.set(order[i], i);
      indexCache.set(parentId, parentMap);
    }
    return parentMap.get(childId) ?? Infinity;
  }

  return [...paths].sort((a, b) => {
    const len = Math.min(a.length, b.length);
    for (let i = 1; i < len; i++) {
      if (a[i] === b[i]) continue;
      // Parent is a[i-1] (same for both since they haven't diverged yet)
      return childIndex(a[i - 1], a[i]) - childIndex(b[i - 1], b[i]);
    }
    return a.length - b.length;
  });
}

// --- Async detail fetch (IndexedDB-cached) ---

function entityToDetail(entity: FoundationEntity): EntityDetail {
  return {
    definition: getTextValue(entity.definition) || undefined,
    longDefinition: getTextValue(entity.longDefinition) || undefined,
    fullySpecifiedName: getTextValue(entity.fullySpecifiedName) || undefined,
    synonyms: (entity.synonym ?? []).map(s => getTextValue(s)),
    narrowerTerms: (entity.narrowerTerm ?? []).map(t => getTextValue(t)),
    inclusions: (entity.inclusion ?? []).map(i => getTextValue(i)),
    exclusions: (entity.exclusion ?? []).map(e => ({
      label: getTextValue(e.label),
      foundationReference: e.foundationReference,
    })),
    browserUrl: entity.browserUrl,
  };
}

export async function getDetail(id: string): Promise<EntityDetail> {
  // De-duplicate in-flight requests
  const inflight = detailInflight.get(id);
  if (inflight) return inflight;

  const promise = (async () => {
    // Check IndexedDB cache first
    const cached = await foundationStore.getEntity(id);
    if (cached) return entityToDetail(cached);

    // Fetch from API and cache
    const entity = await getFoundationEntity(id);
    // Cache in IndexedDB (fire and forget)
    foundationStore.putEntity(id, entity).catch(err =>
      console.warn('Failed to cache entity in IndexedDB:', err)
    );
    return entityToDetail(entity);
  })();

  detailInflight.set(id, promise);
  promise.finally(() => detailInflight.delete(id));
  return promise;
}
