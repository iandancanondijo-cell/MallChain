/**
 * App shell — fixed sidebar + topbar + routed content + global banners +
 * toasts + command palette. Demo-mode gate seeds once at boot.
 */
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { ToastHost } from './components/ui';
import { matchRoute, useHashRoute } from './router';
import { store } from './store/store';
import { seedIfDemo } from './demo/seeds';
import { config, sim } from './services/config';
import { useStoreVersion } from './components/ui';
import { authStateSync } from './services/authStateSync';
import { socketManager } from './services/socket';
import './styles/auth.css';
import './styles/wallet-data.css';
import './styles/explorer.css';

export default function App() {
  const { path, navigate } = useHashRoute();
  useStoreVersion();
  const st = store.state;
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    // Initialize auth state first, before any routing decisions
    const initializeAuth = async () => {
      try {
        // Task 4.8: Initialize auth state synchronization with localStorage
        authStateSync.initialize();
        // Give authStateSync a moment to restore token from localStorage
        await new Promise(resolve => setTimeout(resolve, 100));
        setAuthInitialized(true);
      } catch (error) {
        console.error('Auth initialization error:', error);
        setAuthInitialized(true); // Continue even if auth init fails
      }
    };

    initializeAuth();

    // Apply saved accent
    const map: Record<string, string> = { gold: '#f3ba2f', cyan: '#22d3ee', purple: '#a78bfa', emerald: '#34d399' };
    const a = map[st.prefs.accent] || '#f3ba2f';
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-2', a === '#22d3ee' ? '#0ea5e9' : a === '#a78bfa' ? '#8b5cf6' : a === '#34d399' ? '#10b981' : '#f59e0b');
    
    // Pause simulations when a real API is configured
    if (config.apiBaseUrl) sim.pause();
    
    // Seed demo data once on boot
    seedIfDemo(st);
    
    // Task 5.12: Initialize Socket.IO connection for real-time updates
    socketManager.connect();
    
    // Cleanup on unmount
    return () => {
      authStateSync.cleanup();
      socketManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PHASE 0 FIX: Check auth state and redirect unauthenticated users to landing page
  useEffect(() => {
    if (!authInitialized) return;

    const isAuthenticated = st.user.authed;
    const isOnAuthRoute = path === '/auth' || path === '/landing';
    const isOnLoginFlow = path.startsWith('/auth');

    // If not authenticated and not on auth/landing routes, redirect to landing
    if (!isAuthenticated && !isOnAuthRoute && !isOnLoginFlow) {
      console.log('[Auth Guard] User not authenticated, redirecting to landing page');
      navigate('/landing');
    }
  }, [authInitialized, st.user.authed, path, navigate]);

  // Auth guard: redirect unauthenticated users to landing
  useEffect(() => {
    if (!authInitialized) return;
    
    const isAuthenticated = st.user.authed;
    
    // Routes that don't require authentication
    const isPublicRoute = path === '/landing' || path === '/auth';
    
    if (!isAuthenticated && !isPublicRoute) {
      // Unauthenticated user on protected route → redirect to landing
      console.log('[App] Auth required for route:', path, '→ redirecting to landing');
      navigate('/landing');
    } else if (isAuthenticated && path === '/landing') {
      // Authenticated user on landing → redirect to dashboard
      console.log('[App] User authenticated, redirecting from landing to dashboard');
      navigate('/');
    }
  }, [authInitialized, st.user.authed, path, navigate]);

  const isAuthenticated = st.user.authed;
  const route = matchRoute(path, isAuthenticated);
  const hiddenNav = path.startsWith('/auth') || path.startsWith('/landing');

  return (
    <div className="app-shell">
      {!hiddenNav && <Sidebar path={path} navigate={navigate} />}
      <div className="main" style={hiddenNav ? { marginLeft: 0 } : undefined}>
        {!hiddenNav && <TopBar navigate={navigate} />}

        {/* global banners (admin-driven) */}
        {!hiddenNav && st.admin.flags.maintenance && (
          <div className="global-banner warn">
            🛠 Maintenance mode is ON — new transactions are blocked. Existing data is safe.
            <span className="close" onClick={() => { st.admin.flags.maintenance = false; store.commit(); }}>✕</span>
          </div>
        )}
        {!hiddenNav && st.admin.announcements.length > 0 && (
          <div className="global-banner">
            📢 {st.admin.announcements[0].text}
            <span className="close" onClick={() => { st.admin.announcements.shift(); store.commit(); }}>✕</span>
          </div>
        )}
        {!hiddenNav && st.user.frozen && (
          <div className="global-banner warn">
            ❄ Your account has been frozen by an administrator. Some actions are blocked.
          </div>
        )}

        {route.render(navigate)}
      </div>
      <CommandPalette navigate={navigate} />
      <ToastHost />
    </div>
  );
}