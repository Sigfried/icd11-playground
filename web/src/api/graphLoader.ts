import Graph from 'graphology';
import {
  extractIdFromUri,
  type FoundationEntity,
  getFoundationEntity,
} from './icd11';
import type {ConceptNode} from '../providers/GraphProvider';

type AddNodeFn = (entity: FoundationEntity) => ConceptNode;

/**
 * Recursively load all paths to root for a node.
 * Memoized by node ID — second calls return the original promise.
 */
const pathCache = new Map<string, Promise<void>>();

export function loadAllPathsToRoot(
  id: string,
  graph: Graph<ConceptNode>,
  addNodeFromEntity: AddNodeFn,
): Promise<void> {
  const cached = pathCache.get(id);
  if (cached) return cached;

  const promise = (async () => {
    const entity = await getFoundationEntity(id);
    addNodeFromEntity(entity);

    if (!entity.parent || entity.parent.length === 0) return;

    await Promise.all(
      entity.parent.map(async (parentUri) => {
        const parentId = extractIdFromUri(parentUri);
        const parentEntity = await getFoundationEntity(parentId);
        addNodeFromEntity(parentEntity);

        if (!graph.hasEdge(parentId, id)) {
          graph.addEdge(parentId, id);
        }

        await loadAllPathsToRoot(parentId, graph, addNodeFromEntity);
      })
    );
  })();

  pathCache.set(id, promise);
  return promise;
}
