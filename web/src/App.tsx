import { useCallback, useState, useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { TreeView } from './components/TreeView';
import { NodeLinkView } from './components/NodeLinkView';
import { DetailPanel } from './components/DetailPanel';
import { ResumeModal } from './components/ResumeModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AboutPanel } from './components/AboutPanel';
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
        <svg width="20" height="16" viewBox="0 0 20 16">
          <rect x="0.5" y="0.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1" />
          <line x1="8" y1="8" x2="19" y2="8" stroke="currentColor" strokeWidth="1" />
        </svg>
      ) : (
        <svg width="20" height="16" viewBox="0 0 20 16">
          <rect x="0.5" y="0.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="1" x2="10" y2="9" stroke="currentColor" strokeWidth="1" />
          <line x1="1" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth="1" />
        </svg>
      )}
    </button>
  );
}

/** Runs init effects: graph load, history restore, URL snapshot, about panel. */
function AppInit() {
  const initGraph = useAppStore(s => s.initGraph);
  const initHistory = useAppStore(s => s.initHistory);
  const applyUrlSnapshot = useAppStore(s => s.applyUrlSnapshot);
  const graphLoading = useAppStore(s => s.graphLoading);
  const rootId = useAppStore(s => s.rootId);
  const historyInitComplete = useAppStore(s => s.historyInitComplete);
  const pendingRestore = useAppStore(s => s.pendingRestore);
  const setShowAbout = useAppStore(s => s.setShowAbout);

  const graphReady = !graphLoading && rootId !== null;

  // Load graph on mount
  useEffect(() => { initGraph(); }, [initGraph]);

  // Load history after graph is ready
  useEffect(() => {
    if (graphReady) initHistory();
  }, [graphReady, initHistory]);

  // Apply URL snapshot after history init
  useEffect(() => {
    if (graphReady && historyInitComplete) applyUrlSnapshot();
  }, [graphReady, historyInitComplete, applyUrlSnapshot]);

  // Auto-show About panel on first visit
  useEffect(() => {
    if (!graphReady || pendingRestore) return;
    if (!localStorage.getItem('icd11-hide-about')) {
      setShowAbout(true);
    }
  }, [graphReady, pendingRestore, setShowAbout]);

  return null;
}

function GlobalResumeModal() {
  const pendingRestore = useAppStore(s => s.pendingRestore);
  if (!pendingRestore) return null;
  return <ResumeModal pending={pendingRestore} />;
}

function GlobalHelpPopover() {
  const activeHelpEntry = useAppStore(s => s.activeHelpEntry);
  const helpContent = useAppStore(s => s.helpContent);
  const dismissHelpEntry = useAppStore(s => s.dismissHelpEntry);
  if (!activeHelpEntry) return null;
  const entry = helpContent.entries.get(activeHelpEntry.id);
  return (
    <HelpPopover
      entry={entry}
      helpId={activeHelpEntry.id}
      anchorRect={activeHelpEntry.rect}
      onDismiss={dismissHelpEntry}
    />
  );
}

function GlobalAboutPanel() {
  const showAbout = useAppStore(s => s.showAbout);
  const helpContent = useAppStore(s => s.helpContent);
  const setShowAbout = useAppStore(s => s.setShowAbout);
  const pendingRestore = useAppStore(s => s.pendingRestore);

  const [hideOnStartup, setHideOnStartup] = useState(
    () => localStorage.getItem('icd11-hide-about') === 'true'
  );

  const handleHideOnStartup = useCallback((hide: boolean) => {
    setHideOnStartup(hide);
    if (hide) {
      localStorage.setItem('icd11-hide-about', 'true');
    } else {
      localStorage.removeItem('icd11-hide-about');
    }
  }, []);

  const handleDismiss = useCallback(() => setShowAbout(false), [setShowAbout]);

  if (!showAbout || pendingRestore) return null;
  return (
    <AboutPanel
      helpContent={helpContent}
      onDismiss={handleDismiss}
      onHideOnStartup={handleHideOnStartup}
      hideOnStartup={hideOnStartup}
    />
  );
}

function HelpModeInterceptor() {
  const helpMode = useAppStore(s => s.helpMode);
  const toggleHelpMode = useAppStore(s => s.toggleHelpMode);
  const exitHelpMode = useAppStore(s => s.exitHelpMode);
  const showHelpEntry = useAppStore(s => s.showHelpEntry);
  const dismissHelpEntry = useAppStore(s => s.dismissHelpEntry);
  const activeHelpEntry = useAppStore(s => s.activeHelpEntry);
  const helpContent = useAppStore(s => s.helpContent);
  useHelpMode({ helpMode, toggleHelpMode, exitHelpMode, showHelpEntry, dismissHelpEntry, activeHelpEntry, helpContent });
  return null;
}

