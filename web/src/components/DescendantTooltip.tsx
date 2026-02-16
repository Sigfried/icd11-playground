/**
 * Tree-view descendant badge tooltip.
 *
 * Shows a level-by-level breakdown of descendants with per-level "Expand" buttons.
 * Rendered as a portal to document.body for correct z-index/positioning.
 *
 * Hide/cancel timers are managed by the parent (TreeView) via onMouseEnter/onMouseLeave
 * props — the tooltip itself has no timers.
 */

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGraph, type TreePath, pathKey } from '../providers/GraphProvider';
import { computeDescendantLevels, type DescendantLevel } from '../utils/descendantLevels';
import './DescendantTooltip.css';

interface DescendantTooltipProps {
  nodeId: string;
  path: TreePath;
  anchorRect: DOMRect;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function DescendantTooltip({ nodeId, path, anchorRect, onClose, onMouseEnter, onMouseLeave }: DescendantTooltipProps) {
  const { getNode, getChildren, setExpandedPaths } = useGraph();
  const tipRef = useRef<HTMLDivElement>(null);

  const node = getNode(nodeId);
  const levels = computeDescendantLevels(nodeId, getChildren, 5);

  // Dismiss on click outside (but not on clicks inside the tooltip)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout so the click that opened the tooltip doesn't immediately close it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', onClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const expandToLevel = useCallback((_level: DescendantLevel, levelIdx: number) => {
    const throughLevels = levels.slice(0, levelIdx + 1);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      const expandBfs = (id: string, currentPath: string[], remainingDepth: number) => {
        next.add(pathKey(currentPath));
        if (remainingDepth <= 0) return;
        for (const child of getChildren(id)) {
          expandBfs(child.id, [...currentPath, child.id], remainingDepth - 1);
        }
      };
      expandBfs(nodeId, path, throughLevels.length);
      return next;
    });
    onClose();
  }, [nodeId, path, levels, getChildren, setExpandedPaths, onClose]);

  // Position: to the right of the anchor, or left if not enough room
  const tipStyle: React.CSSProperties = {
    position: 'fixed',
    left: anchorRect.right + 8,
    top: anchorRect.top,
  };

  // After first render, check if it overflows and flip if needed
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.right > window.innerWidth - 8) {
      tip.style.left = `${anchorRect.left - tipRect.width - 8}px`;
    }
    if (tipRect.bottom > window.innerHeight - 8) {
      tip.style.top = `${window.innerHeight - tipRect.height - 8}px`;
    }
  });

  if (!node) return null;

  return createPortal(
    <div
      ref={tipRef}
      className="desc-tooltip"
      style={tipStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="desc-tooltip-title">{node.title}</div>
      <div className="desc-tooltip-total">
        {node.descendantCount.toLocaleString()} descendants total
      </div>

      {levels.map((level, idx) => (
        <div key={level.label} className="desc-tooltip-level">
          <span className="desc-tooltip-level-label">
            {level.label} ({level.nodes.length.toLocaleString()})
          </span>
          <button
            className="desc-tooltip-level-btn"
            onClick={() => expandToLevel(level, idx)}
          >
            Expand
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
