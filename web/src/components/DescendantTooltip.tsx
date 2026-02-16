/**
 * Tree-view descendant badge tooltip.
 *
 * Shows a level-by-level breakdown of descendants with per-level "Expand" buttons.
 * Rendered as a portal to document.body for correct z-index/positioning.
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
}

export function DescendantTooltip({ nodeId, path, anchorRect, onClose }: DescendantTooltipProps) {
  const { getNode, getChildren, setExpandedPaths } = useGraph();
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const node = getNode(nodeId);
  const levels = computeDescendantLevels(nodeId, getChildren, 5);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(onClose, 150);
  }, [onClose, cancelHide]);

  // Dismiss on scroll or click outside
  useEffect(() => {
    const onScroll = () => onClose();
    const onClick = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('mousedown', onClick);
      cancelHide();
    };
  }, [onClose, cancelHide]);

  const expandToLevel = useCallback((_level: DescendantLevel, levelIdx: number) => {
    // Expand the tree to show all descendants through this level
    const throughLevels = levels.slice(0, levelIdx + 1);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      // BFS expand: for each level, expand all nodes in all preceding levels
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

  // After first render, check if it overflows right and flip if needed
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.right > window.innerWidth - 8) {
      tip.style.left = `${anchorRect.left - tipRect.width - 8}px`;
    }
    // Vertical: keep in viewport
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
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
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
