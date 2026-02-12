import { useCallback, useEffect, useRef } from 'react';
import { type TreePath, type ConceptNode, useGraph, pathKey } from '../providers/GraphProvider';
import { Badge } from './Badge';
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
 *
 * See icd11-visual-interface-spec.md for full requirements.
 */

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
    setExpandedPaths,
    expandParentPaths,
    highlightedNodeIds,
    setHighlightedNodeIds,
    getNode,
    getChildren,
    getParents,
  } = useGraph();

  const pk = pathKey(path);
  const isExpanded = expandedPaths.has(pk);
  const isSelected = selectedNodeId === nodeId;
  const isHighlighted = highlightedNodeIds.has(nodeId);

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
    // Recursive expand to depth 3
    setExpandedPaths(prev => {
      const next = new Set(prev);
      const expand = (id: string, currentPath: string[], remainingDepth: number) => {
        next.add(pathKey(currentPath));
        if (remainingDepth <= 0) return;
        for (const child of getChildren(id)) {
          const childPath = [...currentPath, child.id];
          expand(child.id, childPath, remainingDepth - 1);
        }
      };
      expand(nodeId, path, 3);
      return next;
    });
  }, [nodeId, path, setExpandedPaths, getChildren]);

  // Badge hover handlers for cross-panel highlighting
  const handleParentHover = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getParents(nodeId).map(p => p.id)));
  }, [nodeId, getParents, setHighlightedNodeIds]);

  const handleChildHover = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setHighlightedNodeIds(new Set(getChildren(nodeId).map(c => c.id)));
  }, [nodeId, getChildren, setHighlightedNodeIds]);

  const handleBadgeLeave = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, [setHighlightedNodeIds]);

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
  ].filter(Boolean).join(' ');

  return (
    <div className="tree-node-container">
      <div
        className={nodeClasses}
        data-node-id={nodeId}
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
                onMouseEnter={handleChildHover}
                onMouseLeave={handleBadgeLeave}
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

export function TreeView() {
  const { rootId, selectedNodeId, graphLoading } = useGraph();
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll the selected node into view when selection changes
  useEffect(() => {
    if (!selectedNodeId || !contentRef.current) return;
    // Wait a tick for the DOM to update after expansion
    requestAnimationFrame(() => {
      const el = contentRef.current?.querySelector(`[data-node-id="${selectedNodeId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedNodeId]);

  return (
    <>
      <div className="panel-header">
        Tree View -- <span className="header-hint">Foundation hierarchy</span>
      </div>
      <div className="panel-content tree-content" ref={contentRef}>
        {graphLoading ? (
          <div className="placeholder">Loading Foundation...</div>
        ) : rootId ? (
          <TreeNode nodeId={rootId} path={[rootId]} depth={0} />
        ) : (
          <div className="placeholder">Failed to load Foundation</div>
        )}
      </div>
    </>
  );
}
