/**
 * App shell — fixed sidebar + topbar + routed content + global banners +
 * toasts + command palette.
 */
import { useEffect, useState, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import AdminSidebar from './components/AdminSidebar';
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { ToastHost, toast, toastKind } from './components/ui';
import { PinChallengeHost } from './components/PinChallenge';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { matchRoute, useHashRoute } from './router';
import { store } from './store/store';
import { useStoreVersion } from './components/ui';
import { storeSync } from './services/storeSync';
import { socketManager } from './services/socket';
import { api } from './services/api';
import { authService } from './services/auth';
import { useMaintenanceStatus } from './services/maintenanceApi';
import './styles/auth.css';
import './styles/wallet-data.css';
import './styles/explorer.css';

export default function App() {
  const { path, navigate } = useHashRoute();
  useStoreVersion();
  const st = store.state;
  const [authInitialized, setAuthInitialized] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [expandedBanner, setExpandedBanner] = useState<'maintenance' | 'frozen' | null>(null);
  const maintenance = useMaintenanceStatus();

  useEffect(() => {
    // Initialize auth state first, before any routing decisions
    const initializeAuth = async () => {
      try {
        // Google OAuth (backend/src/controllers/authController.js's
        // googleCallback) redirects back here as `${frontend}/?authed=1` —
        // just a hint that a fresh session cookie was set server-side during
        // the redirect (the JWT itself is httpOnly and never appears in this
        // URL). Strip it, and force the /me check below even though the
        // local session marker hasn't been set yet for this brand-new session.
        const cameFromOAuthRedirect = new URLSearchParams(window.location.search).get('authed') === '1';
        if (cameFromOAuthRedirect) {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        }

        // Cross-tab store synchronization (session marker + whole app state)
        storeSync.initialize();

        // The JWT lives in an httpOnly cookie this code can't read, so the
        // local `authedUntil` marker (authService.isAuthenticated()) is only
        // ever a same-origin hint — GET /api/auth/me against the real cookie
        // is the actual source of truth. Still gated (not called
        // unconditionally) so a first-time, never-authenticated visitor
        // doesn't trigger a spurious 401 → "session expired" toast.
        if (authService.isAuthenticated() || cameFromOAuthRedirect) {
          const res = await api.get<{ user?: { id: string; banned: boolean; banReason?: string | null; kycLevel: number; role: 'user' | 'admin' | 'superadmin'; name?: string | null; username?: string | null; email?: string; hasBadge?: boolean }; expiresAt?: number }>('/api/auth/me');
          if (res.ok && res.data?.user) {
            const u = res.data.user;
            if (res.data.expiresAt) authService.setSession(res.data.expiresAt);
            store.state.user.authed = true;
            store.state.user.id = u.id;
            store.state.user.frozen = !!u.banned;
            store.state.user.frozenReason = u.banned ? (u.banReason || null) : null;
            store.state.user.kycLevel = u.kycLevel ?? 1;
            store.state.user.role = u.role || 'user';
            store.state.user.hasBadge = Boolean(u.hasBadge);
            // Prefer a real name (set from KYC once submitted) over a manually
            // chosen username, over an email-derived fallback — never show a
            // fictitious placeholder identity.
            const realName = u.name || u.username || u.email?.split('@')[0];
            if (realName) {
              store.state.user.name = realName;
              store.state.user.avatarInitial = realName[0]?.toUpperCase() || store.state.user.avatarInitial;
            }
            store.commit();
            // subscribeUser() records the intent even if the socket hasn't
            // finished connecting yet, and the 'connect' handler applies it
            // once it has (see socket.ts's pendingUserId) — the websocket
            // handshake and this fetch genuinely race on every real page
            // load, so a call gated on isConnected() here previously meant
            // real-time notification push silently never activated for a
            // normal session (confirmed live: "Connected" but
            // "Subscriptions: 0" on every fresh dashboard load).
            socketManager.subscribeUser(u.id);
          } else {
            // No cookie, or the backend rejected/couldn't confirm it — don't
            // leave a stale "authed" flag with no real session behind it
            // (that's exactly what renders as a ghost "Guest" session).
            authService.clearSession();
            store.state.user.authed = false;
            store.commit();
          }
        } else if (store.state.user.authed) {
          // No local session marker, yet the persisted store still says
          // authed — can happen if the marker was cleared (e.g. on a 401)
          // but the full store reset that normally follows didn't complete
          // before this tab reloaded. Don't trust a stale flag.
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

    // Apply saved language to the document's lang attribute (screen readers
    // and browser translation tools use it, not just the in-app t() calls).
    if (st.prefs.lang) document.documentElement.lang = st.prefs.lang.toLowerCase();

    // Task 5.12: Initialize Socket.IO connection for real-time updates
    socketManager.connect();

    // Cleanup on unmount
    return () => {
      storeSync.cleanup();
      socketManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the account's server-side wallet link in sync whenever both an
  // authed session and a wallet address are present — covers every path
  // that sets st.wallet.address (signup's embedded wallet step, standalone
  // create/import/switch in WalletFlow.tsx) from one place, rather than
  // needing a call at each of those sites. Backend treats re-linking the
  // same address as a no-op, so this is safe to fire on every change.
  useEffect(() => {
    if (st.user.authed && st.wallet.address) {
      authService.linkWallet(st.wallet.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.user.authed, st.wallet.address]);

  // One-time migration nudge: an account created before PIN-gating existed
  // has its recovery phrase sitting in st.wallet.mnemonic in plaintext (see
  // services/mnemonicAccess.ts) with no pinHash/pinEncryptedMnemonic set.
  // Route them to Security Settings — its "Change PIN" flow already
  // recognizes this exact case (hasPinSet === false + legacy mnemonic
  // present) and re-encrypts it, then wipes the plaintext field.
  useEffect(() => {
    const needsMigration = !!st.wallet.mnemonic && !st.wallet.pinHash;
    if (needsMigration && path !== '/security') {
      toastKind('Secure your wallet — set a PIN to continue', 'warning');
      navigate('/security');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, st.wallet.mnemonic, st.wallet.pinHash]);

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

  // index.html's single static <title> never changed on navigation before
  // this — every route (and every browser tab/history entry) read
  // "Mallchain Mission Control" regardless of what was actually open.
  useEffect(() => {
    document.title = `${route.title} · Mallchain`;
  }, [route.title]);

  // The mobile drawer (Sidebar/AdminSidebar) should close itself once a
  // destination is actually reached — otherwise it stays open over the new
  // page until the user manually taps the backdrop.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [path]);

  return (
    <div className={'app-shell' + (isAdminRoute ? ' app-shell--admin' : '')}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {!hiddenNav && (isAdminRoute
        ? <AdminSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        : <Sidebar path={path} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />)}
      {!hiddenNav && mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}
      <main className="main" id="main-content" style={hiddenNav ? { marginLeft: 0 } : undefined}>
        {!hiddenNav && (
          <TopBar
            navigate={navigate}
            isAdminRoute={isAdminRoute}
            onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
          />
        )}

        {/* global banners (admin-driven) */}
        {!hiddenNav && (maintenance.global || Object.values(maintenance.scopes).some(Boolean)) && (
          <div className="global-banner warn" role="status">
            <div>
              🛠 {maintenance.global
                ? 'Maintenance mode is ON — new transactions are blocked.'
                : `Some features are temporarily paused (${Object.keys(maintenance.scopes).filter((k) => maintenance.scopes[k]).join(', ')}).`}
              {' '}Existing data is safe.
              <button
                type="button"
                className="banner-learn-more"
                aria-expanded={expandedBanner === 'maintenance'}
                onClick={() => setExpandedBanner((b) => (b === 'maintenance' ? null : 'maintenance'))}
              >
                {expandedBanner === 'maintenance' ? 'Show less' : 'Learn more'}
              </button>
            </div>
            {expandedBanner === 'maintenance' && (
              <div className="banner-detail">
                {maintenance.reason ? <p>{maintenance.reason}</p> : <p>No further detail has been provided by the operations team.</p>}
                <p>
                  Your balances, orders, and account data are unaffected — this only pauses new activity while the
                  affected systems are worked on. Try again shortly, or{' '}
                  <a href="#/help">visit the Help Center</a> if this persists.
                </p>
              </div>
            )}
          </div>
        )}
        {!hiddenNav && st.admin.announcements.length > 0 && (
          <div className="global-banner" role="status">
            📢 {st.admin.announcements[0].text}
            <button
              type="button"
              className="close"
              aria-label="Dismiss announcement"
              onClick={() => { st.admin.announcements.shift(); store.commit(); }}
            >✕</button>
          </div>
        )}
        {!hiddenNav && st.user.frozen && (
          <div className="global-banner warn" role="status">
            <div>
              ❄ Your account has been frozen by an administrator. Some actions are blocked.
              <button
                type="button"
                className="banner-learn-more"
                aria-expanded={expandedBanner === 'frozen'}
                onClick={() => setExpandedBanner((b) => (b === 'frozen' ? null : 'frozen'))}
              >
                {expandedBanner === 'frozen' ? 'Show less' : 'Learn more'}
              </button>
            </div>
            {expandedBanner === 'frozen' && (
              <div className="banner-detail">
                <p>
                  <b>Reason given: </b>
                  {st.user.frozenReason || 'No reason was recorded by the administrator.'}
                </p>
                <p>
                  While frozen, you can't send, withdraw, or trade — your funds and account data remain intact.
                  If you believe this was a mistake, <a href="#/help">contact support</a> for a review.
                </p>
              </div>
            )}
          </div>
        )}

        <ErrorBoundary resetKey={path}>
          <Suspense fallback={<div className="tiny" role="status" style={{ padding: 20 }}>Loading…</div>}>
            {route.render(navigate)}
          </Suspense>
        </ErrorBoundary>
      </main>
      <CommandPalette navigate={navigate} isAdminRoute={isAdminRoute} />
      <ToastHost />
      <PinChallengeHost />
      <CookieConsentBanner />
    </div>
  );
}