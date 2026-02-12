import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandParentPaths: (nodeId: string) => void;
  // NL view: manually added nodes beyond default neighborhood
  manualNodeIds: Set<string>;
  addManualNodes: (ids: string[]) => void;
  undoManualNodes: () => void;
  resetManualNodes: () => void;
  // Cross-panel badge hover highlighting
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
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
  const pendingExpandedRef = useRef<string[]>([]);

  // NL view: manually added nodes beyond default neighborhood
  const [manualNodeIds, setManualNodeIds] = useState<Set<string>>(new Set());
  const manualHistoryRef = useRef<Set<string>[]>([]);

  // Cross-panel badge hover highlighting
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    // Reset NL manual expansions and history when selection changes
    setManualNodeIds(new Set());
    manualHistoryRef.current = [];
    setHighlightedNodeIds(new Set());
  }, []);

  const addManualNodes = useCallback((ids: string[]) => {
    setManualNodeIds(prev => {
      manualHistoryRef.current.push(new Set(prev));
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  /**
   * Expand parent paths for a node — for each parent, walk up to root and
   * expand all prefixes so the node is visible at every polyhierarchy location.
   */
  const expandParentPaths = useCallback((nodeId: string) => {
    const nodeParents = getParents(nodeId);
    if (nodeParents.length <= 1) return;

    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (const parent of nodeParents) {
        // Walk up to root from each parent
        const ancestorPath: string[] = [parent.id, nodeId];
        let currentId = parent.id;
        const maxDepth = 30;

        for (let i = 0; i < maxDepth; i++) {
          const grandparents = getParents(currentId);
          if (grandparents.length === 0) break;
          ancestorPath.unshift(grandparents[0].id);
          currentId = grandparents[0].id;
        }

        // Expand all prefixes of this path
        for (let i = 1; i <= ancestorPath.length; i++) {
          next.add(pathKey(ancestorPath.slice(0, i)));
        }
      }
      return next;
    });
  }, []);

  const undoManualNodes = useCallback(() => {
    const history = manualHistoryRef.current;
    if (history.length === 0) return;
    const prev = history.pop()!;
    setManualNodeIds(prev);
  }, []);

  const resetManualNodes = useCallback(() => {
    setManualNodeIds(prev => {
      if (prev.size > 0) manualHistoryRef.current.push(new Set(prev));
      return new Set();
    });
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
  const handleUrlState = useCallback((nodeId: string | null, expandedIds: string[]) => {
    if (!nodeId) {
      setSelectedNodeId(null);
      return;
    }

    if (!rootId) {
      pendingNodeIdRef.current = nodeId;
      pendingExpandedRef.current = expandedIds;
      return;
    }

    navigateToNode(nodeId);
    if (expandedIds.length > 0) {
      setManualNodeIds(new Set(expandedIds));
    }
  }, [rootId, navigateToNode]);

  useUrlState({
    selectedNodeId,
    manualNodeIds,
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
        const pendingExpanded = pendingExpandedRef.current;
        if (pendingNodeId) {
          pendingNodeIdRef.current = null;
          pendingExpandedRef.current = [];
          // Navigate after a tick to let state settle
          setTimeout(() => {
            navigateToNode(pendingNodeId);
            if (pendingExpanded.length > 0) {
              setManualNodeIds(new Set(pendingExpanded));
            }
          }, 0);
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

  const value: GraphContextValue = useMemo(() => ({
    selectedNodeId,
    hoveredNodeId,
    expandedPaths,
    rootId,
    graphLoading,
    selectNode,
    setHoveredNodeId,
    toggleExpand,
    setExpandedPaths,
    expandParentPaths,
    manualNodeIds,
    addManualNodes,
    undoManualNodes,
    resetManualNodes,
    highlightedNodeIds,
    setHighlightedNodeIds,
    getNode,
    getChildren,
    getParents,
    hasNode,
    getDetail,
    getGraph,
  }), [
    selectedNodeId, hoveredNodeId, expandedPaths, rootId, graphLoading,
    selectNode, toggleExpand, expandParentPaths, manualNodeIds, addManualNodes, undoManualNodes, resetManualNodes,
    highlightedNodeIds,
  ]);

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
