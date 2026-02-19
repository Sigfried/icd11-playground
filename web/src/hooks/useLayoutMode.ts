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
 * Panels use CSS calc() with custom properties (--vert, --horz) so resize is
 * free during drag — DOM updates bypass React entirely via RAF, and React state
 * is only committed on mouseup.
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

  // Ref to the <main> element for direct DOM updates during drag
  const mainRef = useRef<HTMLElement | null>(null);

  const dragging = useRef<{
    which: 'vert' | 'horz';
    startRatio: number;
    startPos: number;
  } | null>(null);
  const pendingRatio = useRef(0);
  const rafId = useRef<number | null>(null);

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
    // Read current ratio from the CSS custom property (source of truth during drag)
    const mainEl = (e.currentTarget as HTMLElement).closest('main');
    mainRef.current = mainEl;
    const startRatio = which === 'vert' ? vert : horz;

    dragging.current = { which, startRatio, startPos };
    const prop = which === 'vert' ? '--vert' : '--horz';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const { startRatio: sr, startPos: sp } = dragging.current;
      const currentPos = isHorizontal ? ev.clientY : ev.clientX;
      const viewportDim = isHorizontal ? window.innerHeight : window.innerWidth;
      pendingRatio.current = Math.max(0, Math.min(1, sr + (currentPos - sp) / viewportDim));
      // Coalesce into one DOM update per frame — no React involved
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = null;
          mainRef.current?.style.setProperty(prop, String(pendingRatio.current));
        });
      }
    };

    const onMouseUp = () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Commit final value to React state (single re-render) + persist
      const final = pendingRatio.current;
      const setRatio = which === 'vert' ? setVert : setHorz;
      const lsKey = which === 'vert' ? LS_VERT_KEY : LS_HORZ_KEY;
      setRatio(final);
      saveRatio(lsKey, final);
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
