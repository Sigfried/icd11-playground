import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** If set, renders a lightweight per-panel fallback instead of full-screen. */
  panel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CRASH_LOG_KEY = 'icd11-last-crash';

/**
 * Read crash log from previous session (if any).
 * Does NOT delete — keeps it in localStorage for manual inspection
 * via `localStorage.getItem('icd11-last-crash')`.
 * New crashes overwrite the old log.
 */
export function readCrashLog(): { message: string; stack?: string; componentStack?: string; time: number } | null {
  try {
    const raw = localStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Catches render errors so the rest of the app keeps working.
 *
 * - Without `panel` prop: full-screen fallback with error details (used in main.tsx).
 * - With `panel` prop: lightweight per-panel fallback with reset button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.panel ? `ErrorBoundary:${this.props.panel}` : 'ErrorBoundary';
    console.error(`[${label}]`, error, info.componentStack);
    try {
      localStorage.setItem(CRASH_LOG_KEY, JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        panel: this.props.panel,
        time: Date.now(),
      }));
    } catch {
      // localStorage full — best effort
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Per-panel: lightweight inline fallback
      if (this.props.panel) {
        return (
          <div className="error-boundary-fallback">
            <p>Something went wrong in the {this.props.panel} panel.</p>
            <button onClick={this.handleReset}>Reset</button>
          </div>
        );
      }

      // Full-app: detailed fallback
      return (
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#1e1e1e', color: '#e0e0e0',
          fontFamily: 'system-ui, sans-serif', padding: '2rem',
        }}>
          <h2 style={{ color: '#e8a838', marginBottom: '1rem' }}>Something went wrong</h2>
          <pre style={{
            background: '#2d2d2d', padding: '1rem', borderRadius: '6px',
            maxWidth: '80vw', maxHeight: '40vh', overflow: 'auto',
            fontSize: '0.8rem', whiteSpace: 'pre-wrap',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: '1rem', padding: '8px 20px',
              background: 'rgba(86,156,214,0.2)', border: '1px solid #569cd6',
              color: '#9cdcfe', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
