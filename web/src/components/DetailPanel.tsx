import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { type ConceptNode, type EntityDetail, type TreePath, useGraph } from '../providers/GraphProvider';
import { Badge, type BadgeType } from './Badge';
import { trackRender } from '../utils/renderStormDetector';
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

/** Render a single path as a truncated breadcrumb: … > C > D > [node] */
function PathBreadcrumb({ path, getNode: getNodeFn }: { path: TreePath; getNode: (id: string) => ConceptNode | null }) {
  // Show last 3 ancestors before the target node (which is the last element)
  const VISIBLE_ANCESTORS = 3;
  const targetIdx = path.length - 1;
  const startIdx = Math.max(0, targetIdx - VISIBLE_ANCESTORS);
  const truncated = startIdx > 0;
  const visibleSegments = path.slice(startIdx, targetIdx);

  return (
    <>
      {truncated && <span className="path-ellipsis">…</span>}
      {visibleSegments.map((id, i) => (
        <span key={id}>
          {(i > 0 || truncated) && <span className="path-separator">&gt;</span>}
          <span className="path-breadcrumb-segment">{getNodeFn(id)?.title ?? id}</span>
        </span>
      ))}
      <span className="path-separator">&gt;</span>
      <span className="path-target">{getNodeFn(path[targetIdx])?.title ?? path[targetIdx]}</span>
    </>
  );
}

interface PathsToRootProps {
  paths: TreePath[];
  activePathIndex: number;
  onCycle: (delta: number) => void;
  onSelectPath: (index: number) => void;
  getNode: (id: string) => ConceptNode | null;
}

function PathsToRoot({ paths, activePathIndex, onCycle, onSelectPath, getNode: getNodeFn }: PathsToRootProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div className={`detail-section ${isExpanded ? '' : 'collapsed'}`}>
      <h3 className="section-header" onClick={toggleExpanded}>
        <span className="section-toggle">{isExpanded ? '▼' : '▶'}</span>
        Paths to Root
        <span className="section-count">{paths.length}</span>
        <span className="path-cycle-controls" onClick={e => e.stopPropagation()}>
          <button className="path-cycle-btn" onClick={() => onCycle(-1)} title="Previous path">◁</button>
          <button className="path-cycle-btn" onClick={() => onCycle(1)} title="Next path">▷</button>
        </span>
      </h3>
      {isExpanded && (
        <div className="section-content">
          <ul className="paths-to-root-list">
            {paths.map((path, i) => (
              <li
                key={path.join('/')}
                className={`paths-to-root-item${i === activePathIndex ? ' active' : ''}`}
                onClick={() => onSelectPath(i)}
              >
                <PathBreadcrumb path={path} getNode={getNodeFn} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const DetailPanel = memo(function DetailPanel() {
  trackRender('DetailPanel');
  const {
    selectedNodeId,
    hoveredNodeId,
    selectNode,
    getNode,
    getParents,
    getChildren,
    getDetail,
    getPathsToRoot,
    navigateToTreePath,
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

  // Paths to root for polyhierarchy nodes
  const paths = useMemo(
    () => displayNodeId ? getPathsToRoot(displayNodeId) : [],
    [displayNodeId, getPathsToRoot]
  );
  const [activePathIndex, setActivePathIndex] = useState(0);

  // Reset active path index when displayed node changes
  useEffect(() => {
    setActivePathIndex(0);
  }, [displayNodeId]);

  const handleCyclePath = useCallback((delta: number) => {
    if (paths.length === 0) return;
    setActivePathIndex(prev => {
      const next = ((prev + delta) % paths.length + paths.length) % paths.length;
      navigateToTreePath(paths[next]);
      return next;
    });
  }, [paths, navigateToTreePath]);

  const handleSelectPath = useCallback((index: number) => {
    setActivePathIndex(index);
    navigateToTreePath(paths[index]);
  }, [paths, navigateToTreePath]);

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
      <div className="panel-header" data-help-id="detail-panel-overview">
        Details
        {isPreviewing && <span className="preview-badge">Preview</span>}
      </div>
      <div className="panel-content">
        <div className="detail-section">
          <h2 className={`detail-title${isPreviewing ? ' preview' : ''}`}>
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
              data-help-id="detail-browser-link"
            >
              View in Foundation Browser ↗
            </a>
          </div>
        </div>

        {paths.length > 1 && (
          <PathsToRoot
            paths={paths}
            activePathIndex={activePathIndex}
            onCycle={handleCyclePath}
            onSelectPath={handleSelectPath}
            getNode={getNode}
          />
        )}

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
});
