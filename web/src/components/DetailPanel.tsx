import { useGraph } from '../providers/GraphProvider';
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
export function DetailPanel() {
  const { selectedNodeId, graph } = useGraph();

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

  // TODO: Get node data from graph
  const nodeData = graph.hasNode(selectedNodeId)
    ? graph.getNodeAttributes(selectedNodeId)
    : null;

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

        {/* Parents section - TODO */}
        <div className="detail-section collapsed">
          <h3 className="section-header">
            Parents
            <span className="section-count">{nodeData?.parentCount ?? '?'}</span>
          </h3>
        </div>

        {/* Children section - TODO */}
        <div className="detail-section collapsed">
          <h3 className="section-header">
            Children
            <span className="section-count">{nodeData?.childCount ?? '?'}</span>
          </h3>
        </div>

        {/* Proposals section - future */}
        <div className="detail-section collapsed">
          <h3 className="section-header">
            Proposals
            <span className="section-count coming-soon">coming soon</span>
          </h3>
        </div>
      </div>
    </>
  );
}
