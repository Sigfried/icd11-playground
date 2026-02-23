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
  getPathsToRoot,
} from '../api/foundationData';
import { type FoundationGraphJson, foundationStore } from '../api/foundationStore';
import { useNlHistory, type PendingRestore } from '../hooks/useNlHistory';
import { buildInitialNeighborhood } from '../state/buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning, removeNodesWithPruning } from '../state/nlSubgraph';
import type { Snapshot, SnapshotOp } from '../state/nlHistory';
import { type HelpContent, parseHelpContent } from '../utils/parseHelpContent';
import helpMarkdownRaw from '../assets/help-content.md?raw';
import { getSnapshotFromUrl, decodeSnapshots, clearSnapshotFromUrl, buildShareUrl } from '../state/snapshotUrl';
import type { GraphMeta } from '../api/foundationStore';
import { startHeartbeat, stopHeartbeat } from '../utils/heartbeatMonitor';
import { type CrashCheckpointData, saveCrashCheckpoint, loadCrashCheckpoint, clearCrashCheckpoint, resetCrashCount, incrementCrashCount } from '../utils/crashCheckpoint';
import { registerStateGetter, triggerRecovery } from '../utils/crashRecovery';
import { trackRender } from '../utils/renderStormDetector';

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
  removeNodes: (ids: string[], description: string) => void;
  resetNeighborhood: () => void;
  historyBack: () => void;
  historyForward: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Search query (persisted in snapshot history)
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Cross-panel badge hover highlighting
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  // Resume modal
  pendingRestore: PendingRestore | null;
  // Help mode
  helpMode: boolean;
  toggleHelpMode: () => void;
  exitHelpMode: () => void;
  helpContent: HelpContent;
  activeHelpEntry: { id: string; rect: DOMRect } | null;
  showHelpEntry: (id: string, rect: DOMRect) => void;
  dismissHelpEntry: () => void;
  // Share
  shareCurrentView: () => Promise<boolean>;
  // Crash recovery
  crashCheckpoint: CrashCheckpointData | null;
  crashLoop: boolean;
  restoreCrashCheckpoint: () => void;
  dismissCrashCheckpoint: () => void;
  // Tree navigation
  navigateTreeToNode: (targetId: string) => void;
  targetTreePath: TreePath | null;
  navigateToTreePath: (path: TreePath) => void;
  clearTargetTreePath: () => void;
  // About panel
  showAbout: boolean;
  setShowAbout: (show: boolean) => void;
  // Re-export foundationData functions so components use context
  getNode: typeof getNode;
  getChildren: typeof getChildren;
  getParents: typeof getParents;
  hasNode: typeof hasNode;
  getDetail: typeof getDetail;
  getGraph: typeof getGraph;
  getPathsToRoot: typeof getPathsToRoot;
}

const GraphContext = createContext<GraphContextValue | null>(null);

const EMPTY_SET = new Set<string>();

interface GraphProviderProps {
  children: ReactNode;
}