function AboutButton() {
  const setShowAbout = useAppStore(s => s.setShowAbout);
  return (
    <button
      className="about-button"
      data-help-id="about-button"
      onClick={() => setShowAbout(true)}
      title="About this tool"
    >
      &#9432;
    </button>
  );
}

function ShareButton() {
  const shareCurrentView = useAppStore(s => s.shareCurrentView);
  const displayedNodeIds = useAppStore(s => s.displayedNodeIds);
  const [copied, setCopied] = useState(false);
  const disabled = displayedNodeIds.size === 0;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      className={`share-button${copied ? ' copied' : ''}`}
      data-help-id="share-button"
      disabled={disabled}
      onClick={async () => {
        const ok = await shareCurrentView();
        if (ok) setCopied(true);
      }}
      title={copied ? 'Copied!' : 'Copy shareable link to clipboard'}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8 7 12 13 4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="8" r="2" />
          <circle cx="12" cy="3.5" r="2" />
          <circle cx="12" cy="12.5" r="2" />
          <line x1="5.8" y1="7" x2="10.2" y2="4.5" />
          <line x1="5.8" y1="9" x2="10.2" y2="11.5" />
        </svg>
      )}
    </button>
  );
}

function HelpToggle() {
  const helpMode = useAppStore(s => s.helpMode);
  const toggleHelpMode = useAppStore(s => s.toggleHelpMode);
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
  const { mode, toggleMode, vert, horz, onDividerMouseDown, collapsed } = useLayoutMode();

  const dividerClass = (orientation: 'vertical' | 'horizontal', before: boolean, after: boolean) => {
    const classes = ['panel-divider', orientation];
    if (before) classes.push('collapsed-before');
    if (after) classes.push('collapsed-after');
    return classes.join(' ');
  };

  const headerHidden = horz < 0.05;

  return (
    <>
      <AppInit />
      <HelpModeInterceptor />
      <GlobalResumeModal />
      <GlobalAboutPanel />
      <GlobalHelpPopover />
      <div className="app">
        <header className="app-header" style={headerHidden ? { display: 'none' } : undefined}>
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
          <ShareButton />
          <HelpToggle />
          <AboutButton />
          <LayoutToggle mode={mode} onToggle={toggleMode} />
        </header>

        {mode === 'two-row' ? (
          <main className="app-main two-row" style={{ '--vert': vert, '--horz': horz } as React.CSSProperties}>
            <div className="layout-top">
              <div className="panel tree-panel panel-vert">
                <ErrorBoundary panel="tree"><TreeView /></ErrorBoundary>
              </div>
              <div
                className={dividerClass('vertical', collapsed.vertBefore, collapsed.vertAfter)}
                data-help-id="panel-divider"
                onMouseDown={e => onDividerMouseDown('vert', e)}
              />
              <div className="panel detail-panel panel-vert-complement">
                <ErrorBoundary panel="detail"><DetailPanel /></ErrorBoundary>
              </div>
            </div>
            <div
              className={dividerClass('horizontal', collapsed.horzBefore, collapsed.horzAfter)}
              data-help-id="panel-divider"
              onMouseDown={e => onDividerMouseDown('horz', e)}
            />
            <div className="panel node-link-panel panel-horz-complement">
              <ErrorBoundary panel="node-link"><NodeLinkView /></ErrorBoundary>
            </div>
          </main>
        ) : (
          <main className="app-main two-col" style={{ '--vert': vert, '--horz': horz } as React.CSSProperties}>
            <div className="panel tree-panel panel-vert">
              <ErrorBoundary panel="tree"><TreeView /></ErrorBoundary>
            </div>
            <div
              className={dividerClass('vertical', collapsed.vertBefore, collapsed.vertAfter)}
              data-help-id="panel-divider"
              onMouseDown={e => onDividerMouseDown('vert', e)}
            />
            <div className="layout-right panel-vert-complement">
              <div className="panel detail-panel panel-horz">
                <ErrorBoundary panel="detail"><DetailPanel /></ErrorBoundary>
              </div>
              <div
                className={dividerClass('horizontal', collapsed.horzBefore, collapsed.horzAfter)}
                data-help-id="panel-divider"
                onMouseDown={e => onDividerMouseDown('horz', e)}
              />
              <div className="panel node-link-panel panel-horz-complement">
                <ErrorBoundary panel="node-link"><NodeLinkView /></ErrorBoundary>
              </div>
            </div>
          </main>
        )}
      </div>
    </>
  );
}

export default function App() {
  return <AppContent />;
}
