import { useCallback } from 'react';
import { useGraph, type TreePath, type ConceptNode } from '../providers/GraphProvider';
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
 * - Lazy loading of children on expand
 * - Muted style for "linked" (non-canonical) children (if API exposes this)
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
    graph,
    graphVersion,
    selectedNodeId,
    expandedPaths,
    loadingNodes,
    selectNode,
    toggleExpand,
  } = useGraph();

  // Force re-render when graph changes
  void graphVersion;

  const pathKey = path.join('/');
  const isExpanded = expandedPaths.has(pathKey);
  const isSelected = selectedNodeId === nodeId;
  const isLoading = loadingNodes.has(nodeId);

  // Get node data from graph
  const nodeData: ConceptNode | null = graph.hasNode(nodeId)
    ? graph.getNodeAttributes(nodeId)
    : null;

  // Get children in API order (childOrder), filtered to only loaded ones
  const loadedChildren = new Set(graph.hasNode(nodeId) ? graph.outNeighbors(nodeId) : []);
  const childIds = (nodeData?.childOrder ?? []).filter(id => loadedChildren.has(id));
  const hasChildren = (nodeData?.childCount ?? 0) > 0 || childIds.length > 0;

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
          {isLoading ? '⋯' : hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
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

      {isExpanded && childIds.length > 0 && (
        <div className="tree-children">
          {childIds.map(childId => (
            <TreeNode
              key={`${pathKey}/${childId}`}
              nodeId={childId}
              path={[...path, childId]}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView() {
  const { rootId, graphVersion } = useGraph();

  // Force re-render when graph changes
  void graphVersion;

  return (
    <>
      <div className="panel-header">
        Tree View -- <span className="header-hint">Foundation hierarchy</span>
      </div>
      <div className="panel-content tree-content">
        {rootId ? (
          <TreeNode nodeId={rootId} path={[rootId]} depth={0} />
        ) : (
          <div className="placeholder">Loading Foundation...</div>
        )}
      </div>
    </>
  );
}
