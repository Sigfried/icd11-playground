import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary, readCrashLog } from './components/ErrorBoundary'
import { initRecoveryOverlay } from './utils/crashRecovery'

// Global error handlers — catch things that slip past React error boundaries
window.addEventListener('error', (e) => {
  console.error('[global error]', e.error ?? e.message);
  try {
    localStorage.setItem('icd11-last-crash', JSON.stringify({
      message: e.error?.message ?? e.message,
      stack: e.error?.stack ?? '(no stack)',
      time: Date.now(),
      source: 'window.onerror',
    }));
  } catch { /* best effort */ }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason);
  try {
    localStorage.setItem('icd11-last-crash', JSON.stringify({
      message: String(e.reason),
      stack: e.reason?.stack ?? '(no stack)',
      time: Date.now(),
      source: 'unhandledrejection',
    }));
  } catch { /* best effort */ }
});

// Check for crash log from previous session (kept in localStorage for manual inspection)
const prevCrash = readCrashLog();
if (prevCrash) {
  console.warn('[Previous crash log]', prevCrash);
  console.warn('  Inspect: localStorage.getItem("icd11-last-crash")');
}

// Pre-build recovery overlay before React mounts (plain DOM, no React)
initRecoveryOverlay()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
