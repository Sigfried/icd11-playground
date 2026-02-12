import { useState, useCallback, useEffect } from 'react';
import { type ConceptNode, type EntityDetail, useGraph } from '../providers/GraphProvider';
import { Badge, type BadgeType } from './Badge';
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

/** Single item in a relation list with inline expandable sub-lists */
function RelationListItem({ node, onSelect }: { node: ConceptNode; onSelect: (id: string) => void }) {
  const { getParents, getChildren, highlightedNodeIds, setHighlightedNodeIds } = useGraph();
  const [expanded, setExpanded] = useState<Set<BadgeType>>(new Set());
  const isHighlighted = highlightedNodeIds.has(node.id);

  const toggleInline = useCallback((type: BadgeType, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleBadgeHover = useCallback((type: BadgeType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const ids = type === 'parents'
      ? getParents(node.id).map(p => p.id)
      : getChildren(node.id).map(c => c.id);
    setHighlightedNodeIds(new Set(ids));
  }, [node.id, getParents, getChildren, setHighlightedNodeIds]);

  const handleBadgeLeave = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, [setHighlightedNodeIds]);

  const parentNodes = expanded.has('parents') ? getParents(node.id) : [];
  const childNodes = expanded.has('children') || expanded.has('descendants') ? getChildren(node.id) : [];

  return (
    <li className={isHighlighted ? 'highlighted' : ''}>
      {/* Inline parents above */}
      {parentNodes.length > 0 && (
        <ul className="relation-sublist relation-sublist-parents">
          {parentNodes.map(p => (
            <li key={p.id} className="sublist-item" onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}>
              ↑ {p.title}
            </li>
          ))}
        </ul>
      )}
      <div className="relation-item-row" onClick={() => onSelect(node.id)}>
        <span className="relation-item-title">{node.title}</span>
        {node.parentCount > 1 && (
          <Badge
            type="parents"
            count={node.parentCount}
            onClick={(e) => toggleInline('parents', e)}
            onMouseEnter={handleBadgeHover('parents')}
            onMouseLeave={handleBadgeLeave}
          />
        )}
        {node.childCount > 0 && (
          <Badge
            type="children"
            count={node.childCount}
            onClick={(e) => toggleInline('children', e)}
            onMouseEnter={handleBadgeHover('children')}
            onMouseLeave={handleBadgeLeave}
          />
        )}
        {node.descendantCount > node.childCount && (
          <Badge
            type="descendants"
            count={node.descendantCount}
            onClick={(e) => toggleInline('children', e)}
            onMouseEnter={handleBadgeHover('children')}
            onMouseLeave={handleBadgeLeave}
          />
        )}
      </div>
      {/* Inline children below */}
      {childNodes.length > 0 && (
        <ul className="relation-sublist relation-sublist-children">
          {childNodes.map(c => (
            <li key={c.id} className="sublist-item" onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}>
              ↓ {c.title}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function RelationList({ title, nodes, onSelect }: RelationListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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
                <RelationListItem key={node.id} node={node} onSelect={onSelect} />
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
    hoveredNodeId,
    selectNode,
    getNode,
    getParents,
    getChildren,
    getDetail,
  } = useGraph();

  const displayNodeId = hoveredNodeId ?? selectedNodeId;
  const isPreviewing = hoveredNodeId !== null && hoveredNodeId !== selectedNodeId;

  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch detail when display node changes
  useEffect(() => {
    if (!displayNodeId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    getDetail(displayNodeId).then(d => {
      if (!cancelled) {
        setDetail(d);
        setDetailLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load detail:', err);
      if (!cancelled) setDetailLoading(false);
    });

    return () => { cancelled = true; };
  }, [displayNodeId, getDetail]);

  if (!displayNodeId) {
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

  const nodeData: ConceptNode | null = getNode(displayNodeId);
  const parentNodes = getParents(displayNodeId);
  const childNodes = getChildren(displayNodeId);
  const definition = detail?.definition || detail?.longDefinition;

  return (
    <>
      <div className="panel-header">
        Details
        {isPreviewing && <span className="preview-badge">Preview</span>}
      </div>
      <div className="panel-content">
        <div className="detail-section">
          <h2 className="detail-title">
            {nodeData?.title ?? `Entity ${displayNodeId}`}
          </h2>

          {detailLoading ? (
            <p className="detail-definition loading">Loading definition...</p>
          ) : definition ? (
            <p className="detail-definition">{definition}</p>
          ) : null}

          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="meta-label">ID:</span>
              <code className="meta-value">{displayNodeId}</code>
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
              href={`https://icd.who.int/browse/2025-01/foundation/en#${displayNodeId}`}
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
