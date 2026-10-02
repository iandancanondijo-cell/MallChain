import './bufferPolyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

// F5: Disable React DevTools in production — prevents state inspection
// via the browser extension. Must run before createRoot so React doesn't
// register with the devtools hook.
if (import.meta.env.PROD) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
