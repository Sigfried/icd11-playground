import {createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState} from 'react';
import Graph from 'graphology';
import {
  extractIdFromUri,
  type FoundationEntity,
  getFoundationEntity,
  getFoundationRoot,
  getTextValue,
} from '../api/icd11';
import {loadAllPathsToRoot} from '../api/graphLoader';
import {useUrlState} from '../hooks/useUrlState';

/**
 * Graph context for ICD-11 Foundation data
 *
 * Uses graphology.js to store the Foundation polyhierarchy.
 * Provides lazy loading of nodes as the user navigates.
 *
 * NOTE: Layout is currently handled by elkjs, but we may switch to
 * Python/igraph backend for better control over hierarchical layouts
 * (forced vertical layering). See icd11-visual-interface-spec.md.
 */

declare global { // for debugging
  interface Window {
    graph: Graph<ConceptNode>;
  }
}

export interface ConceptNode {
  id: string;
  title: string;
  definition?: string;
  parentCount: number;
  childCount: number;
  childOrder: string[]; // ordered child IDs from API
}

/** Tree path from root to a node - enables multi-parent expansion */
export type TreePath = string[];

interface GraphContextValue {
  graph: Graph<ConceptNode>;
  graphVersion: number;
  selectedNodeId: string | null;
  expandedPaths: Set<string>;
  loadingNodes: Set<string>;
  rootId: string | null;
  selectNode: (id: string | null) => void;
  toggleExpand: (path: TreePath) => Promise<void>;
  loadNode: (id: string) => Promise<ConceptNode | null>;
  loadChildren: (id: string) => Promise<void>;
}

const GraphContext = createContext<GraphContextValue | null>(null);

interface GraphProviderProps {
  children: ReactNode;
}

/** Convert TreePath to string key for Set storage */
function pathKey(path: TreePath): string {
  return path.join('/');
}

