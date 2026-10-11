import type { CSSProperties } from 'react';
import './LoadingState.css';

interface LoadingStateProps {
  /** Full-page Suspense fallback */
  page?: boolean;
  /** Compact loader inside an existing card/grid */
  fill?: boolean;
  label?: string;
  style?: CSSProperties;
}

export function LoadingState({ page, fill, label = 'loading.........', style }: LoadingStateProps) {
  return (
    <div
      className={`loading-state${page ? ' is-page' : ''}${fill ? ' is-fill' : ''}`}
      role="status"
      aria-live="polite"
      style={style}
    >
      <span className="loading-state-text">{label}</span>
    </div>
  );
}
