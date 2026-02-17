import { GraphProvider, useGraph } from './providers/GraphProvider';
import { TreeView } from './components/TreeView';
import { NodeLinkView } from './components/NodeLinkView';
import { DetailPanel } from './components/DetailPanel';
import { ResumeModal } from './components/ResumeModal';
import { HelpPopover } from './components/HelpPopover';
import { useLayoutMode } from './hooks/useLayoutMode';
import { useHelpMode } from './hooks/useHelpMode';
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
      data-help-id="layout-toggle"
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

function GlobalResumeModal() {
  const { pendingRestore } = useGraph();
  if (!pendingRestore) return null;
  return <ResumeModal pending={pendingRestore} />;
}

function GlobalHelpPopover() {
  const { activeHelpEntry, helpContent, dismissHelpEntry } = useGraph();
  if (!activeHelpEntry) return null;
  const entry = helpContent?.entries.get(activeHelpEntry.id);
  return (
    <HelpPopover
      entry={entry}
      helpId={activeHelpEntry.id}
      anchorRect={activeHelpEntry.rect}
      onDismiss={dismissHelpEntry}
    />
  );
}

function HelpModeInterceptor() {
  const { helpMode, toggleHelpMode, exitHelpMode, showHelpEntry, dismissHelpEntry, activeHelpEntry, helpContent } = useGraph();
  useHelpMode({ helpMode, toggleHelpMode, exitHelpMode, showHelpEntry, dismissHelpEntry, activeHelpEntry, helpContent });
  return null;
}

function HelpToggle() {
  const { helpMode, toggleHelpMode } = useGraph();
  return (
    <button
      className={`help-toggle${helpMode ? ' active' : ''}`}
      data-help-id="help-toggle"
      onClick={toggleHelpMode}
      title={helpMode ? 'Exit help mode' : 'Enter help mode — click any element for help'}
    >
      ?
    </button>
  );
}

function AppContent() {
  const { containerRef, mode, toggleMode, sizes, onDividerMouseDown } = useLayoutMode();

  return (
    <>
      <HelpModeInterceptor />
      <GlobalResumeModal />
      <GlobalHelpPopover />
      <div className="app">
        <header className="app-header">
          <h1><a href={import.meta.env.BASE_URL} data-help-id="header-home-link">ICD-11 Foundation Explorer</a></h1>
          <span className="app-subtitle">Visual Maintenance Tool Prototype</span>
          <a
            className="github-link"
            href="https://github.com/Sigfried/icd11-playground"
            target="_blank"
            rel="noopener noreferrer"
            title="View source on GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
          <HelpToggle />
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
                data-help-id="panel-divider"
                onMouseDown={e => onDividerMouseDown('two-row:topCols', e)}
              />
              <div className="panel detail-panel" style={sizes ? { width: sizes.twoRow.topCols[1] } : undefined}>
                <DetailPanel />
              </div>
            </div>
            <div
              className="panel-divider horizontal"
              data-help-id="panel-divider"
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
              data-help-id="panel-divider"
              onMouseDown={e => onDividerMouseDown('two-col:cols', e)}
            />
            <div className="layout-right" style={sizes ? { width: sizes.twoCol.cols[1] } : undefined}>
              <div className="panel detail-panel" style={sizes ? { height: sizes.twoCol.rightRows[0] } : undefined}>
                <DetailPanel />
              </div>
              <div
                className="panel-divider horizontal"
                data-help-id="panel-divider"
                onMouseDown={e => onDividerMouseDown('two-col:rightRows', e)}
              />
              <div className="panel node-link-panel" style={sizes ? { height: sizes.twoCol.rightRows[1] } : undefined}>
                <NodeLinkView />
              </div>
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function App() {
  return (
    <GraphProvider>
      <AppContent />
    </GraphProvider>
  );
}

export default App;
