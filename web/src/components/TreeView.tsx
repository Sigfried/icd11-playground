import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type TreePath, type ConceptNode, pathKey } from '../store/appStore';
import { getTotalTreeRows } from '../api/foundationData';
import { isInputFocused } from '../utils/isInputFocused';
import { Badge } from './Badge';
import { DescendantTooltip } from './DescendantTooltip';
import { TreeStatsPopover } from './TreeStatsPopover';
import { type SearchMode, TreeSearch, FilterIcon } from './TreeSearch';

/** Branching-down tree icon (14×14) */
const TreeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="7" y1="2" x2="7" y2="6" />
    <line x1="7" y1="6" x2="3" y2="10" />
    <line x1="7" y1="6" x2="11" y2="10" />
    <circle cx="7" cy="2" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="10.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
import './TreeView.css';

/**
 * Indented Tabular View (Primary Navigation)
 *
 * Renders the Foundation polyhierarchy as a tree where concepts with
 * multiple parents appear multiple times. All instances reference the
 * same underlying object.
 *
 * Key features (per spec):
 * - [N↑] parent count badge on each node
 * - [N↓] child count badge on each node
 * - Instant expand/collapse (full graph in memory)
 * - Search with highlight and filter modes
 *
 * See icd11-visual-interface-spec.md for full requirements.
 */

/** Descendant tooltip state (shared via context to avoid prop drilling) */
interface DescTooltipState {
  nodeId: string;
  path: TreePath;
  anchorRect: DOMRect;
}

interface DescTooltipCtx {
  tooltip: DescTooltipState | null;
  show: (state: DescTooltipState) => void;
  hide: () => void;
  scheduleHide: () => void;
  cancelHide: () => void;
}

const DescTooltipContext = createContext<DescTooltipCtx>({
  tooltip: null,
  show: () => {},
  hide: () => {},
  scheduleHide: () => {},
  cancelHide: () => {},
});

/** Search state shared with TreeNode via context */
interface SearchCtx {
  filterMatchIds: Set<string> | null;
  filterAncestorIds: Set<string> | null;
  highlightMatchIds: Set<string> | null;
  highlightQuery: string;
}

const SearchContext = createContext<SearchCtx>({
  filterMatchIds: null,
  filterAncestorIds: null,
  highlightMatchIds: null,
  highlightQuery: '',
});

interface TreeNodeProps {
  nodeId: string;
  path: TreePath;
  depth: number;
}

