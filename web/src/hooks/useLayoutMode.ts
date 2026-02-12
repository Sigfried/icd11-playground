import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Two switchable layout modes for the three-panel app:
 *
 * two-row:  top row (tree | detail)  /  bottom row (node-link full width)
 * two-col:  left col (tree)  /  right col (detail / node-link)
 */
export type LayoutMode = 'two-row' | 'two-col';

/** Sizes for the two-row layout */
interface TwoRowSizes {
  /** [topHeight, bottomHeight] */
  rows: [number, number];
  /** [treeWidth, detailWidth] within the top row */
  topCols: [number, number];
}

/** Sizes for the two-col layout */
interface TwoColSizes {
  /** [treeWidth, rightWidth] */
  cols: [number, number];
  /** [detailHeight, nodeLinkHeight] within the right column */
  rightRows: [number, number];
}

export interface LayoutSizes {
  twoRow: TwoRowSizes;
  twoCol: TwoColSizes;
}

/** Which divider is being dragged */
type DividerTag =
  | 'two-row:rows'      // horizontal divider between top/bottom rows
  | 'two-row:topCols'   // vertical divider within top row
  | 'two-col:cols'      // vertical divider between tree and right column
  | 'two-col:rightRows'; // horizontal divider within right column

const DIVIDER_WIDTH = 8; // matches CSS --panel-gap
const MIN_PANEL = 150;

const TWO_ROW_ROW_RATIOS = [0.55, 0.45];
const TWO_ROW_COL_RATIOS = [1, 0.7];
const TWO_COL_COL_RATIOS = [0.35, 0.65];
const TWO_COL_ROW_RATIOS = [0.4, 0.6]; // detail above, node-link below

function ratioSplit(total: number, ratios: number[]): [number, number] {
  const available = total - DIVIDER_WIDTH;
  const sum = ratios[0] + ratios[1];
  return [
    Math.max(MIN_PANEL, (ratios[0] / sum) * available),
    Math.max(MIN_PANEL, (ratios[1] / sum) * available),
  ];
}

function initSizes(containerW: number, containerH: number): LayoutSizes {
  const [topH, bottomH] = ratioSplit(containerH, TWO_ROW_ROW_RATIOS);
  const [treeW, detailW] = ratioSplit(containerW, TWO_ROW_COL_RATIOS);
  const [colTree, colRight] = ratioSplit(containerW, TWO_COL_COL_RATIOS);
  const [detailH, nlH] = ratioSplit(containerH, TWO_COL_ROW_RATIOS);
  return {
    twoRow: { rows: [topH, bottomH], topCols: [treeW, detailW] },
    twoCol: { cols: [colTree, colRight], rightRows: [detailH, nlH] },
  };
}

export function useLayoutMode() {
  const containerRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<LayoutMode>('two-row');
  const [sizes, setSizes] = useState<LayoutSizes | null>(null);
  const dragging = useRef<{
    tag: DividerTag;
    startPos: number;         // clientX or clientY at drag start
    startPair: [number, number]; // the two sizes being adjusted
  } | null>(null);

  // Initialize sizes from container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSizes(initSizes(el.clientWidth, el.clientHeight));
  }, []);

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'two-row' ? 'two-col' : 'two-row');
  }, []);

  const onDividerMouseDown = useCallback((tag: DividerTag, e: React.MouseEvent) => {
    if (!sizes) return;
    e.preventDefault();

    const isHorizontal = tag.endsWith('rows') || tag.endsWith('Rows');
    const startPos = isHorizontal ? e.clientY : e.clientX;

    let startPair: [number, number];
    switch (tag) {
      case 'two-row:rows':      startPair = [...sizes.twoRow.rows]; break;
      case 'two-row:topCols':   startPair = [...sizes.twoRow.topCols]; break;
      case 'two-col:cols':      startPair = [...sizes.twoCol.cols]; break;
      case 'two-col:rightRows': startPair = [...sizes.twoCol.rightRows]; break;
    }

    dragging.current = { tag, startPos, startPair };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const { tag: t, startPos: sp, startPair: pair } = dragging.current;
      const isH = t.endsWith('rows') || t.endsWith('Rows');
      const d = (isH ? ev.clientY : ev.clientX) - sp;
      const a = Math.max(MIN_PANEL, pair[0] + d);
      const b = Math.max(MIN_PANEL, pair[1] - d);

      setSizes(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        switch (t) {
          case 'two-row:rows':
            next.twoRow = { ...next.twoRow, rows: [a, b] };
            break;
          case 'two-row:topCols':
            next.twoRow = { ...next.twoRow, topCols: [a, b] };
            break;
          case 'two-col:cols':
            next.twoCol = { ...next.twoCol, cols: [a, b] };
            break;
          case 'two-col:rightRows':
            next.twoCol = { ...next.twoCol, rightRows: [a, b] };
            break;
        }
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
    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sizes]);

  return { containerRef, mode, toggleMode, sizes, onDividerMouseDown };
}
