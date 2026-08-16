import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this remounts the boundary's children, clearing a caught error — pass the current route path so a crash on one page doesn't stay stuck after navigating away. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Hooks can't catch render errors — a class component is the only way. Without this, any unguarded render-time exception blanks the entire app to the bare dark background (no fallback existed anywhere before this). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="view-head">
        <h1>Something went wrong</h1>
        <span className="sub">This section hit an unexpected error</span>
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <p className="muted">
            The rest of the app is still working — try reloading this page. If it keeps happening, the
            underlying data may be in an unexpected shape.
          </p>
          {import.meta.env.DEV && (
            <pre style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', color: 'var(--red-2)', marginTop: 10 }}>
              {this.state.error.message}
            </pre>
          )}
          <button className="btn btn-primary mt" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
