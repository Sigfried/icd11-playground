/**
 * Unified data API for ICD-11 Foundation concepts.
 *
 * Components call these functions — never graphology or IndexedDB directly.
 * Sync functions read from the in-memory graph (available after init).
 * getDetail() checks IndexedDB, then falls back to the ICD-11 API.
 */

import Graph from 'graphology';
import { type FoundationGraphJson, foundationStore } from './foundationStore';
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

// Canonical sorted node IDs for compact encoding (built in initGraph)
let sortedNodeIds: string[] = [];
let nodeIdToIndex: Map<string, number> = new Map();

// In-flight detail requests to avoid duplicate fetches
const detailInflight = new Map<string, Promise<EntityDetail>>();

/** Initialize the graph from the preloaded JSON data. */
export function initGraph(data: FoundationGraphJson): void {
  graph = new Graph<ConceptNode>();

  for (const [id, entry] of Object.entries(data)) {
    graph.addNode(id, {
      id,
      title: entry.title,
      parentCount: entry.parents.length,
      childCount: entry.children.length,
      childOrder: entry.children,
      descendantCount: entry.descendantCount,
      height: entry.height,
      depth: entry.depth,
      maxDepth: entry.maxDepth,
    });
  }

  for (const [id, entry] of Object.entries(data)) {
    for (const childId of entry.children) {
      if (graph.hasNode(childId) && !graph.hasEdge(id, childId)) {
        graph.addEdge(id, childId);
      }
    }
  }

  // Build canonical index for snapshot URL encoding
  sortedNodeIds = graph.nodes().sort();
  nodeIdToIndex = new Map(sortedNodeIds.map((id, i) => [id, i]));

  // Expose for debugging
  (window as unknown as Record<string, unknown>).graph = graph;

  console.log(`Graph initialized: ${graph.order} nodes, ${graph.size} edges`);
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

/** Get the canonical index for a node ID (for snapshot URL encoding). */
export function getNodeIndex(id: string): number {
  const idx = nodeIdToIndex.get(id);
  if (idx === undefined) throw new Error(`Unknown node ID: ${id}`);
  return idx;
}

/** Get the node ID for a canonical index (for snapshot URL decoding). */
export function getNodeIdByIndex(index: number): string | null {
  return sortedNodeIds[index] ?? null;
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

// --- Async detail fetch (IndexedDB-cached) ---

function entityToDetail(entity: FoundationEntity): EntityDetail {
  return {
    definition: getTextValue(entity.definition) || undefined,
    longDefinition: getTextValue(entity.longDefinition) || undefined,
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