function TreeNode({ nodeId, path, depth }: TreeNodeProps) {
  const selectedNodeId = useAppStore(s => s.selectedNodeId);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);
  const expandedPaths = useAppStore(s => s.expandedPaths);
  const selectNode = useAppStore(s => s.selectNode);
  const toggleExpand = useAppStore(s => s.toggleExpand);
  const expandParentPaths = useAppStore(s => s.expandParentPaths);
  const highlightedNodeIds = useAppStore(s => s.highlightedNodeIds);
  const setHighlightedNodeIds = useAppStore(s => s.setHighlightedNodeIds);
  const helpMode = useAppStore(s => s.helpMode);
  const getNode = useAppStore(s => s.getNode);
  const getChildren = useAppStore(s => s.getChildren);
  const getParents = useAppStore(s => s.getParents);
  const descCtx = useContext(DescTooltipContext);
  const searchCtx = useContext(SearchContext);

  const pk = pathKey(path);
  const isExpanded = expandedPaths.has(pk);
  const isSelected = selectedNodeId === nodeId;
  const isHovered = hoveredNodeId === nodeId;
  const isHighlighted = highlightedNodeIds.has(nodeId);

  // Search state
  const isFilterActive = searchCtx.filterMatchIds !== null;
  const isFilterMatch = searchCtx.filterMatchIds?.has(nodeId) ?? false;
  const isFilterAncestor = searchCtx.filterAncestorIds?.has(nodeId) ?? false;
  const isSearchMatch = searchCtx.highlightMatchIds?.has(nodeId) ?? false;

  const nodeData: ConceptNode | null = getNode(nodeId);
  const hasChildren = (nodeData?.childCount ?? 0) > 0;

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpand(path);
  }, [path, toggleExpand]);

  const handleSelectClick = useCallback(() => {
    selectNode(nodeId);
  }, [nodeId, selectNode]);

  // Badge click handlers
  const handleParentBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    expandParentPaths(nodeId);
  }, [nodeId, expandParentPaths]);

  const handleChildBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpand(path);
  }, [path, toggleExpand]);

  const handleDescendantBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (descCtx.tooltip?.nodeId === nodeId) {
      descCtx.hide();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    descCtx.show({ nodeId, path, anchorRect: rect });
  }, [nodeId, path, descCtx]);

  const handleDescendantBadgeHover = useCallback((e: React.MouseEvent) => {
    if (helpMode) return;
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getChildren(nodeId).map(c => c.id)));
    descCtx.cancelHide();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    descCtx.show({ nodeId, path, anchorRect: rect });
  }, [nodeId, path, getChildren, setHighlightedNodeIds, descCtx, helpMode]);

  const handleDescendantBadgeLeave = useCallback(() => {
    setHighlightedNodeIds(new Set());
    descCtx.scheduleHide();
  }, [setHighlightedNodeIds, descCtx]);

  // Badge hover handlers for cross-panel highlighting
  const handleParentHover = useCallback((e: React.MouseEvent) => {
    if (helpMode) return;
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getParents(nodeId).map(p => p.id)));
  }, [nodeId, getParents, setHighlightedNodeIds, helpMode]);

  const handleChildHover = useCallback((e: React.MouseEvent) => {
    if (helpMode) return;
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getChildren(nodeId).map(c => c.id)));
  }, [nodeId, getChildren, setHighlightedNodeIds, helpMode]);

  const handleBadgeLeave = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, [setHighlightedNodeIds]);

  // In filter mode, skip nodes that are neither matches nor ancestors
  if (isFilterActive && !isFilterMatch && !isFilterAncestor) {
    return null;
  }

  if (!nodeData) {
    return (
      <div className="tree-node loading" style={{ paddingLeft: depth * 20 }}>
        <span className="tree-node-expand">⋯</span>
        <span className="tree-node-title">Loading...</span>
      </div>
    );
  }

  // Get children in API order (all in memory)
  const childNodes = isExpanded ? getChildren(nodeId) : [];

  const nodeClasses = [
    'tree-node',
    isSelected && 'selected',
    isHovered && 'hovered',
    isHighlighted && 'highlighted',
    (isSearchMatch || isFilterMatch) && 'search-match',
    isFilterActive && !isFilterMatch && isFilterAncestor && 'filter-ancestor',
  ].filter(Boolean).join(' ');

  // Render title with search highlighting in filter/highlight modes
  const titleContent = (isSearchMatch || isFilterMatch) && searchCtx.highlightQuery
    ? highlightTitle(nodeData.title, searchCtx.highlightQuery)
    : nodeData.title;

  return (
    <div className="tree-node-container">
      <div
        className={nodeClasses}
        data-node-id={nodeId}
        data-path-key={pk}
        data-help-id="tree-node"
        style={{ paddingLeft: depth * 20 }}
        onClick={handleSelectClick}
      >
        <span
          className="tree-node-expand"
          onClick={handleExpandClick}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </span>
        <span className="tree-node-title" title={nodeData.title}>
          {typeof titleContent === 'string'
            ? titleContent
            : titleContent}
        </span>
        <span className="tree-node-badges">
          <span className="badge-slot">
            {nodeData.parentCount > 1 && (
              <Badge
                type="parents"
                count={nodeData.parentCount}
                onClick={handleParentBadgeClick}
                onMouseEnter={handleParentHover}
                onMouseLeave={handleBadgeLeave}
              />
            )}
          </span>
          <span className="badge-slot">
            {nodeData.childCount > 0 && (
              <Badge
                type="children"
                count={nodeData.childCount}
                onClick={handleChildBadgeClick}
                onMouseEnter={handleChildHover}
                onMouseLeave={handleBadgeLeave}
              />
            )}
          </span>
          <span className="badge-slot badge-slot-wide">
            {nodeData.descendantCount > nodeData.childCount && (
              <Badge
                type="descendants"
                count={nodeData.descendantCount}
                onClick={handleDescendantBadgeClick}
                onMouseEnter={handleDescendantBadgeHover}
                onMouseLeave={handleDescendantBadgeLeave}
              />
            )}
          </span>
        </span>
      </div>

      {isExpanded && childNodes.length > 0 && (
        <div className="tree-children">
          {childNodes.map(child => (
            <TreeNode
              key={`${pk}/${child.id}`}
              nodeId={child.id}
              path={[...path, child.id]}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Highlight query matches in a title — returns React elements with <mark> tags */
function highlightTitle(title: string, query: string): React.ReactNode {
  if (!query) return title;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = title.split(re);
  if (parts.length === 1) return title;
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i}>{part}</mark> : part
  );
}

/**
 * Compute ancestor IDs for all match IDs (BFS upward through all parents).
 * Polyhierarchy-aware: follows all parent edges.
 */
function computeFilterAncestors(
  matchIds: Set<string>,
  getParentsFn: (id: string) => ConceptNode[],
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [...matchIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const parent of getParentsFn(id)) {
      if (!ancestors.has(parent.id) && !matchIds.has(parent.id)) {
        ancestors.add(parent.id);
        queue.push(parent.id);
      }
    }
  }
  return ancestors;
}

export const TreeView = memo(function TreeView() {
  const rootId = useAppStore(s => s.rootId);
  const selectedNodeId = useAppStore(s => s.selectedNodeId);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);
  const graphLoading = useAppStore(s => s.graphLoading);
  const setExpandedPaths = useAppStore(s => s.setExpandedPaths);
  const getNode = useAppStore(s => s.getNode);
  const getParents = useAppStore(s => s.getParents);
  const displayedNodeIds = useAppStore(s => s.displayedNodeIds);
  const targetTreePath = useAppStore(s => s.targetTreePath);
  const clearTargetTreePath = useAppStore(s => s.clearTargetTreePath);
  const contentRef = useRef<HTMLDivElement>(null);
  const [descTooltip, setDescTooltip] = useState<DescTooltipState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search mode (persistent)
  const [searchMode, setSearchMode] = useState<SearchMode>(
    () => (localStorage.getItem('icd11-tree-mode') as SearchMode) || 'search'
  );
  const handleSetSearchMode = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
    localStorage.setItem('icd11-tree-mode', mode);
  }, []);

  // Search state
  const [filterMatchIds, setFilterMatchIds] = useState<Set<string> | null>(null);
  const [highlightMatchIds, setHighlightMatchIds] = useState<Set<string> | null>(null);
  const [highlightQuery, setHighlightQuery] = useState('');

  // Combine search filter results with selection-based filtering.
  const effectiveFilterMatchIds = useMemo(() => {
    if (searchMode !== 'filter') return null;
    if (filterMatchIds) return filterMatchIds;
    if (selectedNodeId) return new Set([selectedNodeId]);
    return null;
  }, [searchMode, filterMatchIds, selectedNodeId]);

  // Compute filter ancestors
  const filterAncestorIds = useMemo(() => {
    if (!effectiveFilterMatchIds) return null;
    return computeFilterAncestors(effectiveFilterMatchIds, getParents);
  }, [effectiveFilterMatchIds, getParents]);

  // Auto-expand paths to matches in search-driven filter/highlight mode.
  useEffect(() => {
    const matchIds = filterMatchIds ?? highlightMatchIds;
    if (!matchIds || matchIds.size === 0) return;

    const MAX_EXPAND = 100;
    const idsToExpand = [...matchIds].slice(0, MAX_EXPAND);

    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (const id of idsToExpand) {
        const ancestorPath: string[] = [id];
        let currentId = id;
        for (let i = 0; i < 30; i++) {
          const parents = getParents(currentId);
          if (parents.length === 0) break;
          ancestorPath.unshift(parents[0].id);
          currentId = parents[0].id;
        }
        for (let i = 1; i <= ancestorPath.length; i++) {
          next.add(pathKey(ancestorPath.slice(0, i)));
        }
      }
      return next;
    });
  }, [filterMatchIds, highlightMatchIds, getParents, setExpandedPaths]);

  // Pre-expand tree paths for all NL-displayed nodes so hover only needs to scroll.
  useEffect(() => {
    if (displayedNodeIds.size === 0) return;

    setExpandedPaths(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const id of displayedNodeIds) {
        const ancestorPath: string[] = [id];
        let currentId = id;
        for (let i = 0; i < 30; i++) {
          const parents = getParents(currentId);
          if (parents.length === 0) break;
          ancestorPath.unshift(parents[0].id);
          currentId = parents[0].id;
        }
        for (let i = 1; i <= ancestorPath.length; i++) {
          const key = pathKey(ancestorPath.slice(0, i));
          if (!prev.has(key)) {
            next.add(key);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [displayedNodeIds, getParents, setExpandedPaths]);

  // Search callbacks
  const handleFilterChange = useCallback((ids: Set<string> | null, query: string) => {
    setFilterMatchIds(ids);
    if (ids) {
      setHighlightQuery(query);
    } else {
      setHighlightMatchIds(prev => {
        if (!prev) setHighlightQuery('');
        return prev;
      });
    }
  }, []);

  const handleHighlightChange = useCallback((ids: Set<string> | null, query: string) => {
    setHighlightMatchIds(ids);
    setHighlightQuery(query);
  }, []);

  // Scroll the selected node into view when selection changes
  useEffect(() => {
    if (!selectedNodeId || !contentRef.current) return;
    requestAnimationFrame(() => {
      const el = contentRef.current?.querySelector(`[data-node-id="${selectedNodeId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedNodeId]);

  // Scroll to hovered node (from NL diagram hover).
  useEffect(() => {
    if (!hoveredNodeId || !contentRef.current) return;
    const el = contentRef.current.querySelector(`[data-node-id="${CSS.escape(hoveredNodeId)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hoveredNodeId]);

  // Scroll to targetTreePath when it changes
  useEffect(() => {
    if (!targetTreePath || !contentRef.current) return;
    const pk = pathKey(targetTreePath);
    requestAnimationFrame(() => {
      const el = contentRef.current?.querySelector(`[data-path-key="${CSS.escape(pk)}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      clearTargetTreePath();
    });
  }, [targetTreePath, clearTargetTreePath]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    cancelHide();
    setDescTooltip(null);
  }, [cancelHide]);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => setDescTooltip(null), 150);
  }, [cancelHide]);

  const descCtxValue: DescTooltipCtx = {
    tooltip: descTooltip,
    show: (state) => { cancelHide(); setDescTooltip(state); },
    hide,
    scheduleHide,
    cancelHide,
  };

  const searchCtxValue: SearchCtx = useMemo(() => ({
    filterMatchIds: effectiveFilterMatchIds,
    filterAncestorIds,
    highlightMatchIds,
    highlightQuery,
  }), [effectiveFilterMatchIds, filterAncestorIds, highlightMatchIds, highlightQuery]);

  // --- Stats popover ---
  const [statsAnchor, setStatsAnchor] = useState<DOMRect | null>(null);

  const handleStatsClick = useCallback((e: React.MouseEvent) => {
    if (statsAnchor) { setStatsAnchor(null); return; }
    setStatsAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
  }, [statsAnchor]);

  const dismissStats = useCallback(() => setStatsAnchor(null), []);

  const visibleStats = useMemo(() => {
    if (!statsAnchor || !contentRef.current) return { rows: 0, unique: 0 };
    const els = contentRef.current.querySelectorAll('[data-node-id]');
    const ids = new Set<string>();
    els.forEach(el => {
      const id = el.getAttribute('data-node-id');
      if (id) ids.add(id);
    });
    return { rows: els.length, unique: ids.size };
  }, [statsAnchor]);

  const totalConcepts = getNode('root')?.descendantCount ?? 0;

  const filterNote = useMemo(() => {
    if (searchMode !== 'filter') return null;
    if (filterMatchIds && highlightQuery) {
      return `Filtered to ${filterMatchIds.size.toLocaleString()} search matches for "${highlightQuery}"`;
    }
    if (selectedNodeId && !filterMatchIds) {
      const name = getNode(selectedNodeId)?.title ?? selectedNodeId;
      return `Filtered to ancestors of ${name}`;
    }
    return null;
  }, [searchMode, filterMatchIds, highlightQuery, selectedNodeId, getNode]);

  // Global keyboard shortcut: Ctrl+F or / to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const input = document.querySelector<HTMLInputElement>('[data-tree-search-input]');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      }
      if (e.key === '/' && !isInputFocused()) {
        const input = document.querySelector<HTMLInputElement>('[data-tree-search-input]');
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <DescTooltipContext.Provider value={descCtxValue}>
      <SearchContext.Provider value={searchCtxValue}>
        <div className="panel-header tree-header" data-help-id="tree-view-overview">
          <span>Tree View -- <span className="header-hint">Foundation hierarchy</span></span>
          <button
            className={`tree-stats-btn${statsAnchor ? ' active' : ''}`}
            onClick={handleStatsClick}
            title="Tree statistics"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="6" />
              <line x1="7" y1="6" x2="7" y2="10" />
              <circle cx="7" cy="4.2" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <div className="tree-mode-toggle">
            <button
              className={`tree-mode-btn${searchMode === 'search' ? ' active' : ''}`}
              onClick={() => handleSetSearchMode('search')}
              title="Full tree (highlight search matches)"
            >
              <TreeIcon /> Tree
            </button>
            <button
              className={`tree-mode-btn${searchMode === 'filter' ? ' active' : ''}`}
              onClick={() => handleSetSearchMode('filter')}
              title="Filter view (show only matches and ancestors)"
            >
              <FilterIcon /> Filter
            </button>
          </div>
        </div>
        <TreeSearch
          mode={searchMode}
          onFilterChange={handleFilterChange}
          onHighlightChange={handleHighlightChange}
        />
        <div className="panel-content tree-content" ref={contentRef}>
          {graphLoading ? (
            <div className="placeholder">Loading Foundation...</div>
          ) : rootId ? (
            <TreeNode nodeId={rootId} path={[rootId]} depth={0} />
          ) : (
            <div className="placeholder">Failed to load Foundation</div>
          )}
        </div>
        {descTooltip && (
          <DescendantTooltip
            nodeId={descTooltip.nodeId}
            path={descTooltip.path}
            anchorRect={descTooltip.anchorRect}
            onClose={hide}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          />
        )}
        {statsAnchor && (
          <TreeStatsPopover
            anchorRect={statsAnchor}
            onDismiss={dismissStats}
            totalConcepts={totalConcepts}
            totalTreeRows={getTotalTreeRows()}
            visibleRows={visibleStats.rows}
            visibleUnique={visibleStats.unique}
            filterNote={filterNote}
          />
        )}
      </SearchContext.Provider>
    </DescTooltipContext.Provider>
  );
});
