import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert, FileX, Home } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global error boundary that catches rendering crashes
 * and displays a recovery UI instead of a white screen.
 *
 * Features:
 * - Error logging to console (extend to Sentry in production)
 * - Error type detection for specific recovery UI
 * - Accessibility attributes for screen readers
 * - Keyboard navigation support
 * - Cross-app navigation (back to dashboard)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to external service in production
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      const errorData = {
        error: error.toString(),
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };
      console.error('Error logged:', errorData);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  getErrorType(): string {
    const { error } = this.state;
    if (!error) return 'unknown';

    const message = error.message || '';

    if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
      return 'network';
    }
    if (message.includes('permission') || message.includes('unauthorized') || message.includes('401')) {
      return 'permission';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'notfound';
    }
    return 'unknown';
  }

  getErrorIcon() {
    const type = this.getErrorType();
    switch (type) {
      case 'network':
        return <WifiOff className="w-8 h-8 text-amber-400" aria-hidden="true" />;
      case 'permission':
        return <ShieldAlert className="w-8 h-8 text-red-400" aria-hidden="true" />;
      case 'notfound':
        return <FileX className="w-8 h-8 text-slate-400" aria-hidden="true" />;
      default:
        return <AlertTriangle className="w-8 h-8 text-red-400" aria-hidden="true" />;
    }
  }

  getErrorTitle(): string {
    const type = this.getErrorType();
    switch (type) {
      case 'network':
        return 'Connection Error';
      case 'permission':
        return 'Permission Denied';
      case 'notfound':
        return 'Resource Not Found';
      default:
        return 'Something went wrong';
    }
  }

  getErrorDescription(): string {
    const type = this.getErrorType();
    switch (type) {
      case 'network':
        return 'Unable to connect to the server. Please check your internet connection and try again.';
      case 'permission':
        return 'You do not have permission to perform this action. Please log in or contact support.';
      case 'notfound':
        return 'The requested resource could not be found.';
      default:
        return 'An unexpected error occurred. This has been logged. Try refreshing the page.';
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-screen bg-slate-950 flex items-center justify-center p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center backdrop-blur-xl">
            <div
              className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6"
              role="img"
              aria-label="Error icon"
            >
              {this.getErrorIcon()}
            </div>
            <h1 className="text-2xl font-black text-white mb-2">
              {this.getErrorTitle()}
            </h1>
            <p className="text-slate-400 text-sm mb-6">
              {this.getErrorDescription()}
            </p>
            {this.state.error?.message && (
              <pre
                className="text-xs text-red-300/80 bg-slate-800 rounded-xl p-4 mb-6 overflow-auto text-left max-h-32"
                aria-label="Error details"
              >
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col gap-3" role="group" aria-label="Error recovery actions">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                aria-label="Try to recover from error"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Try again
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/dashboard'; }}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                aria-label="Go to dashboard"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                Go to Dashboard
              </button>
              <button
                type="button"
                onClick={() => { window.location.reload(); }}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500"
                aria-label="Reload the page"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
