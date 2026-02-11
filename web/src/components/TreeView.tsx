import { useCallback } from 'react';
import { type TreePath, type ConceptNode, useGraph } from '../providers/GraphProvider';
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
    getNode,
    getChildren,
  } = useGraph();

  const pathKey = path.join('/');
  const isExpanded = expandedPaths.has(pathKey);
  const isSelected = selectedNodeId === nodeId;

  const nodeData: ConceptNode | null = getNode(nodeId);
  const hasChildren = (nodeData?.childCount ?? 0) > 0;

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpand(path);
  }, [path, toggleExpand]);

  const handleSelectClick = useCallback(() => {
    selectNode(nodeId);
  }, [nodeId, selectNode]);

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

  return (
    <div className="tree-node-container">
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
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
          {nodeData.parentCount > 1 && (
            <span className="badge badge-parents" title={`${nodeData.parentCount} parents`}>
              {nodeData.parentCount}↑
            </span>
          )}
          {nodeData.childCount > 0 && (
            <span className="badge badge-children" title={`${nodeData.childCount} children`}>
              {nodeData.childCount}↓
            </span>
          )}
        </span>
      </div>

      {isExpanded && childNodes.length > 0 && (
        <div className="tree-children">
          {childNodes.map(child => (
            <TreeNode
              key={`${pathKey}/${child.id}`}
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
  const { rootId, graphLoading } = useGraph();

  return (
    <>
      <div className="panel-header">
        Tree View -- <span className="header-hint">Foundation hierarchy</span>
      </div>
      <div className="panel-content tree-content">
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
