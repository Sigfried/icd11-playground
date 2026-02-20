/**
 * Global help mode interceptor.
 *
 * When help mode is active:
 * - Capture-phase click listener intercepts clicks on `data-help-id` elements
 * - All `[data-help-id]` elements get their `title` replaced with the help entry name
 * - All other `[title]` elements get their titles suppressed (blanked)
 * - Keyboard: `?` toggles help mode, Escape dismisses/exits
 */

import { useEffect } from 'react';
import { isInputFocused } from '../utils/isInputFocused';
import type { HelpContent } from '../utils/parseHelpContent';

interface UseHelpModeOptions {
  helpMode: boolean;
  toggleHelpMode: () => void;
  exitHelpMode: () => void;
  showHelpEntry: (id: string, rect: DOMRect) => void;
  dismissHelpEntry: () => void;
  activeHelpEntry: { id: string; rect: DOMRect } | null;
  helpContent: HelpContent;
}

export function useHelpMode({
  helpMode,
  toggleHelpMode,
  exitHelpMode,
  showHelpEntry,
  dismissHelpEntry,
  activeHelpEntry,
  helpContent,
}: UseHelpModeOptions) {
  // Toggle body class for cursor
  useEffect(() => {
    document.body.classList.toggle('help-mode', helpMode);
    return () => { document.body.classList.remove('help-mode'); };
  }, [helpMode]);

  // Exit help mode when window loses focus (tab switch, alt-tab, etc.)
  useEffect(() => {
    if (!helpMode) return;
    const handleBlur = () => exitHelpMode();
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [helpMode, exitHelpMode]);

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
      } else if (!target.closest('.help-popover')) {
        // Click outside any help-tagged element and outside popover — dismiss
        dismissHelpEntry();
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [helpMode, showHelpEntry, dismissHelpEntry]);

  // On entering help mode: replace titles on help elements, suppress all others.
  // On exiting: restore everything.
  useEffect(() => {
    if (!helpMode) return;

    const isSvg = (el: Element) => el instanceof SVGElement;
    const svgTitleEls: SVGTitleElement[] = [];

    // Set help entry titles on all [data-help-id] elements
    const helpEls = document.querySelectorAll('[data-help-id]');
    helpEls.forEach(el => {
      const existing = el.getAttribute('title');
      if (existing) (el as HTMLElement).dataset.origTitle = existing;
      const id = el.getAttribute('data-help-id')!;
      const entry = helpContent.entries.get(id);
      const helpTitle = `? ${entry?.title ?? id}`;

      if (isSvg(el)) {
        // SVG elements need a <title> child for browser tooltips
        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleEl.textContent = helpTitle;
        el.prepend(titleEl);
        svgTitleEls.push(titleEl);
      } else {
        (el as HTMLElement).setAttribute('title', helpTitle);
      }
    });

    // Suppress native titles on all other [title] elements.
    // Remove (not blank) so child elements inherit the parent's help title.
    const titledEls = document.querySelectorAll<HTMLElement>('[title]');
    titledEls.forEach(el => {
      if (el.hasAttribute('data-help-id')) return;
      const val = el.getAttribute('title');
      if (val) {
        el.dataset.origTitle = val;
        el.removeAttribute('title');
      }
    });

    return () => {
      // Remove SVG <title> elements we injected
      svgTitleEls.forEach(el => el.remove());
      // Restore stashed titles — but only if React hasn't already set a new value.
      // Our synthetic titles start with "? " or are empty; if the current value is
      // something else, React already updated it, so leave it alone.
      document.querySelectorAll<HTMLElement>('[data-orig-title]').forEach(el => {
        const current = el.getAttribute('title') ?? '';
        if (!current || current.startsWith('? ')) {
          el.setAttribute('title', el.dataset.origTitle!);
        }
        delete el.dataset.origTitle;
      });
      // Remove synthetic help titles from HTML elements that had none originally
      helpEls.forEach(el => {
        if (!isSvg(el) && !(el as HTMLElement).dataset.origTitle) {
          const current = el.getAttribute('title') ?? '';
          if (current.startsWith('? ')) el.removeAttribute('title');
        }
      });
    };
  }, [helpMode, helpContent]);

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
