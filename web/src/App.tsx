import { useCallback, useEffect, useRef, useState } from 'react';
import { GraphProvider } from './providers/GraphProvider';
import { TreeView } from './components/TreeView';
import { NodeLinkView } from './components/NodeLinkView';
import { DetailPanel } from './components/DetailPanel';
import './App.css';

/**
 * ICD-11 Foundation Visual Maintenance Tool
 *
 * Main application layout with three resizable panels:
 * - TreeView: Indented hierarchical navigation (primary)
 * - NodeLinkView: DAG visualization of local neighborhood
 * - DetailPanel: Entity metadata, parents, children, proposals
 */

const DIVIDER_WIDTH = 8; // matches CSS --panel-gap
const MIN_PANEL = 150;
const INITIAL_RATIOS = [1, 1, 0.7];

function usePanelResize() {
  const containerRef = useRef<HTMLElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const dragging = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

  // Initialize widths from container on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const totalAvailable = containerRef.current.clientWidth - DIVIDER_WIDTH * 2;
    const totalRatio = INITIAL_RATIOS.reduce((a, b) => a + b, 0);
    setWidths(INITIAL_RATIOS.map(r => (r / totalRatio) * totalAvailable));
  }, []);

  const onMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    if (!widths) return;
    e.preventDefault();
    dragging.current = { index, startX: e.clientX, startWidths: [...widths] };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const { index: i, startX, startWidths: sw } = dragging.current;
      const dx = ev.clientX - startX;
      const left = Math.max(MIN_PANEL, sw[i] + dx);
      const right = Math.max(MIN_PANEL, sw[i + 1] - dx);
      setWidths(prev => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = left;
        next[i + 1] = right;
        return next;
      });
    };

    const onMouseUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [widths]);

  return { containerRef, widths, onMouseDown };
}

function App() {
  const { containerRef, widths, onMouseDown } = usePanelResize();

  return (
    <GraphProvider>
      <div className="app">
        <header className="app-header">
          <h1><a href={import.meta.env.BASE_URL}>ICD-11 Foundation Explorer</a></h1>
          <span className="app-subtitle">Visual Maintenance Tool Prototype</span>
        </header>

        <main className="app-main" ref={containerRef}>
          <div className="panel tree-panel" style={widths ? { width: widths[0] } : undefined}>
            <TreeView />
          </div>

          <div className="panel-divider" onMouseDown={e => onMouseDown(0, e)} />

          <div className="panel node-link-panel" style={widths ? { width: widths[1] } : undefined}>
            <NodeLinkView />
          </div>

          <div className="panel-divider" onMouseDown={e => onMouseDown(1, e)} />

          <div className="panel detail-panel" style={widths ? { width: widths[2] } : undefined}>
            <DetailPanel />
          </div>
        </main>
      </div>
    </GraphProvider>
  );
}

export default App;
