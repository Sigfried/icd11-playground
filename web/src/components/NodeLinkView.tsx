import { useGraph } from '../providers/GraphProvider';
import './NodeLinkView.css';

/**
 * Node-Link Diagram (Secondary View)
 *
 * D3-based DAG visualization of local neighborhood around the selected node.
 * Shows N hops of parents and children.
 *
 * Layout options (per spec):
 * - elkjs: Current implementation (Eclipse Layout Kernel)
 * - d3-dag: Alternative, but limited forced vertical layering
 * - dagre: Simpler, may struggle with complex graphs
 *
 * TODO: May switch to Python/igraph backend for layout calculation.
 * igraph supports forced vertical layering which is better for our use case.
 * See icd11-visual-interface-spec.md.
 *
 * Key features:
 * - Hierarchical (not force-directed) layout
 * - Focus + context: center on selected, show neighborhood
 * - Click to navigate (updates TreeView and this view)
 * - Same [N↑] [N↓] badges as TreeView
 */
export function NodeLinkView() {
  const { selectedNodeId } = useGraph();

  return (
    <>
      <div className="panel-header">
        Node-Link View
        <span className="header-hint">
          {selectedNodeId ? 'Neighborhood' : 'Select a node'}
        </span>
      </div>
      <div className="panel-content">
        <div className="placeholder">
          NodeLinkView component
          <br />
          <small>D3 + elkjs layout</small>
          <br />
          <small style={{ color: 'var(--accent-orange)' }}>
            May migrate to igraph for layout
          </small>
        </div>
      </div>
    </>
  );
}