export function GraphProvider({ children }: GraphProviderProps) {
  const [graph] = useState(() => new Graph<ConceptNode>());
  // for debugging
  window.graph = graph
  const [graphVersion, setGraphVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [rootId, setRootId] = useState<string | null>(null);
  const pendingNodeIdRef = useRef<string | null>(null);

  const incrementVersion = useCallback(() => {
    setGraphVersion(v => v + 1);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  /** Add a node from API response to the graph (memoized — only adds once per ID) */
  const addedNodes = useRef(new Map<string, ConceptNode>());

  const addNodeFromEntity = useCallback((entity: FoundationEntity): ConceptNode => {
    const id = extractIdFromUri(entity['@id']);
    const cached = addedNodes.current.get(id);
    if (cached) return cached;

    const childOrder = (entity.child ?? []).map(uri => extractIdFromUri(uri));
    const nodeData: ConceptNode = {
      id,
      title: getTextValue(entity.title),
      definition: getTextValue(entity.definition) || getTextValue(entity.longDefinition),
      parentCount: entity.parent?.length ?? 0,
      childCount: childOrder.length,
      childOrder,
    };

    if (!graph.hasNode(id)) {
      graph.addNode(id, nodeData);
    }

    addedNodes.current.set(id, nodeData);
    return nodeData;
  }, [graph]);

  /** Load a single node from the API */
  const loadNode = useCallback(async (id: string): Promise<ConceptNode | null> => {
    if (graph.hasNode(id) && graph.getNodeAttribute(id, 'title')) {
      return graph.getNodeAttributes(id);
    }

    try {
      setLoadingNodes(prev => new Set(prev).add(id));
      const entity = await getFoundationEntity(id);
      const node = addNodeFromEntity(entity);
      incrementVersion();
      return node;
    } catch (error) {
      console.error('Failed to load node:', id, error);
      return null;
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [graph, addNodeFromEntity, incrementVersion]);

  /** Load children for a node (memoized — only fetches once per ID) */
  const loadChildrenCache = useRef(new Map<string, Promise<void>>());

  const loadChildren = useCallback((id: string): Promise<void> => {
    const cached = loadChildrenCache.current.get(id);
    if (cached) return cached;

    const promise = (async () => {
      try {
        setLoadingNodes(prev => new Set(prev).add(id));

        const entity = await getFoundationEntity(id);
        addNodeFromEntity(entity);

        if (entity.child) {
          await Promise.all(
            entity.child.map(async (childUri) => {
              const childId = extractIdFromUri(childUri);
              try {
                const childEntity = await getFoundationEntity(childId);
                addNodeFromEntity(childEntity);

                if (!graph.hasEdge(id, childId)) {
                  graph.addEdge(id, childId);
                }
              } catch (error) {
                console.error('Failed to load child:', childId, error);
              }
            })
          );

          // Eager parent path loading for multi-parent children
          const multiParentChildren = (entity.child ?? [])
            .map(uri => extractIdFromUri(uri))
            .filter(childId =>
              graph.hasNode(childId) && graph.getNodeAttribute(childId, 'parentCount') > 1
            );

          if (multiParentChildren.length > 0) {
            Promise.all(multiParentChildren.map(childId => loadAllPathsToRoot(childId, graph, addNodeFromEntity)))
              .then(() => incrementVersion())
              .catch(err => console.error('Failed to load parent paths:', err));
          }
        }

        incrementVersion();
      } catch (error) {
        console.error('Failed to load children for:', id, error);
      } finally {
        setLoadingNodes(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    })();

    loadChildrenCache.current.set(id, promise);
    return promise;
  }, [graph, addNodeFromEntity, incrementVersion]);

  /** Toggle expansion of a tree path */
  const toggleExpand = useCallback(async (path: TreePath): Promise<void> => {
    const key = pathKey(path);
    const nodeId = path[path.length - 1];

    if (expandedPaths.has(key)) {
      // Collapse
      setExpandedPaths(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Expand - load children if needed (loadChildren is memoized, safe to call again)
      await loadChildren(nodeId);
      setExpandedPaths(prev => new Set(prev).add(key));
    }
  }, [expandedPaths, loadChildren]);

  /**
   * Navigate to a node: fetch its ancestors, load children along the path,
   * then expand all path prefixes at once to show it in the tree.
   */
  const navigateToNode = useCallback(async (targetId: string): Promise<void> => {
    try {
      // Fetch ancestors up to the root
      const ancestorPath: string[] = [targetId];
      let currentId = targetId;
      const maxDepth = 20;

      for (let i = 0; i < maxDepth; i++) {
        const entity = await getFoundationEntity(currentId);
        addNodeFromEntity(entity);

        if (!entity.parent || entity.parent.length === 0) break;

        const parentId = extractIdFromUri(entity.parent[0]);
        ancestorPath.unshift(parentId);
        currentId = parentId;
      }

      // Load children for each node along the path (loadChildren is memoized)
      for (const nodeId of ancestorPath) {
        await loadChildren(nodeId);
      }

      // Batch-expand all path prefixes at once (avoids stale closure issues)
      setExpandedPaths(prev => {
        const next = new Set(prev);
        for (let i = 1; i <= ancestorPath.length; i++) {
          next.add(pathKey(ancestorPath.slice(0, i)));
        }
        return next;
      });

      setSelectedNodeId(targetId);
    } catch (error) {
      console.error('Failed to navigate to node:', targetId, error);
    }
  }, [addNodeFromEntity, graph, loadChildren]);

  /** Handle URL state restoration */
  const handleUrlState = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      setSelectedNodeId(null);
      return;
    }

    // Store for later if root hasn't loaded yet
    if (!rootId) {
      pendingNodeIdRef.current = nodeId;
      return;
    }

    // Navigate to the node
    navigateToNode(nodeId);
  }, [rootId, navigateToNode]);

  // URL state sync
  useUrlState({
    selectedNodeId,
    onUrlState: handleUrlState,
  });

  // Initial load: fetch Foundation root and its children
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        console.log('Loading Foundation root...');
        const rootEntity = await getFoundationRoot();
        if (cancelled) return;

        const rootNode = addNodeFromEntity(rootEntity);
        const id = rootNode.id;
        setRootId(id);

        // Load root's children (the chapters) via memoized loadChildren
        await loadChildren(id);

        // Auto-expand root
        setExpandedPaths(new Set([id]));

        console.log('Foundation loaded:', graph.order, 'nodes');

        // Handle pending URL navigation
        const pendingNodeId = pendingNodeIdRef.current;
        if (pendingNodeId) {
          pendingNodeIdRef.current = null;
          // Navigate after a tick to let state settle
          setTimeout(() => navigateToNode(pendingNodeId), 0);
        }
      } catch (error) {
        console.error('Failed to load Foundation root:', error);
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- navigateToNode/loadChildren change but we only want to run once
  }, [graph, addNodeFromEntity, incrementVersion]);

  const value: GraphContextValue = {
    graph,
    graphVersion,
    selectedNodeId,
    expandedPaths,
    loadingNodes,
    rootId,
    selectNode,
    toggleExpand,
    loadNode,
    loadChildren,
  };

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph() {
  const context = useContext(GraphContext);
  if (!context) {
    throw new Error('useGraph must be used within a GraphProvider');
  }
  return context;
}