import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type ConceptNode } from '../store/appStore';
import { getTreeRow, getRowsForNode, getTotalRows } from '../api/treeData';
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
 * - Dropdown search (results in dropdown, click to select)
 * - Filter mode (show only selected node and ancestors)
 *
 * See icd11-visual-interface-spec.md for full requirements.
 */

/** Descendant tooltip state (shared via context to avoid prop drilling) */
interface DescTooltipState {
  nodeId: string;
  rowIndex: number;
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

/** Filter state shared with TreeNode via context */
interface FilterCtx {
  filterMatchIds: Set<string> | null;
  filterAncestorIds: Set<string> | null;
}

const FilterContext = createContext<FilterCtx>({
  filterMatchIds: null,
  filterAncestorIds: null,
});

interface TreeNodeProps {
  rowIndex: number;
  insideFilterMatch?: boolean;
}

function TreeNode({ rowIndex, insideFilterMatch }: TreeNodeProps) {
  const selectedNodeId = useAppStore(s => s.selectedNodeId);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);
  const expandedRows = useAppStore(s => s.expandedRows);
  const selectNode = useAppStore(s => s.selectNode);
  const toggleExpandRow = useAppStore(s => s.toggleExpandRow);
  const expandParentPaths = useAppStore(s => s.expandParentPaths);
  const highlightedNodeIds = useAppStore(s => s.highlightedNodeIds);
  const setHighlightedNodeIds = useAppStore(s => s.setHighlightedNodeIds);
  const helpMode = useAppStore(s => s.helpMode);
  const getNode = useAppStore(s => s.getNode);
  const getChildren = useAppStore(s => s.getChildren);
  const getParents = useAppStore(s => s.getParents);
  const descCtx = useContext(DescTooltipContext);
  const filterCtx = useContext(FilterContext);

  const row = getTreeRow(rowIndex);
  if (!row) return null;

  const { nodeId, depth } = row;
  const isExpanded = expandedRows.has(rowIndex);
  const isSelected = selectedNodeId === nodeId;
  const isHovered = hoveredNodeId === nodeId;
  const isHighlighted = highlightedNodeIds.has(nodeId);

  // Filter state
  const isFilterActive = filterCtx.filterMatchIds !== null;
  const isFilterMatch = filterCtx.filterMatchIds?.has(nodeId) ?? false;
  const isFilterAncestor = filterCtx.filterAncestorIds?.has(nodeId) ?? false;

