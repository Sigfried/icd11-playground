import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  panel: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in a single panel so the rest of the app keeps working.
 * Uses a key-based reset: incrementing `resetKey` forces React to unmount and
 * remount the children, clearing the error state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.panel}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback">
          <p>Something went wrong in the {this.props.panel} panel.</p>
          <button onClick={this.handleReset}>Reset</button>
        </div>
      );
    }
    return this.props.children;
  }
}
