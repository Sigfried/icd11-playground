/**
 * Crash recovery trigger.
 *
 * Pre-builds a hidden DOM overlay at import time (outside React).
 * When triggered by the heartbeat monitor:
 *  1. Show "Recovering..." overlay (zero DOM construction cost)
 *  2. Emergency-save checkpoint from state ref
 *  3. Check crash loop counter — if looping, clear checkpoint before reload
 *  4. Reload after 100ms (lets overlay paint)
 */

import { saveCrashCheckpoint, incrementCrashCount, clearCrashCheckpoint } from './crashCheckpoint';

/** State getter registered by GraphProvider. Returns current state from a ref (not stale closure). */
type StateGetter = () => {
  selectedNodeId: string | null;
  displayedNodeIds: string[];
  expandedPaths: string[];
  searchQuery: string;
};

let stateGetter: StateGetter | null = null;
let overlay: HTMLDivElement | null = null;

export function registerStateGetter(fn: StateGetter): void {
  stateGetter = fn;
}

/**
 * Create the hidden overlay and attach it to document.body.
 * Call this from main.tsx before React mounts.
 */
export function initRecoveryOverlay(): void {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'crash-recovery-overlay';
  Object.assign(overlay.style, {
    display: 'none',
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    background: 'rgba(30, 30, 30, 0.92)',
    color: '#e0e0e0',
    fontSize: '1.1rem',
    fontFamily: 'system-ui, sans-serif',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '12px',
  });

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '28px',
    height: '28px',
    border: '3px solid rgba(255,255,255,0.15)',
    borderTopColor: '#e8a838',
    borderRadius: '50%',
    animation: 'crash-spin 0.8s linear infinite',
  });

  const text = document.createElement('div');
  text.textContent = 'Recovering...';

  overlay.appendChild(spinner);
  overlay.appendChild(text);

  // Inject keyframes for the spinner
  const style = document.createElement('style');
  style.textContent = '@keyframes crash-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);

  document.body.appendChild(overlay);
}

/**
 * Called by the heartbeat monitor when jank is detected.
 * Shows overlay, saves state, reloads.
 */
export function triggerRecovery(): void {
  // 1. Show overlay
  if (overlay) {
    overlay.style.display = 'flex';
  }

  // 2. Emergency-save checkpoint
  if (stateGetter) {
    try {
      const state = stateGetter();
      saveCrashCheckpoint(state, true);
    } catch {
      // Best effort — the main thread may be barely responsive
    }
  }

  // 3. Check crash loop
  const isLooping = incrementCrashCount();
  if (isLooping) {
    clearCrashCheckpoint();
  }

  // 4. Reload after a brief delay so the overlay can paint
  setTimeout(() => {
    location.reload();
  }, 100);
}
