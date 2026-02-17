/**
 * Global help mode interceptor.
 *
 * When help mode is active, a capture-phase click listener intercepts all clicks
 * on elements with `data-help-id` attributes. Normal handlers never see the click.
 *
 * Keyboard: `?` toggles help mode (when not in an input), Escape dismisses/exits.
 */

import { useEffect } from 'react';
import { isInputFocused } from '../utils/isInputFocused';

interface UseHelpModeOptions {
  helpMode: boolean;
  toggleHelpMode: () => void;
  showHelpEntry: (id: string, rect: DOMRect) => void;
  dismissHelpEntry: () => void;
  activeHelpEntry: { id: string; rect: DOMRect } | null;
}

export function useHelpMode({
  helpMode,
  toggleHelpMode,
  showHelpEntry,
  dismissHelpEntry,
  activeHelpEntry,
}: UseHelpModeOptions) {
  // Capture-phase click interceptor (only when help mode is active)
  useEffect(() => {
    if (!helpMode) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;

      const helpEl = target.closest('[data-help-id]');
      if (helpEl) {
        e.stopPropagation();
        e.preventDefault();
        const id = helpEl.getAttribute('data-help-id')!;
        const rect = helpEl.getBoundingClientRect();
        showHelpEntry(id, rect);
      } else {
        // Click outside any help-tagged element — dismiss popover
        dismissHelpEntry();
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [helpMode, showHelpEntry, dismissHelpEntry]);

  // Keyboard handler (always active)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // `?` key toggles help mode (only when not typing in an input)
      if (e.key === '?' && !isInputFocused()) {
        e.preventDefault();
        toggleHelpMode();
        return;
      }

      if (e.key === 'Escape' && helpMode) {
        e.preventDefault();
        e.stopPropagation();
        if (activeHelpEntry) {
          dismissHelpEntry();
        } else {
          toggleHelpMode();
        }
      }
    }

    // Use capture so we can intercept before other Escape handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [helpMode, toggleHelpMode, dismissHelpEntry, activeHelpEntry]);
}
