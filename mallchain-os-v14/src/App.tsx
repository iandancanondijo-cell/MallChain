/**
 * App shell — fixed sidebar + topbar + routed content + global banners +
 * toasts + command palette.
 */
import { useEffect, useState, useRef, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import AnimatedBackground from './components/AnimatedBackground';
const Admin = lazy(() => import('./features/admin/Admin'));
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { ToastHost, toastKind } from './components/ui';
import { CipherChallengeHost } from './components/CipherChallenge';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { matchRoute, useHashRoute, isPublicRoute } from './router';
import { store } from './store/store';
import { useStoreVersion } from './components/ui';
import { storeSync } from './services/storeSync';
import { socketManager } from './services/socket';
import { applyAccent } from './services/theme';
import { api } from './services/api';
import { authService } from './services/auth';
import { chain } from './services/config';
import { useMaintenanceStatus } from './services/maintenanceApi';
import { 
  AgeVerificationModal, 
  TOSAcceptanceModal, 
  PrivacyPolicyModal,
  useComplianceStatus,
  GeographicRestrictionAlert,
  KYCStatusAlert
} from './components/ComplianceGates';
import { KYCGate } from './components/KYCGate';
import { useWalletGate, invalidateWalletGate, canAttachAddress } from './features/wallet/walletGate';
import { LoadingState } from './components/LoadingState';
import { updateSEO, getSEOForRoute, generateCanonicalUrl } from './utils/seo';
import './styles/auth.css';
import './styles/wallet-data.css';
import './styles/wallet-ops.css';
import './styles/explorer.css';
import './styles/animated-background.css';
import './styles/landing-aesthetic.css';

/** Maps a route path to a section ID for per-section ambient theming via [data-section] in global.css. */
function getSectionId(path: string): string {
  const p = path.split('?')[0];
  if (p === '/') return 'dashboard';
  if (p.startsWith('/wallet') || p === '/transactions' || p === '/security') return 'wallet';
  if (p.startsWith('/marketplace')) return 'marketplace';
  if (p.startsWith('/staking')) return 'staking';
  if (p.startsWith('/governance')) return 'governance';
  if (p.startsWith('/mines')) return 'mines';
  if (p === '/mallpoints-purchase') return 'creator-space';
  if (p.startsWith('/validators')) return 'validators';
  if (p.startsWith('/explorer')) return 'explorer';
  if (p.startsWith('/economy')) return 'economy';
  if (p.startsWith('/messaging')) return 'messaging';
  if (p.startsWith('/settings')) return 'settings';
  if (p === '/kyc') return 'settings';
  if (p.startsWith('/referrals')) return 'referrals';
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/help') || p.startsWith('/edu')) return 'help';
  if (p.startsWith('/notifications')) return 'messaging';
  return 'dashboard';
}

export default function App() {
  const { path, navigate } = useHashRoute();
  useStoreVersion();
  const st = store.state;
  const [authInitialized, setAuthInitialized] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [expandedBanner, setExpandedBanner] = useState<'maintenance' | 'frozen' | null>(null);
  const maintenance = useMaintenanceStatus();
  // Address whose PIN-verified server link was already completed or attempted
  // during this page load. The /me boot check seeds it from the server's
  // stored link, so the background linkWallet effect below never re-prompts
  // the PIN on plain reloads — it only asks once, when the device holds a
  // wallet the server hasn't been told about yet.
  const linkedAddressRef = useRef<string | null>(null);
  const migrationNudgeShownRef = useRef(false);
  // Once-latch for the "your session ended after its 30 minutes" explanation
  // (see the effect below). Re-armed whenever a session comes back, so a second
  // lapse in the same page load can explain itself too.
  const sessionEndNoticeShown = useRef(false);
  
  // Compliance state
  const complianceStatus = useComplianceStatus();
  // Whether this account is allowed to attach a wallet at all. The background
  // auto-link below is the one place a link happens with nobody pressing a
  // button, so it is the place that must not spend the user's cipher prompt on
  // a signature the server is going to refuse.
  const { gate } = useWalletGate();
  const [showAgeVerification, setShowAgeVerification] = useState(false);
  const [showTOSAcceptance, setShowTOSAcceptance] = useState(false);
  const [showPrivacyAcceptance, setShowPrivacyAcceptance] = useState(false);
  const [complianceSequence, setComplianceSequence] = useState<'age' | 'tos' | 'privacy' | 'complete'>('age');

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

        // A session marker whose authedUntil has passed is a different fact
        // from "this browser never signed in": the session ended on the
        // 30-minute policy. Nothing here inspects the marker for it — the
        // first isAuthenticated() call (from any component's render, or from
        // storeSync.initialize() below) records it on authService.sessionWasLapsed()
        // as it wipes the marker, and the notice/routing effects below read
        // that. Probing the marker here instead was tried and lost the race:
        // a child's render runs before this effect, so by the time boot got a
        // look the marker was already gone and the explanation never showed.
        //
        // Deliberately NOT arming the client-side cooldown here: the backend
        // only arms the 15-minute lockout when a request actually arrives on
        // an expired token (backend/src/middleware/sessionCooldown.js), so a
        // tab that simply sat closed never caused one. Mirroring a cooldown the
        // server never issued would replace the login form with a countdown for
        // a lockout that does not exist — the real 401 `session_expired` and the
        // 423 on an early sign-in are what arm it, authoritatively.

        // Cross-tab store synchronization (session marker + whole app state)
        storeSync.initialize();

        // The JWT lives in an httpOnly cookie this code can't read, so the
        // local `authedUntil` marker (authService.isAuthenticated()) is only
        // ever a same-origin hint — GET /api/auth/me against the real cookie
        // is the actual source of truth. Still gated (not called
        // unconditionally) so a first-time, never-authenticated visitor
        // doesn't trigger a spurious 401 → "session expired" toast.
        if (authService.isAuthenticated() || cameFromOAuthRedirect) {
          const res = await api.get<{ user?: { id: string; banned: boolean; banReason?: string | null; kycLevel: number; role: 'user' | 'admin' | 'superadmin'; name?: string | null; username?: string | null; email?: string; walletAddress?: string | null; avatarUrl?: string | null; hasBadge?: boolean; adminCategory?: 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports' | null }; expiresAt?: number }>('/api/auth/me');
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
            // adminCategory is the routing key for AdminApp: category admins
            // land directly in their window, superadmin gets the chooser.
            // /me returns it as null for superadmins/users — pass through.
            store.state.user.adminCategory = u.adminCategory ?? null;
            // Prefer a real name (set from KYC once submitted) over a manually
            // chosen username, over an email-derived fallback — never show a
            // fictitious placeholder identity.
            const realName = u.name || u.username || u.email?.split('@')[0];
            if (realName) {
              store.state.user.name = realName;
              store.state.user.avatarInitial = realName[0]?.toUpperCase() || store.state.user.avatarInitial;
            }
            // The picture belongs to the account, not to this browser: mirror
            // whatever the record holds, including the absence of one, so a
            // path left in local storage cannot outlive the file it names.
            if (typeof u.avatarUrl === 'string' || u.avatarUrl === null) {
              store.state.user.avatarUrl = u.avatarUrl || null;
            }
            // Seed the wallet address from the account's server-side link so
            // a connected wallet survives reloads and carries to other
            // devices. Pages like Purchase Mallpoints gate on the linked
            // address; without this, a fresh session on a device that never
            // ran the connect flow looked "wallet not connected".
            if (!store.state.wallet.address && u.walletAddress) {
              store.state.wallet.address = u.walletAddress;
              store.state.wallet.accountId = u.walletAddress;
              store.state.wallet.chainId = store.state.wallet.chainId || chain.chainId;
            }
            if (u.walletAddress) linkedAddressRef.current = u.walletAddress;
            // Server-confirmed linkage for the "Connected" badges and the
            // pre-send link check: true only when the account's linked
            // address equals the wallet this device holds (the seeding just
            // above guarantees equality in the freshly-seeded case).
            store.state.wallet.linkedOnServer =
              !!u.walletAddress && u.walletAddress === store.state.wallet.address;
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
    applyAccent(st.prefs.accent);

    // Apply saved language to the document's lang attribute (screen readers
    // and browser translation tools use it, not just the in-app t() calls).
    if (st.prefs.lang) document.documentElement.lang = st.prefs.lang.toLowerCase();

    // Task 5.12: Initialize Socket.IO connection for real-time updates
    //
    // In a dev build React StrictMode runs this effect mount → cleanup → mount,
    // so the very first handshake is torn down mid-flight and the browser logs
    // one "WebSocket is closed before the connection is established" warning
    // before the second connect() succeeds. It is a dev-only artifact of the
    // double-invoke (verified: block/price/notification events stream normally
    // afterwards, and a production build logs nothing), not a failed
    // connection — don't chase it by weakening disconnect() on unmount.
    socketManager.connect();

    // Cleanup on unmount
    return () => {
      storeSync.cleanup();
      socketManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explain a session that ended on the 30-minute policy. Covers both the cold
  // boot (the marker was already past its expiry when the page loaded) and the
  // live lapse (storeSync's 3-second tick flips `authed` off when the marker
  // passes while the tab is open) — hence authed, not just authInitialized, in
  // the deps. One toast per lapse: sessionEndNoticeShown latches until a
  // session comes back. handle401Error toasts for the case where a request
  // discovered the expiry first, and that path also mirrors the server's real
  // cooldown, so the countdown card and this message never describe the same
  // event twice on top of each other.
  useEffect(() => {
    if (!authInitialized) return;
    if (st.user.authed) {
      sessionEndNoticeShown.current = false;
      return;
    }
    if (sessionEndNoticeShown.current || !authService.sessionWasLapsed()) return;
    sessionEndNoticeShown.current = true;
    // 10s rather than the 4.2s default: this one arrives in the same instant
    // the screen changes out from under the user, and it is the only thing that
    // says why their dashboard turned into a sign-in form. Verified live on both
    // triggers — cold boot (emitted ~650ms in, visible until the 10s dismiss)
    // and a lapse while the tab is open (visible within 2s of the marker passing).
    toastKind('Your session ended after its 30 minutes. Sign in again to continue.', 'warning', 10_000);
  }, [authInitialized, st.user.authed]);

  // A client-side login (Auth page) flips st.user.authed without a page
  // reload, so the boot-time /me seeding above never runs for that session —
  // on a device that never ran the connect flow the app then kept showing
  // "Wallet not connected" until an explicit refresh. Fetch /me once when
  // auth turns on with no local wallet and seed the server-side link the
  // same way boot does.
  useEffect(() => {
    if (!authInitialized || !st.user.authed || st.wallet.address) return;
    let cancelled = false;
    (async () => {
      const res = await api.get<{ user?: { walletAddress?: string | null } }>('/api/auth/me');
      if (cancelled || !res.ok || !res.data?.user?.walletAddress) return;
      const addr = res.data.user.walletAddress;
      if (!store.state.wallet.address) {
        store.state.wallet.address = addr;
        store.state.wallet.accountId = addr;
        store.state.wallet.chainId = store.state.wallet.chainId || chain.chainId;
        // Seeded straight from the server's own link — it exists by definition.
        store.state.wallet.linkedOnServer = true;
        store.commit();
      }
      linkedAddressRef.current = addr;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authInitialized, st.user.authed]);

  // Realtime identity follows the session.
  //
  // The backend decides which account a socket belongs to during the
  // handshake, from the httpOnly auth cookie (backend/src/index.js io.use),
  // because JS can no longer read that token to hand it over. So a connection
  // opened before a login stays anonymous for its whole life, and one opened
  // for the previous account keeps that account's rooms — the live balance
  // never arrives for the first, and the bell keeps ringing for the second on
  // a shared device.
  //
  // This used to be the sign-in screens' job (four separate
  // `socketManager.reauth()` calls), which left the OAuth callback, the 401
  // session-expiry bounce and any future login path free to forget it. Keyed
  // on the id as well as the flag, so switching accounts in one commit — the
  // store resets and re-authenticates together — counts as a transition.
  const socketIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authInitialized) return;
    const identity = st.user.authed ? st.user.id : '';
    if (socketIdentityRef.current === identity) return;
    // The boot connect() already handshook under whatever cookie the browser
    // held, so the first read of the session needs no new one.
    const bootObservation = socketIdentityRef.current === null;
    socketIdentityRef.current = identity;
    if (!bootObservation) socketManager.reauth();
  }, [authInitialized, st.user.authed, st.user.id]);

  // Session policy (2026-11): warn once, 60 seconds before the 30-minute
  // session ends. Polls the local session marker every 10s and fires exactly
  // one toast per session end value (authedUntil) — a manual refresh issues
  // a new authedUntil, which re-arms the warning for the new expiry instead
  // of spamming the same one.
  useEffect(() => {
    if (!authInitialized || !st.user.authed) return;
    let warnedFor: number | null = null;
    const id = window.setInterval(() => {
      const endsAt = authService.getAuthedUntil();
      if (endsAt === null) return;
      const remainingMs = endsAt * 1000 - Date.now();
      if (remainingMs > 0 && remainingMs <= 60_000 && warnedFor !== endsAt) {
        warnedFor = endsAt;
        toastKind('Your session ends in 1 minute — save your work; sign-in reopens after a 15-minute security cooldown.', 'warning');
      }
    }, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authInitialized, st.user.authed]);

  // Keep the account's server-side wallet link in sync whenever both an
  // authed session and a wallet address are present — covers every path
  // that sets st.wallet.address (signup's embedded wallet step, standalone
  // create/import/switch in WalletFlow.tsx) from one place, rather than
  // needing a call at each of those sites. Backend treats re-linking the
  // same address as a no-op. Guarded per page load: /me already reporting
  // this exact address means the link exists, so the PIN prompt is raised
  // only for a genuinely unlinked local wallet — once per reload, never on
  // every store change (the old unconditional call re-prompted the PIN on
  // every reload and even on sessions merely seeded from the server).
  useEffect(() => {
    // Wait for the boot /me check to complete first: the persisted store can
    // rehydrate with authed+address before /me resolves, and firing the link
    // during that window prompts the PIN on every plain reload (the server
    // link already exists — linkedAddressRef only learns that from /me).
    if (!authInitialized) return;
    // Verified identity comes before a wallet, on the server and therefore
    // here too. While the gate refuses — or is still being read — this effect
    // does nothing at all: linkWallet would open the cipher, ask for a
    // signature, and get 403'd, which is a prompt the user can never get back.
    // The address deliberately stays out of linkedAddressRef so the link fires
    // by itself the moment the verification lands, with no reload.
    if (!gate.allowed) return;
    // Restore mode is `allowed` for exactly one address — the one the account
    // already holds. A leftover wallet from another account would be refused
    // 403 here, so it is not attempted; the person sees nothing, because they
    // asked for nothing.
    if (!canAttachAddress(gate, st.wallet.address)) return;
    if (st.user.authed && st.wallet.address && st.wallet.address !== linkedAddressRef.current) {
      linkedAddressRef.current = st.wallet.address;
      // Still best-effort (never blocks the UI), but linkWallet now reports
      // the outcome: on success it sets wallet.linkedOnServer itself; on
      // failure we record it so downstream checks (WalletSend) re-verify
      // instead of trusting a stale "Connected".
      authService.linkWallet(st.wallet.address).then((res) => {
        if (res.ok) return;
        if (store.state.wallet.linkedOnServer) {
          store.state.wallet.linkedOnServer = false;
          store.commit();
        }
        // The gate said allowed and the server said no — the cached verdict is
        // wrong (an admin just revoked or downgraded this account, or the KYC
        // record changed inside the 30s TTL). Drop it so every door in the app
        // re-reads and shows the verification notice instead of a wallet button
        // that cannot work; and retry once immediately so the refetched address
        // isn't left unlinked for the rest of the session.
        if (res.reason === 'kyc_verification_required' || res.reason === 'kyc_check_unavailable') {
          console.warn('[App] Server refused the wallet link on verification (', res.reason, ') while the client gate allowed it — re-reading the verdict');
          invalidateWalletGate();
          linkedAddressRef.current = null;
          return;
        }
        if (res.reason !== 'pin_cancelled') {
          console.warn('[App] Background wallet link failed:', res.reason);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authInitialized, st.user.authed, st.wallet.address, gate.allowed, gate.state, gate.restoreAddress]);

  // One-time migration nudge: an account created before secret-gating existed
  // has its recovery phrase sitting in st.wallet.mnemonic in plaintext (see
  // services/mnemonicAccess.ts) with no pinHash/pinEncryptedMnemonic set.
  //
  // This is a warning only — it deliberately does not navigate. The cipher
  // walls the *wallet*, not the interface: an unencrypted key on disk is a
  // reason to secure that key at the next signing prompt, not a reason to
  // yank the user out of whatever page they opened. The migration itself now
  // happens where it belongs — CipherChallenge.tsx sees the plaintext phrase
  // with no ciphertext and goes straight to "Choose your cipher" the first
  // time the wallet key is actually needed (Send, stake, vote, reveal), and
  // Security Settings offers the same flow on demand.
  useEffect(() => {
    const needsMigration = !!st.wallet.mnemonic && !st.wallet.pinHash;
    if (needsMigration && !migrationNudgeShownRef.current) {
      migrationNudgeShownRef.current = true;
      toastKind("This wallet's recovery phrase is still unsecured on this device — choose a cipher at your next wallet action", 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.wallet.mnemonic, st.wallet.pinHash]);

  // Auth guard: redirect unauthenticated users to landing page first, then
  // they can navigate to auth from there. Authenticated users on landing
  // go directly to dashboard. This is a cosmetic hash-correctness effect only —
  // matchRoute() (router.tsx) independently recomputes auth and substitutes
  // AuthFlow for protected content regardless of what the hash says, so it
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

    // Routes that don't require authentication — the same list matchRoute()
    // uses, imported rather than repeated. This effect rewrites the hash before
    // the router renders anything, so a route added to one list and not the
    // other was silently unreachable: /explorer, /dmca and /run-node were all
    // "public" in router.tsx and bounced to /landing from here.
    const isPublic = isPublicRoute(path);

    if (!isAuthenticated && !isPublic) {
      // A lapsed session goes to the sign-in screen, which explains the
      // timeout and shows a countdown only when the server actually issued one;
      // someone who never signed in stays on the landing page they came for.
      // Read live rather than from boot-time state: storeSync's 3-second tick
      // flips `authed` to false when a session lapses with the tab open, and
      // this effect re-runs on that change.
      navigate(authService.sessionWasLapsed() ? '/auth?mode=login' : '/landing');
    } else if (isAuthenticated && cleanPath === '/landing') {
      // Authenticated user on landing → redirect to dashboard
      navigate('/');
    }
  }, [authInitialized, st.user.authed, path, navigate]);

  // SEO: Update meta tags and structured data on route change
  useEffect(() => {
    const seoConfig = getSEOForRoute(path);
    const canonicalUrl = generateCanonicalUrl(path);
    
    updateSEO({
      ...seoConfig,
      canonicalUrl,
      ogUrl: canonicalUrl,
    });
  }, [path]);

  // Compliance: Check age verification, TOS/privacy acceptance, geographic restrictions
  useEffect(() => {
    if (!authInitialized || !st.user.authed) return;

    // Skip compliance gates on the auth route — the KYC wizard (step 1)
    // already handles terms acceptance inline, and the age/TOS/privacy
    // modals would overlay the wizard mid-flow right after registration
    // sets user.authed = true at step 1.
    // Also skip on admin routes — admins/superadmins bypass KYC and compliance
    // gates since they need immediate access to admin functions.
    if (path.startsWith('/auth') || path.startsWith('/landing') || path.startsWith('/admin')) {
      setShowAgeVerification(false);
      setShowTOSAcceptance(false);
      setShowPrivacyAcceptance(false);
      return;
    }

    // Check if user is from restricted country
    if (complianceStatus.geographicRestriction) {
      toastKind(`Service unavailable in your region: ${complianceStatus.restrictedReason || 'Geographic restriction'}`, 'warning');
      return;
    }

    // Read localStorage directly — the hook caches values at mount time
    // and never re-reads, so modals that write to localStorage would not
    // be observed otherwise.
    const ageVerified = !!localStorage.getItem('mallchain_age_verified');
    const tosAccepted = !!localStorage.getItem('mallchain_tos_accepted');
    const privacyAccepted = !!localStorage.getItem('mallchain_privacy_accepted');

    // Compliance sequence: age → TOS → privacy
    // Only show ONE modal at a time, closing previous ones as we progress
    if (!ageVerified) {
      setComplianceSequence('age');
      setShowAgeVerification(true);
      setShowTOSAcceptance(false);
      setShowPrivacyAcceptance(false);
    } else if (!tosAccepted) {
      setComplianceSequence('tos');
      setShowAgeVerification(false);
      setShowTOSAcceptance(true);
      setShowPrivacyAcceptance(false);
    } else if (!privacyAccepted) {
      setComplianceSequence('privacy');
      setShowAgeVerification(false);
      setShowTOSAcceptance(false);
      setShowPrivacyAcceptance(true);
    } else {
      // All compliance requirements met
      setComplianceSequence('complete');
      setShowAgeVerification(false);
      setShowTOSAcceptance(false);
      setShowPrivacyAcceptance(false);
    }
  }, [authInitialized, st.user.authed, complianceStatus, path, complianceSequence]);

  const isAuthenticated = st.user.authed;
  const route = matchRoute(path, isAuthenticated, st.user.role);
  const hiddenNav = path.startsWith('/auth') || path.startsWith('/landing');
  // Based on the RESOLVED route, not the raw hash — a non-admin's hash can
  // still literally read "#/admin" after being redirected (matchRoute swaps
  // what renders, not the URL), and the badge/accent must not lie about that.
  const isAdminRoute = route.path.startsWith('/admin');
  const hideTopBar = path.startsWith('/admin') || path.startsWith('/landing') || path.startsWith('/auth');

  // index.html's single static <title> never changed on navigation before
  // this — every route (and every browser tab/history entry) read
  // "Mallchain Network" regardless of what was actually open.
  // Runs AFTER the seo.ts updateSEO() effect above, so `${route.title} · Mallchain`
  // wins over the preset title while the preset's description, canonical,
  // structured data and robots tags stay in place.
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
    <>
      <AnimatedBackground />
      <div className={'app-shell' + (isAdminRoute ? ' app-shell--admin' : '')}>
        <a href="#main-content" className="skip-link">Skip to main content</a>
      {!hiddenNav && !isAdminRoute && (
        <ErrorBoundary resetKey={path}>
          <Sidebar path={path} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        </ErrorBoundary>
      )}
      {!hiddenNav && mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}
      <main className="main" id="main-content" data-section={getSectionId(path)} style={hideTopBar ? { marginLeft: 0 } : undefined}>
        {!hideTopBar && (
          <ErrorBoundary resetKey={path}>
            <TopBar
              navigate={navigate}
              isAdminRoute={isAdminRoute}
              onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
          />
          </ErrorBoundary>
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

        {/* KYC Status Alert — must stay INSIDE .main: as a direct flex child of
            .app-shell it becomes an in-flow flex item beside .main and squeezes
            the whole page content into a narrow column. */}
        {authInitialized && st.user.authed && st.user.role !== 'admin' && st.user.role !== 'superadmin' && complianceSequence === 'complete' && !hiddenNav && (
          <KYCStatusAlert />
        )}

        <ErrorBoundary resetKey={path}>
          <Suspense fallback={<LoadingState page />}>
            <div key={path} className="page-enter">{route.render(navigate)}</div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <CommandPalette navigate={navigate} isAdminRoute={isAdminRoute} />
      <ToastHost />
      <CipherChallengeHost />
      <CookieConsentBanner />
      
      {/* KYC Gate - Blocks all features if KYC not completed (never over the /kyc wizard itself).
          Admins and superadmins are exempt: they manage KYC, they don't get gated by it. */}
      {authInitialized && st.user.authed && !hiddenNav && st.user.kycLevel === 1 && st.user.role !== 'admin' && st.user.role !== 'superadmin' && path.split('?')[0] !== '/kyc' && (
        <KYCGate 
          kycLevel={st.user.kycLevel} 
          userId={st.user.id} 
          onStartKYC={() => navigate('/kyc')}
        />
      )}
      
      {/* Compliance Gates */}
      {authInitialized && st.user.authed && complianceSequence !== 'complete' && (
        <>
          {showAgeVerification && complianceSequence === 'age' && (
            <AgeVerificationModal
              onVerify={() => {
                setShowAgeVerification(false);
                // Move to next step
                setTimeout(() => {
                  setComplianceSequence('tos');
                }, 300);
              }}
            />
          )}
          
          {showTOSAcceptance && complianceSequence === 'tos' && (
            <TOSAcceptanceModal
              onAccept={() => {
                setShowTOSAcceptance(false);
                // Move to next step
                setTimeout(() => {
                  setComplianceSequence('privacy');
                }, 300);
              }}
            />
          )}
          
          {showPrivacyAcceptance && complianceSequence === 'privacy' && (
            <PrivacyPolicyModal
              onAccept={() => {
                setShowPrivacyAcceptance(false);
                setComplianceSequence('complete');
              }}
            />
          )}
        </>
      )}
      
      {/* Geographic Restriction */}
      {authInitialized && st.user.authed && complianceStatus.geographicRestriction && (
        <GeographicRestrictionAlert reason={complianceStatus.restrictedReason} />
      )}
      </div>
    </>
  );
}