import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  type ConceptNode,
  type EntityDetail,
  type TreePath,
  initGraph,
  getNode,
  getChildren,
  getParents,
  hasNode,
  getDetail,
  getGraph,
} from '../api/foundationData';
import { type FoundationGraphJson, foundationStore } from '../api/foundationStore';
import { useUrlState } from '../hooks/useUrlState';

export type { ConceptNode, EntityDetail, TreePath };

/** Convert TreePath to string key for Set storage */
export function pathKey(path: TreePath): string {
  return path.join('/');
}

interface GraphContextValue {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  expandedPaths: Set<string>;
  rootId: string | null;
  graphLoading: boolean;
  selectNode: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  toggleExpand: (path: TreePath) => void;
  // Re-export foundationData functions so components use context
  getNode: typeof getNode;
  getChildren: typeof getChildren;
  getParents: typeof getParents;
  hasNode: typeof hasNode;
  getDetail: typeof getDetail;
  getGraph: typeof getGraph;
}

const GraphContext = createContext<GraphContextValue | null>(null);

interface GraphProviderProps {
  children: ReactNode;
}

export function GraphProvider({ children }: GraphProviderProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [rootId, setRootId] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const pendingNodeIdRef = useRef<string | null>(null);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const toggleExpand = useCallback((path: TreePath) => {
    const key = pathKey(path);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /**
   * Navigate to a node: walk up ancestors (all in-memory), expand all path prefixes.
   */
  const navigateToNode = useCallback((targetId: string): void => {
    if (!hasNode(targetId)) return;

    // Walk up first parent chain to root
    const ancestorPath: string[] = [targetId];
    let currentId = targetId;
    const maxDepth = 30;

    for (let i = 0; i < maxDepth; i++) {
      const parents = getParents(currentId);
      if (parents.length === 0) break;
      ancestorPath.unshift(parents[0].id);
      currentId = parents[0].id;
    }

    // Batch-expand all path prefixes
    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (let i = 1; i <= ancestorPath.length; i++) {
        next.add(pathKey(ancestorPath.slice(0, i)));
      }
      return next;
    });

    setSelectedNodeId(targetId);
  }, []);

  /** Handle URL state restoration */
  const handleUrlState = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      setSelectedNodeId(null);
      return;
    }

    if (!rootId) {
      pendingNodeIdRef.current = nodeId;
      return;
    }

    navigateToNode(nodeId);
  }, [rootId, navigateToNode]);

  useUrlState({
    selectedNodeId,
    onUrlState: handleUrlState,
  });

  // Init: load graph from IndexedDB cache or fetch JSON
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Try IndexedDB cache first
        let data = await foundationStore.getGraph();

        if (!data) {
          console.log('Fetching foundation_graph.json...');
          const resp = await fetch(`${import.meta.env.BASE_URL}foundation_graph.json`);
          if (!resp.ok) throw new Error(`Failed to fetch graph: ${resp.status}`);
          data = await resp.json() as FoundationGraphJson;
          // Cache in IndexedDB (fire and forget)
          foundationStore.putGraph(data).catch(err =>
            console.warn('Failed to cache graph in IndexedDB:', err)
          );
        } else {
          console.log('Loaded graph from IndexedDB cache');
        }

        if (cancelled) return;

        initGraph(data);
        setRootId('root');
        setExpandedPaths(new Set(['root']));
        setGraphLoading(false);

        // Handle pending URL navigation
        const pendingNodeId = pendingNodeIdRef.current;
        if (pendingNodeId) {
          pendingNodeIdRef.current = null;
          // Navigate after a tick to let state settle
          setTimeout(() => navigateToNode(pendingNodeId), 0);
        }
      } catch (error) {
        console.error('Failed to load Foundation graph:', error);
        setGraphLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once
  }, []);

  const value: GraphContextValue = {
    selectedNodeId,
    hoveredNodeId,
    expandedPaths,
    rootId,
    graphLoading,
    selectNode,
    setHoveredNodeId,
    toggleExpand,
    getNode,
    getChildren,
    getParents,
    hasNode,
    getDetail,
    getGraph,
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
