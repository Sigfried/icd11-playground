import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type TreePath, type ConceptNode, useGraph, pathKey } from '../providers/GraphProvider';
import { isInputFocused } from '../utils/isInputFocused';
import { Badge } from './Badge';
import { DescendantTooltip } from './DescendantTooltip';
import { TreeSearch } from './TreeSearch';
import { trackRender } from '../utils/renderStormDetector';
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
  const {
    selectedNodeId,
    expandedPaths,
    selectNode,
    toggleExpand,
    expandParentPaths,
    highlightedNodeIds,
    setHighlightedNodeIds,
    helpMode,
    getNode,
    getChildren,
    getParents,
  } = useGraph();
  const descCtx = useContext(DescTooltipContext);
  const searchCtx = useContext(SearchContext);

  const pk = pathKey(path);
  const isExpanded = expandedPaths.has(pk);
  const isSelected = selectedNodeId === nodeId;
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
    isHighlighted && 'highlighted',
    isSearchMatch && 'search-match',
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
  // split with a capturing group alternates: non-match, match, non-match, ...
  // Odd-indexed parts are the matches.
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
  getParents: (id: string) => ConceptNode[],
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [...matchIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const parent of getParents(id)) {
      if (!ancestors.has(parent.id) && !matchIds.has(parent.id)) {
        ancestors.add(parent.id);
        queue.push(parent.id);
      }
    }
  }
  return ancestors;
}

export const TreeView = memo(function TreeView() {
  trackRender('TreeView');
  const {
    rootId, selectedNodeId, hoveredNodeId, graphLoading,
    setExpandedPaths, getParents,
    targetTreePath, clearTargetTreePath, navigateTreeToNode,
  } = useGraph();
  const contentRef = useRef<HTMLDivElement>(null);
  const [descTooltip, setDescTooltip] = useState<DescTooltipState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [filterMatchIds, setFilterMatchIds] = useState<Set<string> | null>(null);
  const [highlightMatchIds, setHighlightMatchIds] = useState<Set<string> | null>(null);
  const [highlightQuery, setHighlightQuery] = useState('');

  // Compute filter ancestors
  const filterAncestorIds = useMemo(() => {
    if (!filterMatchIds) return null;
    return computeFilterAncestors(filterMatchIds, getParents);
  }, [filterMatchIds, getParents]);

  // Auto-expand paths to matches in filter/highlight mode
  useEffect(() => {
    const matchIds = filterMatchIds ?? highlightMatchIds;
    if (!matchIds || matchIds.size === 0) return;

    // Limit auto-expand to prevent performance issues with too many matches
    const MAX_EXPAND = 100;
    const idsToExpand = [...matchIds].slice(0, MAX_EXPAND);

    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (const id of idsToExpand) {
        // Walk up first parent chain and expand all prefixes
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

  // Search callbacks
  const handleFilterChange = useCallback((ids: Set<string> | null, query: string) => {
    setFilterMatchIds(ids);
    // In filter mode, also set the highlight query for title marking
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

  // Scroll to hovered node (from NL diagram hover)
  useEffect(() => {
    if (!hoveredNodeId || !contentRef.current) return;
    // Check if already visible in the DOM
    const existing = contentRef.current.querySelector(`[data-node-id="${CSS.escape(hoveredNodeId)}"]`);
    if (existing) {
      existing.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      // Not visible — expand first-parent chain so it appears
      navigateTreeToNode(hoveredNodeId);
    }
  }, [hoveredNodeId, navigateTreeToNode]);

  // Scroll to targetTreePath when it changes (set by navigateToTreePath)
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
    filterMatchIds,
    filterAncestorIds,
    highlightMatchIds,
    highlightQuery,
  }), [filterMatchIds, filterAncestorIds, highlightMatchIds, highlightQuery]);

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
        <div className="panel-header" data-help-id="tree-view-overview">
          Tree View -- <span className="header-hint">Foundation hierarchy</span>
        </div>
        <TreeSearch
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
      </SearchContext.Provider>
    </DescTooltipContext.Provider>
  );
});

