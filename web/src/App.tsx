import { GraphProvider } from './providers/GraphProvider';
import { TreeView } from './components/TreeView';
import { NodeLinkView } from './components/NodeLinkView';
import { DetailPanel } from './components/DetailPanel';
import './App.css';

/**
 * ICD-11 Foundation Visual Maintenance Tool
 *
 * Main application layout with three panels:
 * - TreeView: Indented hierarchical navigation (primary)
 * - NodeLinkView: DAG visualization of local neighborhood
 * - DetailPanel: Entity metadata, parents, children, proposals
 */
function App() {
  return (
    <GraphProvider>
      <div className="app">
        <header className="app-header">
          <h1><a href={import.meta.env.BASE_URL}>ICD-11 Foundation Explorer</a></h1>
          <span className="app-subtitle">Visual Maintenance Tool Prototype</span>
        </header>

        <main className="app-main">
          <div className="panel tree-panel">
            <TreeView />
          </div>

          <div className="panel node-link-panel">
            <NodeLinkView />
          </div>

          <div className="panel detail-panel">
            <DetailPanel />
          </div>
        </main>
      </div>
    </GraphProvider>
  );
}

export default App;
