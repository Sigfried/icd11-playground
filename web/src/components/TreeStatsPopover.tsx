/**
 * Tree Stats Popover — shows structural statistics about the tree.
 * Triggered from an info icon in the tree title bar.
 * Rendered as a portal to document.body, positioned near the anchor.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './TreeStatsPopover.css';

interface TreeStatsPopoverProps {
  anchorRect: DOMRect;
  onDismiss: () => void;
  totalConcepts: number;
  totalTreeRows: number;
  visibleRows: number;
  visibleUnique: number;
  filterNote: string | null;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

export function TreeStatsPopover({
  anchorRect, onDismiss,
  totalConcepts, totalTreeRows, visibleRows, visibleUnique, filterNote,
}: TreeStatsPopoverProps) {
  const tipRef = useRef<HTMLDivElement>(null);

  // Position after mount
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;

    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Place below the anchor, aligned left
    let left = anchorRect.left;
    let top = anchorRect.bottom + 6;

    // If too far right, shift left
    if (left + tipRect.width > vw - 12) {
      left = vw - tipRect.width - 12;
    }
    left = Math.max(8, left);

    // If too far down, flip above
    if (top + tipRect.height > vh - 12) {
      top = anchorRect.top - tipRect.height - 6;
    }
    top = Math.max(8, top);

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = 'visible';
  }, [anchorRect]);

  // Dismiss on click outside (deferred so the opening click doesn't dismiss)
  useEffect(() => {
    let cleanupFn: (() => void) | null = null;
    const timerId = setTimeout(() => {
      function onMouseDown(e: MouseEvent) {
        if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
          onDismiss();
        }
      }
      document.addEventListener('mousedown', onMouseDown, true);
      cleanupFn = () => document.removeEventListener('mousedown', onMouseDown, true);
    }, 0);
    return () => {
      clearTimeout(timerId);
      cleanupFn?.();
    };
  }, [onDismiss]);

  // Dismiss on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const polyRatio = totalConcepts > 0
    ? (totalTreeRows / totalConcepts).toFixed(1)
    : '—';

  return createPortal(
    <div ref={tipRef} className="tree-stats-popover" style={{ visibility: 'hidden' }}>
      <h4 className="tree-stats-title">Tree Statistics</h4>
      <table className="tree-stats-table">
        <tbody>
          <tr>
            <td className="tree-stats-label">Total concepts</td>
            <td className="tree-stats-value">{formatNum(totalConcepts)}</td>
          </tr>
          <tr>
            <td className="tree-stats-label">Total tree rows<span className="tree-stats-hint"> (fully expanded)</span></td>
            <td className="tree-stats-value">{formatNum(totalTreeRows)}</td>
          </tr>
          <tr className="tree-stats-derived">
            <td className="tree-stats-label">Polyhierarchy inflation</td>
            <td className="tree-stats-value">{polyRatio}×</td>
          </tr>
          <tr className="tree-stats-separator"><td colSpan={2}></td></tr>
          <tr>
            <td className="tree-stats-label">Visible rows</td>
            <td className="tree-stats-value">{formatNum(visibleRows)}</td>
          </tr>
          <tr>
            <td className="tree-stats-label">Visible unique concepts</td>
            <td className="tree-stats-value">{formatNum(visibleUnique)}</td>
          </tr>
        </tbody>
      </table>
      {filterNote && <p className="tree-stats-filter-note">{filterNote}</p>}
    </div>,
    document.body,
  );
}
