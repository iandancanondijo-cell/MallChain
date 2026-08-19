/**
 * App shell — fixed sidebar + topbar + routed content + global banners +
 * toasts + command palette.
 */
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import AdminSidebar from './components/AdminSidebar';
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { ToastHost } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { matchRoute, useHashRoute } from './router';
import { store } from './store/store';
import { useStoreVersion } from './components/ui';
import { storeSync } from './services/storeSync';
import { socketManager } from './services/socket';
import { api } from './services/api';
import { authService } from './services/auth';
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
        // Cross-tab store synchronization (auth token + whole app state)
        storeSync.initialize();
        // Give storeSync a moment to restore token from localStorage
        await new Promise(resolve => setTimeout(resolve, 100));

        // Refresh frozen/role/kycLevel from the real backend on every boot —
        // login/register only set these at the moment of auth, so a reload
        // (or an admin ban/KYC decision since then) would otherwise show stale data.
        if (authService.getToken()) {
          const res = await api.get<{ user?: { id: string; banned: boolean; kycLevel: number; role: 'user' | 'admin' | 'superadmin'; name?: string | null; username?: string | null; email?: string } }>('/api/auth/me');
          if (res.ok && res.data?.user) {
            const u = res.data.user;
            store.state.user.id = u.id;
            store.state.user.frozen = !!u.banned;
            store.state.user.kycLevel = u.kycLevel ?? 1;
            store.state.user.role = u.role || 'user';
            // Prefer a real name (set from KYC once submitted) over a manually
            // chosen username, over an email-derived fallback — never show a
            // fictitious placeholder identity.
            const realName = u.name || u.username || u.email?.split('@')[0];
            if (realName) {
              store.state.user.name = realName;
              store.state.user.avatarInitial = realName[0]?.toUpperCase() || store.state.user.avatarInitial;
            }
            store.commit();
            if (socketManager.isConnected()) socketManager.subscribeUser(u.id);
          } else {
            // Token exists but the backend rejected/couldn't confirm it —
            // don't leave a stale "authed" flag with no real identity behind
            // it (that's exactly what renders as a ghost "Guest" session).
            store.state.user.authed = false;
            store.commit();
          }
        } else if (store.state.user.authed) {
          // No token at all, yet the persisted store still says authed —
          // can happen if a token was cleared (e.g. on a 401) but the full
          // store reset that normally follows didn't complete before this
          // tab reloaded. Don't trust a stale flag with no token behind it.
          store.state.user.authed = false;
          store.commit();
        }

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

    // Task 5.12: Initialize Socket.IO connection for real-time updates
    socketManager.connect();

    // Cleanup on unmount
    return () => {
      storeSync.cleanup();
      socketManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth guard: redirect unauthenticated users to landing, and authenticated
  // users away from landing. This is a cosmetic hash-correctness effect only —
  // matchRoute() (router.tsx) independently recomputes auth and substitutes
  // Landing for protected content regardless of what the hash says, so it
  // remains the actual authorization boundary no matter what this effect does.
  useEffect(() => {
    if (!authInitialized) return;
    
    const isAuthenticated = st.user.authed;

    // Strip query string before comparing — matchRoute() (router.tsx) does
    // the same via clean = path.split('?')[0]. Without this, a path like
    // /auth?mode=signup fails the exact-match check below and this effect
    // force-redirects to /landing before matchRoute's render ever shows,
    // discarding the query string in the process.
    const cleanPath = path.split('?')[0];

    // Routes that don't require authentication
    const isPublicRoute = cleanPath === '/landing' || cleanPath === '/auth';

    if (!isAuthenticated && !isPublicRoute) {
      // Unauthenticated user on protected route → redirect to landing
      console.log('[App] Auth required for route:', path, '→ redirecting to landing');
      navigate('/landing');
    } else if (isAuthenticated && cleanPath === '/landing') {
      // Authenticated user on landing → redirect to dashboard
      console.log('[App] User authenticated, redirecting from landing to dashboard');
      navigate('/');
    }
  }, [authInitialized, st.user.authed, path, navigate]);

  const isAuthenticated = st.user.authed;
  const route = matchRoute(path, isAuthenticated, st.user.role);
  const hiddenNav = path.startsWith('/auth') || path.startsWith('/landing');
  // Based on the RESOLVED route, not the raw hash — a non-admin's hash can
  // still literally read "#/admin" after being redirected (matchRoute swaps
  // what renders, not the URL), and the badge/accent must not lie about that.
  const isAdminRoute = route.path.startsWith('/admin');

  return (
    <div className={'app-shell' + (isAdminRoute ? ' app-shell--admin' : '')}>
      {!hiddenNav && (isAdminRoute ? <AdminSidebar navigate={navigate} /> : <Sidebar path={path} navigate={navigate} />)}
      <div className="main" style={hiddenNav ? { marginLeft: 0 } : undefined}>
        {!hiddenNav && <TopBar navigate={navigate} isAdminRoute={isAdminRoute} />}

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

        <ErrorBoundary resetKey={path}>{route.render(navigate)}</ErrorBoundary>
      </div>
      <CommandPalette navigate={navigate} isAdminRoute={isAdminRoute} />
      <ToastHost />
    </div>
  );
}