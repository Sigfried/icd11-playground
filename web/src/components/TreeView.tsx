import { useGraph } from '../providers/GraphProvider';
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
export function TreeView() {
  const { selectedNodeId } = useGraph();

  return (
    <>
      <div className="panel-header">
        Tree View
        <span className="header-hint">Foundation hierarchy</span>
      </div>
      <div className="panel-content">
        <div className="placeholder">
          TreeView component
          <br />
          <small>Selected: {selectedNodeId ?? 'none'}</small>
        </div>
      </div>
    </>
  );
}
