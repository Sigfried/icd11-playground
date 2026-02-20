/**
 * sessionStorage-based crash checkpoint.
 *
 * Saves a lightweight snapshot of UI state so that after an automatic
 * reload (triggered by jank detection), the app can offer to restore
 * the user's previous view.
 *
 * Synchronous reads/writes — sessionStorage is fast for the ~2-5KB
 * payloads we produce.
 */

const CHECKPOINT_KEY = 'icd11-crash-checkpoint';
const CRASH_COUNT_KEY = 'icd11-crash-count';
const CRASH_WINDOW_KEY = 'icd11-crash-window-start';

/** Max crashes before we skip restore to break infinite crash loops. */
const MAX_CRASHES_BEFORE_BREAK = 2;
/** Time window (ms) in which MAX_CRASHES_BEFORE_BREAK must occur. */
const CRASH_WINDOW_MS = 30_000;
/** Stale checkpoint expiry (ms). */
const CHECKPOINT_TTL_MS = 30 * 60_000;

export interface CrashCheckpointData {
  selectedNodeId: string | null;
  displayedNodeIds: string[];
  expandedPaths: string[];
  searchQuery: string;
  timestamp: number;
  triggeredByCrash: boolean;
}

export function saveCrashCheckpoint(
  data: Omit<CrashCheckpointData, 'timestamp' | 'triggeredByCrash'>,
  triggeredByCrash = false,
): void {
  try {
    const checkpoint: CrashCheckpointData = { ...data, timestamp: Date.now(), triggeredByCrash };
    sessionStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
  } catch {
    // sessionStorage full or unavailable — best-effort
  }
}

/**
 * Load crash checkpoint. Only returns data that was saved by the
 * crash recovery trigger (triggeredByCrash=true). Periodic background
 * saves are invisible to callers — they exist only so the emergency
 * save in triggerRecovery can upgrade them.
 */
export function loadCrashCheckpoint(): CrashCheckpointData | null {
  try {
    const raw = sessionStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CrashCheckpointData;

    // Only show modal for crash-triggered checkpoints
    if (!data.triggeredByCrash) return null;

    // Expire stale checkpoints
    if (Date.now() - data.timestamp > CHECKPOINT_TTL_MS) {
      clearCrashCheckpoint();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearCrashCheckpoint(): void {
  try {
    sessionStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Increment crash counter. Returns true if we're in a crash loop
 * (too many crashes in the time window).
 */
export function incrementCrashCount(): boolean {
  try {
    const now = Date.now();
    const windowStart = Number(sessionStorage.getItem(CRASH_WINDOW_KEY)) || 0;

    // Reset window if expired
    if (now - windowStart > CRASH_WINDOW_MS) {
      sessionStorage.setItem(CRASH_WINDOW_KEY, String(now));
      sessionStorage.setItem(CRASH_COUNT_KEY, '1');
      return false;
    }

    const count = (Number(sessionStorage.getItem(CRASH_COUNT_KEY)) || 0) + 1;
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count));
    return count > MAX_CRASHES_BEFORE_BREAK;
  } catch {
    return false;
  }
}

/** Reset crash loop counters (called after a successful normal startup). */
export function resetCrashCount(): void {
  try {
    sessionStorage.removeItem(CRASH_COUNT_KEY);
    sessionStorage.removeItem(CRASH_WINDOW_KEY);
  } catch {
    // ignore
  }
}
