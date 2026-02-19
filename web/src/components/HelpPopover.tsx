/**
 * Help popover — shown when clicking a `data-help-id` element in help mode.
 * Rendered as a portal to document.body, positioned near the anchor DOMRect.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import type { HelpEntry } from '../utils/parseHelpContent';
import './HelpPopover.css';

interface HelpPopoverProps {
  entry: HelpEntry | undefined;
  helpId: string;
  anchorRect: DOMRect;
  onDismiss: () => void;
}

export function HelpPopover({ entry, helpId, anchorRect, onDismiss }: HelpPopoverProps) {
  const tipRef = useRef<HTMLDivElement>(null);

  // Position after mount
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;

    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try placing to the right of the anchor
    let left = anchorRect.right + 8;
    if (left + tipRect.width > vw - 12) {
      // Flip left
      left = anchorRect.left - tipRect.width - 8;
    }
    // Clamp horizontally
    left = Math.max(8, Math.min(left, vw - tipRect.width - 8));

    // Vertically: align top with anchor, clamp to viewport
    let top = anchorRect.top;
    top = Math.max(8, Math.min(top, vh - tipRect.height - 8));

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

  const content = entry ? (
    <>
      <h4 className="help-popover-title">{entry.title}</h4>
      {entry.description && <div className="help-popover-description"><Markdown>{entry.description}</Markdown></div>}
      {entry.interactions.length > 0 && (
        <ul className="help-popover-interactions">
          {entry.interactions.map((item, i) => <li key={i}><Markdown>{item}</Markdown></li>)}
        </ul>
      )}
      {entry.shortcut && (
        <p className="help-popover-shortcut">
          Shortcut: <kbd>{entry.shortcut}</kbd>
        </p>
      )}
      {entry.context && <div className="help-popover-context"><Markdown>{entry.context}</Markdown></div>}
    </>
  ) : (
    <p className="help-popover-unknown">No help available for "{helpId}"</p>
  );

  return createPortal(
    <div
      ref={tipRef}
      className="help-popover"
      style={{ visibility: 'hidden' }} // hidden until positioned
    >
      {content}
    </div>,
    document.body,
  );
}
