import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import Graph from 'graphology';
import {
  getFoundationEntity,
  getFoundationRoot,
  extractIdFromUri,
  getTextValue,
  type FoundationEntity,
} from '../api/icd11';
import { useUrlState } from '../hooks/useUrlState';

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

export interface ConceptNode {
  id: string;
  title: string;
  definition?: string;
  parentCount: number;
  childCount: number;
  parentOrder: string[]; // ordered parent IDs from API
  childOrder: string[]; // ordered child IDs from API
  loaded: boolean; // whether children have been fetched
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
  loadParents: (id: string) => Promise<void>;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function useGraph() {
  const context = useContext(GraphContext);
  if (!context) {
    throw new Error('useGraph must be used within a GraphProvider');
  }
  return context;
}

interface GraphProviderProps {
  children: ReactNode;
}

/** Convert TreePath to string key for Set storage */
function pathKey(path: TreePath): string {
  return path.join('/');
}

export function GraphProvider({ children }: GraphProviderProps) {
  const [graph] = useState(() => new Graph<ConceptNode>());
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

  /** Add a node from API response to the graph */
  const addNodeFromEntity = useCallback((entity: FoundationEntity): ConceptNode => {
    const id = extractIdFromUri(entity['@id']);
    const parentOrder = (entity.parent ?? []).map(uri => extractIdFromUri(uri));
    const childOrder = (entity.child ?? []).map(uri => extractIdFromUri(uri));
    const nodeData: ConceptNode = {
      id,
      title: getTextValue(entity.title),
      definition: getTextValue(entity.definition) || getTextValue(entity.longDefinition),
      parentCount: parentOrder.length,
      childCount: childOrder.length,
      parentOrder,
      childOrder,
      loaded: false,
    };

    if (graph.hasNode(id)) {
      graph.mergeNodeAttributes(id, nodeData);
    } else {
      graph.addNode(id, nodeData);
    }

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

  /** Load children for a node */
  const loadChildren = useCallback(async (id: string): Promise<void> => {
    if (graph.hasNode(id) && graph.getNodeAttribute(id, 'loaded')) {
      return; // Already loaded
    }

    try {
      setLoadingNodes(prev => new Set(prev).add(id));

      // Fetch parent entity to get child URIs
      const entity = await getFoundationEntity(id);
      addNodeFromEntity(entity);

      if (entity.child) {
        // Load each child and add edges
        await Promise.all(
          entity.child.map(async (childUri) => {
            const childId = extractIdFromUri(childUri);
            try {
              const childEntity = await getFoundationEntity(childId);
              addNodeFromEntity(childEntity);

              // Add edge parent -> child (if not exists)
              if (!graph.hasEdge(id, childId)) {
                graph.addEdge(id, childId);
              }
            } catch (error) {
              console.error('Failed to load child:', childId, error);
            }
          })
        );
      }

      // Mark as loaded
      graph.setNodeAttribute(id, 'loaded', true);
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
  }, [graph, addNodeFromEntity, incrementVersion]);

  /** Load parents for a node */
  const loadParents = useCallback(async (id: string): Promise<void> => {
    try {
      setLoadingNodes(prev => new Set(prev).add(id));

      const entity = await getFoundationEntity(id);
      addNodeFromEntity(entity);

      if (entity.parent) {
        await Promise.all(
          entity.parent.map(async (parentUri) => {
            const parentId = extractIdFromUri(parentUri);
            try {
              const parentEntity = await getFoundationEntity(parentId);
              addNodeFromEntity(parentEntity);

              // Add edge parent -> child
              if (!graph.hasEdge(parentId, id)) {
                graph.addEdge(parentId, id);
              }
            } catch (error) {
              console.error('Failed to load parent:', parentId, error);
            }
          })
        );
      }

      incrementVersion();
    } catch (error) {
      console.error('Failed to load parents for:', id, error);
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
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
      // Expand - load children if needed
      if (!graph.hasNode(nodeId) || !graph.getNodeAttribute(nodeId, 'loaded')) {
        await loadChildren(nodeId);
      }
      setExpandedPaths(prev => new Set(prev).add(key));
    }
  }, [expandedPaths, graph, loadChildren]);

  /**
   * Navigate to a node: fetch its ancestors, load children along the path,
   * then expand all path prefixes at once to show it in the tree.
   */
  const navigateToNode = useCallback(async (targetId: string): Promise<void> => {
    try {
      // Ensure target node is loaded
      if (!graph.hasNode(targetId) || !graph.getNodeAttribute(targetId, 'title')) {
        const entity = await getFoundationEntity(targetId);
        addNodeFromEntity(entity);
      }

      // Walk parent pointers (already in the graph) to build path from root
      const ancestorPath: string[] = [targetId];
      let currentId = targetId;
      const maxDepth = 20;

      for (let i = 0; i < maxDepth; i++) {
        const parents: string[] = graph.getNodeAttribute(currentId, 'parentOrder');
        if (!parents || parents.length === 0) break;

        // Follow first parent (canonical path)
        const parentId = parents[0];
        ancestorPath.unshift(parentId);

        // Ensure parent node is in the graph
        if (!graph.hasNode(parentId) || !graph.getNodeAttribute(parentId, 'title')) {
          const entity = await getFoundationEntity(parentId);
          addNodeFromEntity(entity);
        }
        currentId = parentId;
      }

      // Load children for each node along the path
      for (const nodeId of ancestorPath) {
        if (!graph.hasNode(nodeId) || !graph.getNodeAttribute(nodeId, 'loaded')) {
          await loadChildren(nodeId);
        }
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

        // Load root's children (the chapters)
        if (rootEntity.child) {
          await Promise.all(
            rootEntity.child.map(async (childUri) => {
              const childId = extractIdFromUri(childUri);
              try {
                const childEntity = await getFoundationEntity(childId);
                if (cancelled) return;
                addNodeFromEntity(childEntity);

                if (!graph.hasEdge(id, childId)) {
                  graph.addEdge(id, childId);
                }
              } catch (error) {
                console.error('Failed to load chapter:', childId, error);
              }
            })
          );
        }

        graph.setNodeAttribute(id, 'loaded', true);
        incrementVersion();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- navigateToNode changes but we only want to run once
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
    loadParents,
  };

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  );
}
