import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { useNlHistory } from '../hooks/useNlHistory';
import { buildInitialNeighborhood } from '../state/buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning } from '../state/nlSubgraph';
import type { Snapshot } from '../state/nlHistory';

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
  // NL view: snapshot-based displayed nodes
  displayedNodeIds: Set<string>;
  expandNodes: (ids: string[], description: string) => void;
  removeNode: (id: string) => void;
  resetNeighborhood: () => void;
  historyBack: () => void;
  historyForward: () => void;
  canUndo: boolean;
  canRedo: boolean;
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

const EMPTY_SET = new Set<string>();

interface GraphProviderProps {
  children: ReactNode;
}

export function GraphProvider({ children }: GraphProviderProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [rootId, setRootId] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  // Cross-panel badge hover highlighting
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

  // Snapshot-based NL history
  const {
    snapshot, push, back, forward, canUndo, canRedo, restored: historyRestored,
  } = useNlHistory();

  // Derive selectedNodeId from the current snapshot.
  // Guard: don't expose a restored selection until the graph is loaded
  // (rootId is only set after initGraph() succeeds), otherwise components
  // call getNode() before initGraph().
  const graphReady = !graphLoading && rootId !== null;
  const selectedNodeId = graphReady ? (snapshot?.focusNodeId ?? null) : null;
  const displayedNodeIds = graphReady ? (snapshot?.displayedNodeIds ?? EMPTY_SET) : EMPTY_SET;

  /** Build a snapshot for a new focus node selection. */
  const buildAndPushSnapshot = useCallback((focusId: string, description: string) => {
    const nodeIds = buildInitialNeighborhood(focusId, getParents, getChildren, getNode);
    const snap: Snapshot = {
      focusNodeId: focusId,
      displayedNodeIds: nodeIds,
      timestamp: Date.now(),
      description,
    };
    push(snap);
  }, [push]);

  /**
   * Navigate to a node in the tree: walk up ancestors (all in-memory), expand all path prefixes.
   */
  const navigateTreeToNode = useCallback((targetId: string): void => {
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
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setHighlightedNodeIds(new Set());
    if (!id) {
      // Push empty snapshot
      push({
        focusNodeId: null,
        displayedNodeIds: new Set(),
        timestamp: Date.now(),
        description: 'Deselected',
      });
      return;
    }
    const title = getNode(id)?.title ?? id;
    buildAndPushSnapshot(id, `Selected ${title}`);
    navigateTreeToNode(id);
  }, [buildAndPushSnapshot, navigateTreeToNode, push]);

  /** Add nodes to the current displayed set. */
  const expandNodes = useCallback((ids: string[], description: string) => {
    if (!snapshot) return;
    const next = new Set(snapshot.displayedNodeIds);
    for (const id of ids) next.add(id);
    push({
      focusNodeId: snapshot.focusNodeId,
      displayedNodeIds: next,
      timestamp: Date.now(),
      description,
    });
  }, [snapshot, push]);

  /** Remove a node. If it's the focus node, clear the view. Otherwise BFS prune. */
  const removeNode = useCallback((id: string) => {
    if (!snapshot || !snapshot.focusNodeId) return;

    if (id === snapshot.focusNodeId) {
      push({
        focusNodeId: null,
        displayedNodeIds: new Set(),
        timestamp: Date.now(),
        description: 'Removed focus node',
      });
      return;
    }

    const mainGraph = getGraph();
    const nlSubgraph = buildNlSubgraph(mainGraph, snapshot.displayedNodeIds);
    const { displayedNodeIds: newIds, prunedCount } = removeNodeWithPruning(
      nlSubgraph, id, snapshot.focusNodeId,
    );

    const title = getNode(id)?.title ?? id;
    const desc = prunedCount > 0
      ? `Removed ${title} (+${prunedCount} pruned)`
      : `Removed ${title}`;

    push({
      focusNodeId: snapshot.focusNodeId,
      displayedNodeIds: newIds,
      timestamp: Date.now(),
      description: desc,
    });
  }, [snapshot, push]);

  /** Reset NL to the default neighborhood for the current focus node. */
  const resetNeighborhood = useCallback(() => {
    if (!snapshot?.focusNodeId) return;
    const title = getNode(snapshot.focusNodeId)?.title ?? snapshot.focusNodeId;
    buildAndPushSnapshot(snapshot.focusNodeId, `Reset neighborhood for ${title}`);
  }, [snapshot, buildAndPushSnapshot]);

  const historyBack = useCallback(() => { back(); }, [back]);
  const historyForward = useCallback(() => { forward(); }, [forward]);

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

  // When undo/redo changes the focus node, also expand the tree to show it
  const prevFocusRef = useMemo(() => ({ current: selectedNodeId }), []);
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevFocusRef.current && rootId) {
      navigateTreeToNode(selectedNodeId);
    }
    prevFocusRef.current = selectedNodeId;
  }, [selectedNodeId, rootId, navigateTreeToNode, prevFocusRef]);

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
      } catch (error) {
        console.error('Failed to load Foundation graph:', error);
        setGraphLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once
  }, []);

  // After graph loads + history restored: expand tree to the restored focus node
  useEffect(() => {
    if (!rootId || !historyRestored) return;
    if (selectedNodeId && hasNode(selectedNodeId)) {
      navigateTreeToNode(selectedNodeId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on restore
  }, [rootId, historyRestored]);

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
    displayedNodeIds,
    expandNodes,
    removeNode,
    resetNeighborhood,
    historyBack,
    historyForward,
    canUndo,
    canRedo,
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
    selectNode, toggleExpand, expandParentPaths,
    displayedNodeIds, expandNodes, removeNode, resetNeighborhood,
    historyBack, historyForward, canUndo, canRedo,
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