export function GraphProvider({ children }: GraphProviderProps) {
  trackRender('GraphProvider');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [rootId, setRootId] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  // Cross-panel badge hover highlighting
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

  // Help mode
  const [helpMode, setHelpMode] = useState(false);
  const helpContent = useMemo(() => parseHelpContent(helpMarkdownRaw), []);
  const [activeHelpEntry, setActiveHelpEntry] = useState<{ id: string; rect: DOMRect } | null>(null);

  // About panel
  const [showAbout, setShowAbout] = useState(false);

  // Crash recovery — load checkpoint from sessionStorage on mount
  const [crashCheckpoint, setCrashCheckpoint] = useState<CrashCheckpointData | null>(() => loadCrashCheckpoint());
  const [crashLoop] = useState(() => {
    // If there's a checkpoint, check if we're in a crash loop
    if (loadCrashCheckpoint()) return incrementCrashCount();
    return false;
  });

  // Ref that always holds the latest state for emergency saves (avoids stale closures)
  const stateRef = useRef({
    selectedNodeId: null as string | null,
    displayedNodeIds: [] as string[],
    expandedPaths: [] as string[],
    searchQuery: '',
  });

  const exitHelpMode = useCallback(() => {
    setHelpMode(false);
    setActiveHelpEntry(null);
  }, []);

  const toggleHelpMode = useCallback(() => {
    setHelpMode(prev => {
      if (prev) setActiveHelpEntry(null); // dismiss popover when exiting
      return !prev;
    });
  }, []);

  const showHelpEntry = useCallback((id: string, rect: DOMRect) => {
    setActiveHelpEntry({ id, rect });
  }, []);

  const dismissHelpEntry = useCallback(() => {
    setActiveHelpEntry(null);
  }, []);

  // Snapshot-based NL history
  const {
    snapshot, push, loadSnapshots, back, forward, canUndo, canRedo,
    restored: historyRestored, pendingRestore, initComplete,
    historyOps,
  } = useNlHistory();

  // Derive selectedNodeId from the current snapshot.
  // Guard: don't expose a restored selection until the graph is loaded
  // (rootId is only set after initGraph() succeeds), otherwise components
  // call getNode() before initGraph().
  const graphReady = !graphLoading && rootId !== null;
  const selectedNodeId = graphReady ? (snapshot?.focusNodeId ?? null) : null;
  const displayedNodeIds = graphReady ? (snapshot?.displayedNodeIds ?? EMPTY_SET) : EMPTY_SET;
  const searchQuery = snapshot?.searchQuery ?? '';

  /** Build a snapshot for a new focus node selection. */
  const buildAndPushSnapshot = useCallback((focusId: string, description: string, op?: SnapshotOp) => {
    const nodeIds = buildInitialNeighborhood(focusId, getParents, getChildren, getNode);
    const snap: Snapshot = {
      focusNodeId: focusId,
      displayedNodeIds: nodeIds,
      timestamp: Date.now(),
      description,
      op: op ?? { type: 'select', nodeId: focusId },
    };
    push(snap);
  }, [push]);

  // --- Tree path navigation (targeted scroll) ---
  const [targetTreePath, setTargetTreePath] = useState<TreePath | null>(null);

  const clearTargetTreePath = useCallback(() => {
    setTargetTreePath(null);
  }, []);

  /** Expand all prefixes of a path and set it as the scroll target. */
  const expandAndScrollToPath = useCallback((path: TreePath): void => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (let i = 1; i <= path.length; i++) {
        next.add(pathKey(path.slice(0, i)));
      }
      return next;
    });
    setTargetTreePath(path);
  }, []);

  /** Navigate to a specific tree path: expand all prefixes, set scroll target. */
  const navigateToTreePath = expandAndScrollToPath;

  /**
   * Navigate to a node in the tree: walk up first-parent chain, expand all
   * path prefixes, and set scroll target.
   */
  const navigateTreeToNode = useCallback((targetId: string): void => {
    if (!hasNode(targetId)) return;
    // Build first-parent path: [root, ..., parent, targetId]
    const path: string[] = [targetId];
    let currentId = targetId;
    for (let i = 0; i < 30; i++) {
      const parents = getParents(currentId);
      if (parents.length === 0) break;
      path.unshift(parents[0].id);
      currentId = parents[0].id;
    }
    expandAndScrollToPath(path);
  }, [expandAndScrollToPath]);

  const selectNode = useCallback((id: string | null) => {
    setHighlightedNodeIds(new Set());
    if (!id) {
      // Deselect — no op (share button disabled when empty)
      push({
        focusNodeId: null,
        displayedNodeIds: new Set(),
        timestamp: Date.now(),
        description: 'Deselected',
      });
      return;
    }
    const title = getNode(id)?.title ?? id;

    // If the node is already displayed, merge its neighborhood into the
    // existing set instead of replacing — preserves exploration context.
    if (snapshot && snapshot.displayedNodeIds.has(id)) {
      const newNeighborhood = buildInitialNeighborhood(id, getParents, getChildren, getNode);
      const merged = new Set(snapshot.displayedNodeIds);
      for (const nid of newNeighborhood) merged.add(nid);
      push({
        focusNodeId: id,
        displayedNodeIds: merged,
        timestamp: Date.now(),
        description: `Selected ${title}`,
        op: { type: 'reselect', nodeId: id },
      });
    } else {
      buildAndPushSnapshot(id, `Selected ${title}`);
    }
    navigateTreeToNode(id);
  }, [buildAndPushSnapshot, navigateTreeToNode, push, snapshot]);

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
      op: { type: 'add', ids },
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
      op: { type: 'remove', id },
    });
  }, [snapshot, push]);

  /** Remove multiple nodes with connectivity pruning. */
  const removeNodes = useCallback((ids: string[], description: string) => {
    if (!snapshot || !snapshot.focusNodeId) return;

    // If removing the focus node, clear the view
    if (ids.includes(snapshot.focusNodeId)) {
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
    const { displayedNodeIds: newIds } = removeNodesWithPruning(
      nlSubgraph, ids, snapshot.focusNodeId,
    );

    push({
      focusNodeId: snapshot.focusNodeId,
      displayedNodeIds: newIds,
      timestamp: Date.now(),
      description,
      op: { type: 'removeBatch', ids },
    });
  }, [snapshot, push]);

  /** Reset NL to the default neighborhood for the current focus node. */
  const resetNeighborhood = useCallback(() => {
    if (!snapshot?.focusNodeId) return;
    const title = getNode(snapshot.focusNodeId)?.title ?? snapshot.focusNodeId;
    buildAndPushSnapshot(snapshot.focusNodeId, `Reset neighborhood for ${title}`, { type: 'reset' });
  }, [snapshot, buildAndPushSnapshot]);

  /** Update the search query in snapshot history. */
  const setSearchQuery = useCallback((query: string) => {
    const currentQuery = snapshot?.searchQuery ?? '';
    if (query === currentQuery) return;
    push({
      focusNodeId: snapshot?.focusNodeId ?? null,
      displayedNodeIds: snapshot?.displayedNodeIds ?? new Set(),
      timestamp: Date.now(),
      description: query ? `Search: ${query}` : 'Cleared search',
      searchQuery: query || undefined,
    });
  }, [snapshot, push]);

  // --- Crash recovery callbacks ---
  const restoreCrashCheckpoint = useCallback(() => {
    if (!crashCheckpoint) return;
    // Push a snapshot with the checkpoint's state
    const nodeIds = new Set(crashCheckpoint.displayedNodeIds);
    push({
      focusNodeId: crashCheckpoint.selectedNodeId,
      displayedNodeIds: nodeIds,
      timestamp: Date.now(),
      description: 'Restored from crash',
      searchQuery: crashCheckpoint.searchQuery || undefined,
    });
    // Restore expanded paths
    setExpandedPaths(new Set(crashCheckpoint.expandedPaths));
    // Navigate tree to the focus node
    if (crashCheckpoint.selectedNodeId && hasNode(crashCheckpoint.selectedNodeId)) {
      navigateTreeToNode(crashCheckpoint.selectedNodeId);
    }
    clearCrashCheckpoint();
    setCrashCheckpoint(null);
  }, [crashCheckpoint, push, navigateTreeToNode]);

  const dismissCrashCheckpoint = useCallback(() => {
    clearCrashCheckpoint();
    setCrashCheckpoint(null);
  }, []);

  // Keep stateRef in sync with current state
  useEffect(() => {
    stateRef.current = {
      selectedNodeId: selectedNodeId,
      displayedNodeIds: [...displayedNodeIds],
      expandedPaths: [...expandedPaths],
      searchQuery,
    };
  }, [selectedNodeId, displayedNodeIds, expandedPaths, searchQuery]);

  // Debounced periodic checkpoint save (2s after state changes)
  useEffect(() => {
    if (!graphReady || crashCheckpoint) return; // don't save while showing recovery modal
    const timer = setTimeout(() => {
      saveCrashCheckpoint(stateRef.current);
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedNodeId, displayedNodeIds, expandedPaths, searchQuery, graphReady, crashCheckpoint]);

  // Start heartbeat + register state getter when graph is ready
  useEffect(() => {
    if (!graphReady) return;

    registerStateGetter(() => stateRef.current);
    startHeartbeat(triggerRecovery);

    // If no crash checkpoint, this is a normal startup — reset crash counters
    if (!crashCheckpoint) {
      resetCrashCount();
    }

    return () => { stopHeartbeat(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when graph becomes ready
  }, [graphReady]);

  // --- URL snapshot decode on init ---
  const [urlParam] = useState(() => getSnapshotFromUrl());
  const urlAppliedRef = useRef(false);

  useEffect(() => {
    if (!graphReady || !urlParam || !initComplete || urlAppliedRef.current) return;
    urlAppliedRef.current = true;
    try {
      const snapshots = decodeSnapshots(urlParam);
      if (snapshots.length === 0) return;
      if (pendingRestore) pendingRestore.startFresh();
      loadSnapshots(snapshots, snapshots.length - 1);
      clearSnapshotFromUrl();
    } catch (err) {
      console.warn('Failed to decode snapshot URL:', err);
    }
  }, [graphReady, urlParam, initComplete, pendingRestore, loadSnapshots]);

  // --- Share function ---
  const shareCurrentView = useCallback(async (): Promise<boolean> => {
    if (!snapshot || snapshot.displayedNodeIds.size === 0 || historyOps.length === 0) return false;
    try {
      const url = buildShareUrl(historyOps);
      await navigator.clipboard.writeText(url);
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.includes('too long')) {
        alert(err.message);
      } else {
        console.warn('Failed to copy share URL:', err);
      }
      return false;
    }
  }, [snapshot, historyOps]);

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

        // Extract _meta before passing to initGraph
        const meta = data._meta as GraphMeta | undefined;
        delete data._meta;

        initGraph(data, meta?.release);
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

  // Auto-show About panel on first visit (once graph is loaded and no resume modal)
  useEffect(() => {
    if (!graphReady || pendingRestore) return;
    if (!localStorage.getItem('icd11-hide-about')) {
      setShowAbout(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when graph becomes ready or resume resolves
  }, [graphReady, pendingRestore]);

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
    removeNodes,
    resetNeighborhood,
    historyBack,
    historyForward,
    canUndo,
    canRedo,
    searchQuery,
    setSearchQuery,
    highlightedNodeIds,
    setHighlightedNodeIds,
    pendingRestore,
    helpMode,
    toggleHelpMode,
    exitHelpMode,
    helpContent,
    activeHelpEntry,
    showHelpEntry,
    dismissHelpEntry,
    shareCurrentView,
    crashCheckpoint, crashLoop, restoreCrashCheckpoint, dismissCrashCheckpoint,
    navigateTreeToNode, targetTreePath, navigateToTreePath, clearTargetTreePath,
    showAbout, setShowAbout,
    getNode,
    getChildren,
    getParents,
    hasNode,
    getDetail,
    getGraph,
    getPathsToRoot,
  }), [
    selectedNodeId, hoveredNodeId, expandedPaths, rootId, graphLoading,
    selectNode, navigateTreeToNode, toggleExpand, expandParentPaths,
    displayedNodeIds, expandNodes, removeNode, removeNodes, resetNeighborhood,
    historyBack, historyForward, canUndo, canRedo,
    searchQuery, setSearchQuery,
    highlightedNodeIds, pendingRestore,
    helpMode, toggleHelpMode, exitHelpMode, helpContent, activeHelpEntry, showHelpEntry, dismissHelpEntry,
    shareCurrentView,
    crashCheckpoint, crashLoop, restoreCrashCheckpoint, dismissCrashCheckpoint,
    targetTreePath, navigateToTreePath, clearTargetTreePath,
    showAbout,
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
