/**
 * RAF-based jank detector.
 *
 * Schedules requestAnimationFrame in a loop and measures wall-clock gaps.
 * If 3 consecutive frames each exceed JANK_THRESHOLD_MS, fires the callback
 * once (won't re-fire until restarted).
 *
 * Overhead during normal operation: ~0.01ms per frame (one Date.now() call).
 */

const JANK_THRESHOLD_MS = 200;
const CONSECUTIVE_JANK_FRAMES = 3;

let rafId: number | null = null;
let lastTimestamp = 0;
let jankCount = 0;
let fired = false;

export function startHeartbeat(onJank: () => void): void {
  stopHeartbeat();
  fired = false;
  jankCount = 0;
  lastTimestamp = Date.now();

  function tick() {
    const now = Date.now();
    const delta = now - lastTimestamp;
    lastTimestamp = now;

    if (delta > JANK_THRESHOLD_MS) {
      jankCount++;
      if (jankCount >= CONSECUTIVE_JANK_FRAMES && !fired) {
        fired = true;
        onJank();
        return; // stop the loop after firing
      }
    } else {
      jankCount = 0;
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}

export function stopHeartbeat(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
