import { useCallback, useRef, useState } from 'react';

/**
 * Two switchable layout modes for the three-panel app:
 *
 * two-row:  top row (tree | detail)  /  bottom row (node-link full width)
 * two-col:  left col (tree)  /  right col (detail / node-link)
 *
 * Layout is controlled by two viewport-relative ratios (0–1):
 *   vert — where the vertical divider sits as a fraction of its container width
 *   horz — where the horizontal divider sits as a fraction of its container height
 *
 * Panels use CSS calc() so resize is free — no ResizeObserver needed.
 */
export type LayoutMode = 'two-row' | 'two-col';

const LS_MODE_KEY = 'icd11-layout-mode';
const LS_VERT_KEY = 'icd11-layout-vert';
const LS_HORZ_KEY = 'icd11-layout-horz';

const DEFAULT_VERT = 0.55;
const DEFAULT_HORZ = 0.55;
const COLLAPSE_THRESHOLD = 0.01;

function loadMode(): LayoutMode {
  const raw = localStorage.getItem(LS_MODE_KEY);
  return raw === 'two-col' ? 'two-col' : 'two-row';
}

function loadRatio(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  } catch { return fallback; }
}

function saveRatio(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* quota */ }
}

export function useLayoutMode() {
  const [mode, setMode] = useState<LayoutMode>(loadMode);
  const [vert, setVert] = useState(() => loadRatio(LS_VERT_KEY, DEFAULT_VERT));
  const [horz, setHorz] = useState(() => loadRatio(LS_HORZ_KEY, DEFAULT_HORZ));
  const dragging = useRef<{
    which: 'vert' | 'horz';
    startRatio: number;
    startPos: number;
  } | null>(null);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === 'two-row' ? 'two-col' : 'two-row';
      try { localStorage.setItem(LS_MODE_KEY, next); } catch { /* quota */ }
      return next;
    });
  }, []);

  const onDividerMouseDown = useCallback((which: 'vert' | 'horz', e: React.MouseEvent) => {
    e.preventDefault();
    const isHorizontal = which === 'horz';
    const startPos = isHorizontal ? e.clientY : e.clientX;
    const startRatio = which === 'vert' ? vert : horz;

    dragging.current = { which, startRatio, startPos };

    const setRatio = which === 'vert' ? setVert : setHorz;
    const lsKey = which === 'vert' ? LS_VERT_KEY : LS_HORZ_KEY;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const { startRatio: sr, startPos: sp } = dragging.current;
      const currentPos = isHorizontal ? ev.clientY : ev.clientX;
      const viewportDim = isHorizontal ? window.innerHeight : window.innerWidth;
      const newRatio = Math.max(0, Math.min(1, sr + (currentPos - sp) / viewportDim));
      setRatio(newRatio);
    };

    const onMouseUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist final ratio
      setRatio(prev => { saveRatio(lsKey, prev); return prev; });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [vert, horz]);

  const collapsed = {
    vertBefore: vert < COLLAPSE_THRESHOLD,
    vertAfter: vert > 1 - COLLAPSE_THRESHOLD,
    horzBefore: horz < COLLAPSE_THRESHOLD,
    horzAfter: horz > 1 - COLLAPSE_THRESHOLD,
  };

  return { mode, toggleMode, vert, horz, onDividerMouseDown, collapsed };
}
