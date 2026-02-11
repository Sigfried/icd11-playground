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
  maxDepth: number;
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

  // Expose for debugging
  (window as unknown as Record<string, unknown>).graph = graph;

  console.log(`Graph initialized: ${graph.order} nodes, ${graph.size} edges`);
}

function assertGraph(): Graph<ConceptNode> {
  if (!graph) throw new Error('Graph not initialized — call initGraph() first');
  return graph;
}

// --- Sync reads (always available after init) ---

export function getNode(id: string): ConceptNode | null {
  const g = assertGraph();
  return g.hasNode(id) ? g.getNodeAttributes(id) : null;
}

export function getChildren(id: string): ConceptNode[] {
  const g = assertGraph();
  if (!g.hasNode(id)) return [];
  const attrs = g.getNodeAttributes(id);
  return attrs.childOrder
    .filter(childId => g.hasNode(childId))
    .map(childId => g.getNodeAttributes(childId));
}

export function getParents(id: string): ConceptNode[] {
  const g = assertGraph();
  if (!g.hasNode(id)) return [];
  return g.inNeighbors(id).map(parentId => g.getNodeAttributes(parentId));
}

export function hasNode(id: string): boolean {
  return assertGraph().hasNode(id);
}

/** Escape hatch — NodeLinkView needs the raw graph for ELK layout. */
export function getGraph(): Graph<ConceptNode> {
  return assertGraph();
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
