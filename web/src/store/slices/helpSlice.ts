/**
 * Help mode slice.
 *
 * Owns: helpMode, activeHelpEntry, helpContent.
 * helpContent is parsed once at module level (static).
 */

import { type HelpContent, parseHelpContent } from '../../utils/parseHelpContent';
import helpMarkdownRaw from '../../assets/help-content.md?raw';
import type { SetState, GetState } from '../types';

const HELP_CONTENT: HelpContent = parseHelpContent(helpMarkdownRaw);

export interface HelpSliceState {
  helpMode: boolean;
  activeHelpEntry: { id: string; rect: DOMRect } | null;
  helpContent: HelpContent;
}

export interface HelpSliceActions {
  toggleHelpMode: () => void;
  exitHelpMode: () => void;
  showHelpEntry: (id: string, rect: DOMRect) => void;
  dismissHelpEntry: () => void;
}

export function createHelpSlice(set: SetState, _get: GetState): HelpSliceState & HelpSliceActions {
  return {
    helpMode: false,
    activeHelpEntry: null,
    helpContent: HELP_CONTENT,

    toggleHelpMode: () => set(state => ({
      helpMode: !state.helpMode,
      activeHelpEntry: state.helpMode ? null : state.activeHelpEntry,
    })),

    exitHelpMode: () => set({ helpMode: false, activeHelpEntry: null }),

    showHelpEntry: (id, rect) => set({ activeHelpEntry: { id, rect } }),

    dismissHelpEntry: () => set({ activeHelpEntry: null }),
  };
}
