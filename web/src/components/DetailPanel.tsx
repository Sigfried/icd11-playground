import { useState, useCallback, useEffect } from 'react';
import { type ConceptNode, type EntityDetail, useGraph } from '../providers/GraphProvider';
import './DetailPanel.css';

/**
 * Detail Panel / Context Menu
 *
 * Shows metadata for the selected concept:
 * - Title and definition (async-loaded)
 * - Link to Foundation browser
 * - Collapsible parents list (all in memory)
 * - Collapsible children list (all in memory)
 * - Existing proposals summary (future)
 * - Link to create new proposal (future)
 *
 * See icd11-visual-interface-spec.md for full requirements.
 */

interface RelationListProps {
  title: string;
  nodes: ConceptNode[];
  onSelect: (id: string) => void;
}

function RelationList({ title, nodes, onSelect }: RelationListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div className={`detail-section ${isExpanded ? '' : 'collapsed'}`}>
      <h3 className="section-header" onClick={toggleExpanded}>
        <span className="section-toggle">{isExpanded ? '▼' : '▶'}</span>
        {title}
        <span className="section-count">{nodes.length}</span>
      </h3>
      {isExpanded && (
        <div className="section-content">
          {nodes.length === 0 ? (
            <div className="no-items">None</div>
          ) : (
            <ul className="relation-list">
              {nodes.map(node => (
                <li key={node.id} onClick={() => onSelect(node.id)}>
                  {node.title}
                  {node.parentCount > 1 && (
                    <span className="inline-badge">{node.parentCount}↑</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DetailPanel() {
  const {
    selectedNodeId,
    selectNode,
    getNode,
    getParents,
    getChildren,
    getDetail,
  } = useGraph();

  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch detail when selection changes
  useEffect(() => {
    if (!selectedNodeId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    getDetail(selectedNodeId).then(d => {
      if (!cancelled) {
        setDetail(d);
        setDetailLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load detail:', err);
      if (!cancelled) setDetailLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedNodeId, getDetail]);

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

  const nodeData: ConceptNode | null = getNode(selectedNodeId);
  const parentNodes = getParents(selectedNodeId);
  const childNodes = getChildren(selectedNodeId);
  const definition = detail?.definition || detail?.longDefinition;

  return (
    <>
      <div className="panel-header">Details</div>
      <div className="panel-content">
        <div className="detail-section">
          <h2 className="detail-title">
            {nodeData?.title ?? `Entity ${selectedNodeId}`}
          </h2>

          {detailLoading ? (
            <p className="detail-definition loading">Loading definition...</p>
          ) : definition ? (
            <p className="detail-definition">{definition}</p>
          ) : null}

          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="meta-label">ID:</span>
              <code className="meta-value">{selectedNodeId}</code>
            </div>
            {nodeData && (
              <div className="detail-meta-item">
                <span className="meta-label">Descendants:</span>
                <span className="meta-value">{nodeData.descendantCount.toLocaleString()}</span>
              </div>
            )}
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
          nodes={parentNodes}
          onSelect={selectNode}
        />

        <RelationList
          title="Children"
          nodes={childNodes}
          onSelect={selectNode}
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
