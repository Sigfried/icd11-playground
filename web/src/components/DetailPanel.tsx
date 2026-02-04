import { useState, useCallback, useEffect } from 'react';
import { useGraph, type ConceptNode } from '../providers/GraphProvider';
import './DetailPanel.css';

/**
 * Detail Panel / Context Menu
 *
 * Shows metadata for the selected concept:
 * - Title and definition
 * - Link to Foundation browser
 * - Collapsible parents list
 * - Collapsible children list
 * - Existing proposals summary (future)
 * - Link to create new proposal (future)
 *
 * See icd11-visual-interface-spec.md for full requirements.
 */

interface RelationListProps {
  title: string;
  ids: string[];
  expectedCount: number;
  onLoadMore?: () => void;
  onSelect: (id: string) => void;
  graph: ReturnType<typeof useGraph>['graph'];
}

function RelationList({ title, ids, expectedCount, onLoadMore, onSelect, graph }: RelationListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const loadedCount = ids.length;
  const hasMore = loadedCount < expectedCount;

  return (
    <div className={`detail-section ${isExpanded ? '' : 'collapsed'}`}>
      <h3 className="section-header" onClick={toggleExpanded}>
        <span className="section-toggle">{isExpanded ? '▼' : '▶'}</span>
        {title}
        <span className="section-count">
          {loadedCount}{hasMore ? `/${expectedCount}` : ''}
        </span>
      </h3>
      {isExpanded && (
        <div className="section-content">
          {ids.length === 0 && !hasMore ? (
            <div className="no-items">None</div>
          ) : (
            <ul className="relation-list">
              {ids.map(id => {
                const node: ConceptNode | null = graph.hasNode(id)
                  ? graph.getNodeAttributes(id)
                  : null;
                return (
                  <li key={id} onClick={() => onSelect(id)}>
                    {node?.title ?? `Entity ${id}`}
                    {node?.parentCount && node.parentCount > 1 && (
                      <span className="inline-badge">{node.parentCount}↑</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && onLoadMore && (
            <button className="load-more-btn" onClick={onLoadMore}>
              Load {expectedCount - loadedCount} more...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DetailPanel() {
  const {
    selectedNodeId,
    graph,
    graphVersion,
    selectNode,
    loadParents,
    loadChildren,
  } = useGraph();

  // Force re-render when graph changes
  void graphVersion;

  // Auto-load parents when node is selected
  useEffect(() => {
    if (selectedNodeId && graph.hasNode(selectedNodeId)) {
      const parentCount = graph.getNodeAttribute(selectedNodeId, 'parentCount');
      const loadedParents = graph.inNeighbors(selectedNodeId).length;
      if (parentCount > loadedParents) {
        loadParents(selectedNodeId);
      }
    }
  }, [selectedNodeId, graph, loadParents]);

  // IMPORTANT: All hooks must be called before any conditional return.
  // Moving these after the early return caused "Rendered more hooks" error.
  const handleLoadParents = useCallback(() => {
    if (selectedNodeId) {
      loadParents(selectedNodeId);
    }
  }, [selectedNodeId, loadParents]);

  const handleLoadChildren = useCallback(() => {
    if (selectedNodeId) {
      loadChildren(selectedNodeId);
    }
  }, [selectedNodeId, loadChildren]);

  if (!selectedNodeId) {
    return (
      <>
        <div className="panel-header">Details</div>
        <div className="panel-content">
          <div className="placeholder">
            Select a concept to view details
          </div>
        </div>
      </>
    );
  }

  const nodeData: ConceptNode | null = graph.hasNode(selectedNodeId)
    ? graph.getNodeAttributes(selectedNodeId)
    : null;

  // Get parents (inNeighbors = nodes pointing to this node)
  const parentIds = graph.hasNode(selectedNodeId)
    ? graph.inNeighbors(selectedNodeId)
    : [];

  // Get children in API order, filtered to loaded ones
  const loadedChildren = new Set(
    graph.hasNode(selectedNodeId) ? graph.outNeighbors(selectedNodeId) : []
  );
  const childIds = (nodeData?.childOrder ?? []).filter(id => loadedChildren.has(id));

  return (
    <>
      <div className="panel-header">Details</div>
      <div className="panel-content">
        <div className="detail-section">
          <h2 className="detail-title">
            {nodeData?.title ?? `Entity ${selectedNodeId}`}
          </h2>

          {nodeData?.definition && (
            <p className="detail-definition">{nodeData.definition}</p>
          )}

          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="meta-label">ID:</span>
              <code className="meta-value">{selectedNodeId}</code>
            </div>
          </div>

          <div className="detail-actions">
            <a
              href={`https://icd.who.int/browse/2025-01/foundation/en#${selectedNodeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-link"
            >
              View in Foundation Browser ↗
            </a>
          </div>
        </div>

        <RelationList
          title="Parents"
          ids={parentIds}
          expectedCount={nodeData?.parentCount ?? 0}
          onLoadMore={handleLoadParents}
          onSelect={selectNode}
          graph={graph}
        />

        <RelationList
          title="Children"
          ids={childIds}
          expectedCount={nodeData?.childCount ?? 0}
          onLoadMore={handleLoadChildren}
          onSelect={selectNode}
          graph={graph}
        />

        {/* Proposals section - future */}
        <div className="detail-section collapsed">
          <h3 className="section-header">
            <span className="section-toggle">▶</span>
            Proposals
            <span className="section-count coming-soon">coming soon</span>
          </h3>
        </div>
      </div>
    </>
  );
}
