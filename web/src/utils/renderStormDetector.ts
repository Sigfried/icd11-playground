/**
 * Dev-only render storm detector.
 *
 * Call `trackRender(componentName)` at the top of a component body.
 * If > THRESHOLD renders happen within WINDOW_MS, logs a warning with
 * timestamps and writes to localStorage for post-crash analysis.
 */

const THRESHOLD = 50;
const WINDOW_MS = 1000;

const counters = new Map<string, number[]>();

export function trackRender(name: string): void {
  if (import.meta.env.PROD) return;

  const now = Date.now();
  let timestamps = counters.get(name);
  if (!timestamps) {
    timestamps = [];
    counters.set(name, timestamps);
  }

  timestamps.push(now);

  // Prune old entries
  const cutoff = now - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length > THRESHOLD) {
    const msg = `[render storm] ${name}: ${timestamps.length} renders in ${WINDOW_MS}ms`;
    console.warn(msg);
    try {
      localStorage.setItem('icd11-render-storm', JSON.stringify({
        component: name,
        count: timestamps.length,
        window: WINDOW_MS,
        time: now,
      }));
    } catch { /* best effort */ }
  }
}
