import { GraphProvider } from './providers/GraphProvider';
import { TreeView } from './components/TreeView';
import { NodeLinkView } from './components/NodeLinkView';
import { DetailPanel } from './components/DetailPanel';
import { useLayoutMode } from './hooks/useLayoutMode';
import './App.css';

/**
 * ICD-11 Foundation Visual Maintenance Tool
 *
 * Three panels in two switchable layouts:
 * - Two-row: tree + detail on top, node-link full width on bottom
 * - Two-col: tree on left, detail + node-link stacked on right
 */

function LayoutToggle({ mode, onToggle }: { mode: string; onToggle: () => void }) {
  return (
    <button
      className="layout-toggle"
      onClick={onToggle}
      title={mode === 'two-row' ? 'Switch to column layout' : 'Switch to row layout'}
    >
      {mode === 'two-row' ? (
        // Show the two-col icon (what you'll switch TO)
        <svg width="20" height="16" viewBox="0 0 20 16">
          <rect x="0.5" y="0.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1" />
          <line x1="8" y1="8" x2="19" y2="8" stroke="currentColor" strokeWidth="1" />
        </svg>
      ) : (
        // Show the two-row icon (what you'll switch TO)
        <svg width="20" height="16" viewBox="0 0 20 16">
          <rect x="0.5" y="0.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="1" x2="10" y2="9" stroke="currentColor" strokeWidth="1" />
          <line x1="1" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth="1" />
        </svg>
      )}
    </button>
  );
}

function App() {
  const { containerRef, mode, toggleMode, sizes, onDividerMouseDown } = useLayoutMode();

  return (
    <GraphProvider>
      <div className="app">
        <header className="app-header">
          <h1><a href={import.meta.env.BASE_URL}>ICD-11 Foundation Explorer</a></h1>
          <span className="app-subtitle">Visual Maintenance Tool Prototype</span>
          <LayoutToggle mode={mode} onToggle={toggleMode} />
        </header>

        {mode === 'two-row' ? (
          <main className="app-main two-row" ref={containerRef}>
            <div className="layout-top" style={sizes ? { height: sizes.twoRow.rows[0] } : undefined}>
              <div className="panel tree-panel" style={sizes ? { width: sizes.twoRow.topCols[0] } : undefined}>
                <TreeView />
              </div>
              <div
                className="panel-divider vertical"
                onMouseDown={e => onDividerMouseDown('two-row:topCols', e)}
              />
              <div className="panel detail-panel" style={sizes ? { width: sizes.twoRow.topCols[1] } : undefined}>
                <DetailPanel />
              </div>
            </div>
            <div
              className="panel-divider horizontal"
              onMouseDown={e => onDividerMouseDown('two-row:rows', e)}
            />
            <div className="panel node-link-panel" style={sizes ? { height: sizes.twoRow.rows[1] } : undefined}>
              <NodeLinkView />
            </div>
          </main>
        ) : (
          <main className="app-main two-col" ref={containerRef}>
            <div className="panel tree-panel" style={sizes ? { width: sizes.twoCol.cols[0] } : undefined}>
              <TreeView />
            </div>
            <div
              className="panel-divider vertical"
              onMouseDown={e => onDividerMouseDown('two-col:cols', e)}
            />
            <div className="layout-right" style={sizes ? { width: sizes.twoCol.cols[1] } : undefined}>
              <div className="panel detail-panel" style={sizes ? { height: sizes.twoCol.rightRows[0] } : undefined}>
                <DetailPanel />
              </div>
              <div
                className="panel-divider horizontal"
                onMouseDown={e => onDividerMouseDown('two-col:rightRows', e)}
              />
              <div className="panel node-link-panel" style={sizes ? { height: sizes.twoCol.rightRows[1] } : undefined}>
                <NodeLinkView />
              </div>
            </div>
          </main>
        )}
      </div>
    </GraphProvider>
  );
}

export default App;