  const nodeData: ConceptNode | null = getNode(nodeId);
  const hasChildren = (nodeData?.childCount ?? 0) > 0;

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpandRow(rowIndex);
  }, [rowIndex, toggleExpandRow]);

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
    toggleExpandRow(rowIndex);
  }, [rowIndex, toggleExpandRow]);

  const handleDescendantBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (descCtx.tooltip?.nodeId === nodeId) {
      descCtx.hide();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    descCtx.show({ nodeId, rowIndex, anchorRect: rect });
  }, [nodeId, rowIndex, descCtx]);

  const handleDescendantBadgeHover = useCallback((e: React.MouseEvent) => {
    if (helpMode) return;
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getChildren(nodeId).map(c => c.id)));
    descCtx.cancelHide();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    descCtx.show({ nodeId, rowIndex, anchorRect: rect });
  }, [nodeId, rowIndex, getChildren, setHighlightedNodeIds, descCtx, helpMode]);

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

  // In filter mode, skip nodes that aren't matches, ancestors of matches,
  // or expanded descendants of a match
  if (isFilterActive && !isFilterMatch && !isFilterAncestor && !insideFilterMatch) {
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

  const nodeClasses = [
    'tree-node',
    isSelected && 'selected',
    isHovered && 'hovered',
    isHighlighted && 'highlighted',
    isFilterActive && !isFilterMatch && (isFilterAncestor || insideFilterMatch) && 'filter-ancestor',
  ].filter(Boolean).join(' ');

  return (
    <div className="tree-node-container">
      <div
        className={nodeClasses}
        data-node-id={nodeId}
        data-row-index={rowIndex}
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
          {nodeData.title}
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

      {isExpanded && row.childRowIndices.length > 0 && (
        <div className="tree-children">
          {row.childRowIndices.map(childIdx => (
            <TreeNode
              key={childIdx}
              rowIndex={childIdx}
              insideFilterMatch={insideFilterMatch || isFilterMatch}
            />
          ))}
        </div>
      )}
    </div>
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

/**
 * Expand ancestor rows for a set of node IDs.
 * For each node, finds its first row occurrence and adds all ancestor row indices.
 */
function expandAncestorRowsForNodes(nodeIds: Iterable<string>, prev: Set<number>, maxNodes: number): Set<number> {
  const next = new Set(prev);
  let changed = false;
  let count = 0;
  for (const id of nodeIds) {
    if (count >= maxNodes) break;
    count++;
    const rows = getRowsForNode(id);
    if (rows.length === 0) continue;
    const row = getTreeRow(rows[0]);
    if (!row) continue;
    // pathFromRoot includes self; expand all ancestors (exclude self)
    for (const ancestorIdx of row.pathFromRoot.slice(0, -1)) {
      if (!prev.has(ancestorIdx)) {
        next.add(ancestorIdx);
        changed = true;
      }
    }
  }
  return changed ? next : prev;
}

export const TreeView = memo(function TreeView() {
  const rootId = useAppStore(s => s.rootId);
  const selectedNodeId = useAppStore(s => s.selectedNodeId);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);
  const graphLoading = useAppStore(s => s.graphLoading);
  const setExpandedRows = useAppStore(s => s.setExpandedRows);
  const getNode = useAppStore(s => s.getNode);
  const getParents = useAppStore(s => s.getParents);
  const displayedNodeIds = useAppStore(s => s.displayedNodeIds);
  const targetRowIndex = useAppStore(s => s.targetRowIndex);
  const clearTargetRow = useAppStore(s => s.clearTargetRow);
  const contentRef = useRef<HTMLDivElement>(null);
  const [descTooltip, setDescTooltip] = useState<DescTooltipState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectNode = useAppStore(s => s.selectNode);

  // Search mode (persistent)
  const [searchMode, setSearchMode] = useState<SearchMode>(
    () => (localStorage.getItem('icd11-tree-mode') as SearchMode) || 'search'
  );
  const handleSetSearchMode = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
    localStorage.setItem('icd11-tree-mode', mode);
  }, []);

  // In filter mode, filter to just the selected node (and its ancestors).
  const effectiveFilterMatchIds = useMemo(() => {
    if (searchMode !== 'filter') return null;
    if (selectedNodeId) return new Set([selectedNodeId]);
    return null;
  }, [searchMode, selectedNodeId]);

  // Compute filter ancestors
  const filterAncestorIds = useMemo(() => {
    if (!effectiveFilterMatchIds) return null;
    return computeFilterAncestors(effectiveFilterMatchIds, getParents);
  }, [effectiveFilterMatchIds, getParents]);

  // Pre-expand tree rows for all NL-displayed nodes so hover only needs to scroll.
  useEffect(() => {
    if (displayedNodeIds.size === 0) return;
    setExpandedRows(prev => expandAncestorRowsForNodes(displayedNodeIds, prev, Infinity));
  }, [displayedNodeIds, setExpandedRows]);

  // Search select handler — just delegates to selectNode
  const handleSearchSelect = useCallback((id: string) => {
    selectNode(id);
  }, [selectNode]);

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

  // Scroll to targetRowIndex when it changes
  useEffect(() => {
    if (targetRowIndex === null || !contentRef.current) return;
    requestAnimationFrame(() => {
      const el = contentRef.current?.querySelector(`[data-row-index="${targetRowIndex}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      clearTargetRow();
    });
  }, [targetRowIndex, clearTargetRow]);

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

  const filterCtxValue: FilterCtx = useMemo(() => ({
    filterMatchIds: effectiveFilterMatchIds,
    filterAncestorIds,
  }), [effectiveFilterMatchIds, filterAncestorIds]);

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
    if (selectedNodeId) {
      const name = getNode(selectedNodeId)?.title ?? selectedNodeId;
      return `Filtered to ancestors of ${name}`;
    }
    return null;
  }, [searchMode, selectedNodeId, getNode]);

  // Context-dependent filter button title
  const filterButtonTitle = useMemo(() => {
    if (searchMode !== 'filter') return 'Filter view (show only selected node and ancestors)';
    if (selectedNodeId) {
      const name = getNode(selectedNodeId)?.title ?? selectedNodeId;
      return `Filtered to ancestors of ${name}`;
    }
    return 'Filtered view active (no selection)';
  }, [searchMode, selectedNodeId, getNode]);

  // Find the root row index (row 0 for single-root trees)
  const rootRowIndex = useMemo(() => {
    if (!rootId) return -1;
    const rows = getRowsForNode(rootId);
    return rows.length > 0 ? rows[0] : -1;
  }, [rootId]);

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
      <FilterContext.Provider value={filterCtxValue}>
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
              title="Full tree view"
            >
              <TreeIcon /> Tree
            </button>
            <button
              className={`tree-mode-btn${searchMode === 'filter' ? ' active' : ''}`}
              onClick={() => handleSetSearchMode('filter')}
              title={filterButtonTitle}
            >
              <FilterIcon /> Filter
            </button>
          </div>
        </div>
        <TreeSearch onSelect={handleSearchSelect} />
        <div className="panel-content tree-content" ref={contentRef}>
          {graphLoading ? (
            <div className="placeholder">Loading Foundation...</div>
          ) : rootRowIndex >= 0 ? (
            <TreeNode rowIndex={rootRowIndex} />
          ) : (
            <div className="placeholder">Failed to load Foundation</div>
          )}
        </div>
        {descTooltip && (
          <DescendantTooltip
            nodeId={descTooltip.nodeId}
            rowIndex={descTooltip.rowIndex}
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
            totalTreeRows={getTotalRows()}
            visibleRows={visibleStats.rows}
            visibleUnique={visibleStats.unique}
            filterNote={filterNote}
          />
        )}
      </FilterContext.Provider>
    </DescTooltipContext.Provider>
  );
});
