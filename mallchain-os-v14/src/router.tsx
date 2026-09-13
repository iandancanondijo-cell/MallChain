/**
 * Mallchain Mission Control v14 — hash router (mirrors the dashboard's
 * #/ route map). Every route is deep-linkable on reload.
 *
 * Every route below Landing/Dashboard/AuthFlow is code-split via lazy() —
 * previously all ~40 feature modules were eagerly bundled into one ~2.5MB
 * chunk loaded before first paint, most of which any given session never
 * visits (nobody opens Admin, DevHub, Contracts, and every Mines/Validators
 * sub-page in the same session). App.tsx wraps route.render() in a single
 * <Suspense> boundary to show a loading state while a chunk fetches.
 */
import { useEffect, useState, lazy } from 'react';

/* pages */
import Landing from './pages/Landing';
const WalletSettings = lazy(() => import('./pages/WalletSettings'));
const AddressBook = lazy(() => import('./pages/AddressBook'));
const SecuritySettings = lazy(() => import('./pages/SecuritySettings'));
const TransactionHistory = lazy(() => import('./pages/TransactionHistory'));
const BlockchainExplorer = lazy(() => import('./pages/BlockchainExplorer'));

/* feature modules — each maps to a v14 view */
import Dashboard from './features/dashboard/Dashboard';
import AuthFlow from './features/auth/AuthFlow';
const WalletHub = lazy(() => import('./features/wallet/WalletHub'));
const WalletSend = lazy(() => import('./features/wallet/WalletSend'));
const WalletReceive = lazy(() => import('./features/wallet/WalletReceive'));
const WalletSwap = lazy(() => import('./features/wallet/WalletSwap'));
const WalletHistory = lazy(() => import('./features/wallet/WalletHistory'));
const WalletBuy = lazy(() => import('./features/wallet/WalletBuy'));
const WalletWithdraw = lazy(() => import('./features/wallet/WalletWithdraw'));
const WalletPoints = lazy(() => import('./features/wallet/WalletPoints'));
const Performance = lazy(() => import('./features/wallet/Performance'));
const Marketplace = lazy(() => import('./features/marketplace/Marketplace'));
const Staking = lazy(() => import('./features/staking/Staking'));
const Governance = lazy(() => import('./features/governance/Governance'));
const MinesHome = lazy(() => import('./features/mines/MinesHome'));
const MinesDiscover = lazy(() => import('./features/mines/MinesDiscover'));
const MinesMyCampaigns = lazy(() => import('./features/mines/MinesMyCampaigns'));
const MinesParticipation = lazy(() => import('./features/mines/MinesParticipation'));
const MinesEarnings = lazy(() => import('./features/mines/MinesEarnings'));
const MinesLeaderboard = lazy(() => import('./features/mines/MinesLeaderboard'));
const MinesAnalytics = lazy(() => import('./features/mines/MinesAnalytics'));
const MinesHistory = lazy(() => import('./features/mines/MinesHistory'));
const MinesValidatorQueue = lazy(() => import('./features/mines/MinesValidatorQueue'));
const MinesReviewerStake = lazy(() => import('./features/mines/MinesReviewerStake'));
const ValidatorsHome = lazy(() => import('./features/validators/ValidatorsHome'));
const ValidatorsApply = lazy(() => import('./features/validators/ValidatorsApply'));
const ValidatorsLeaderboard = lazy(() => import('./features/validators/ValidatorsLeaderboard'));
const ValidatorsProfile = lazy(() => import('./features/validators/ValidatorsProfile'));
const Messaging = lazy(() => import('./features/messaging/Messaging'));
const Referrals = lazy(() => import('./features/referrals/Referrals'));
const Admin = lazy(() => import('./features/admin/Admin'));
const Settings = lazy(() => import('./features/settings/Settings'));
const Profile = lazy(() => import('./features/profile/Profile'));
const Contracts = lazy(() => import('./features/contracts/Contracts'));
const DevHub = lazy(() => import('./features/devhub/DevHub'));
const Economy = lazy(() => import('./features/economy/Economy'));
const Edu = lazy(() => import('./features/edu/Edu'));
const SearchResults = lazy(() => import('./features/search/SearchResults'));

/* misc views — named exports from one shared module, so each gets its own .then() to pick the right export */
const Careers = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.Careers })));
const Learning = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.Learning })));
const SocialTasks = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.SocialTasks })));
const NotificationsView = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.NotificationsView })));
const AnalyticsView = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.AnalyticsView })));
const Help = lazy(() => import('./features/misc/MiscViews').then(m => ({ default: m.Help })));

/* routes: specific-before-generic */
export interface RouteDef {
  path: string;
  /** Rendered as `${title} · Mallchain` on document.title (see App.tsx) — every route gets an accurate, announced page title instead of the one static <title> in index.html never changing. */
  title: string;
  render: (navigate: (p: string) => void) => React.ReactNode;
}

export const ROUTES: RouteDef[] = [
  { path: '/landing', title: 'Welcome', render: (n) => <Landing navigate={n} /> },
  { path: '/', title: 'Dashboard', render: (n) => <Dashboard navigate={n} /> },
  /* auth - redirect to landing if already authenticated */
  { path: '/auth', title: 'Sign in', render: (n) => <AuthFlow navigate={n} /> },
  { path: '/login', title: 'Sign in', render: (n) => <AuthFlow navigate={n} /> },
  /* wallet */
  { path: '/wallet/settings', title: 'Wallet Settings', render: () => <WalletSettings /> },
  { path: '/wallet/address-book', title: 'Address Book', render: () => <AddressBook /> },
  { path: '/security', title: 'Security Settings', render: () => <SecuritySettings /> },
  { path: '/transactions', title: 'Transaction History', render: () => <TransactionHistory /> },
  { path: '/wallet/send', title: 'Send', render: () => <WalletSend /> },
  { path: '/wallet/receive', title: 'Receive', render: () => <WalletReceive /> },
  { path: '/wallet/swap', title: 'Swap', render: () => <WalletSwap /> },
  { path: '/wallet/history', title: 'Wallet History', render: () => <WalletHistory /> },
  { path: '/wallet/buy', title: 'Buy Mallcoin', render: () => <WalletBuy /> },
  { path: '/wallet/withdraw', title: 'Withdraw', render: () => <WalletWithdraw /> },
  { path: '/wallet/points', title: 'Mallpoints', render: () => <WalletPoints /> },
  { path: '/wallet/performance', title: 'Performance', render: () => <Performance /> },
  { path: '/wallet', title: 'Wallet', render: (n) => <WalletHub navigate={n} /> },
  /* marketplace / staking / governance */
  { path: '/marketplace', title: 'Marketplace', render: (n) => <Marketplace navigate={n} /> },
  { path: '/staking', title: 'Staking', render: () => <Staking /> },
  { path: '/governance', title: 'Governance', render: () => <Governance /> },
  { path: '/governance/voting', title: 'Governance', render: () => <Governance /> },
  /* mines */
  { path: '/mines/discover', title: 'Discover Campaigns', render: (n) => <MinesDiscover navigate={n} /> },
  { path: '/mines/my-campaigns', title: 'My Campaigns', render: () => <MinesMyCampaigns /> },
  { path: '/mines/participation', title: 'Participation', render: (n) => <MinesParticipation navigate={n} /> },
  { path: '/mines/earnings', title: 'Earnings', render: () => <MinesEarnings /> },
  { path: '/mines/leaderboard', title: 'Mines Leaderboard', render: () => <MinesLeaderboard /> },
  { path: '/mines/analytics', title: 'Mines Analytics', render: () => <MinesAnalytics /> },
  { path: '/mines/history', title: 'Mines History', render: () => <MinesHistory /> },
  { path: '/mines/validator-queue', title: 'Proof Reviewer Queue', render: () => <MinesValidatorQueue /> },
  { path: '/mines/reviewer/stake', title: 'Reviewer Stake', render: () => <MinesReviewerStake /> },
  { path: '/mines', title: 'Mines', render: (n) => <MinesHome navigate={n} /> },
  /* validators — real Cosmos x/staking validators (see /mines/validator-queue for Proof Reviewers) */
  { path: '/validators/leaderboard', title: 'Validators Leaderboard', render: () => <ValidatorsLeaderboard /> },
  { path: '/validators/apply', title: 'Become a Validator', render: (n) => <ValidatorsApply navigate={n} /> },
  { path: '/validators/profile', title: 'Validator Profile', render: () => <ValidatorsProfile /> },
  { path: '/validators', title: 'Validators', render: (n) => <ValidatorsHome navigate={n} /> },
  /* explorer / messaging / referrals / admin / settings / profile / misc */
  { path: '/explorer', title: 'Blockchain Explorer', render: () => <BlockchainExplorer /> },
  { path: '/economy', title: 'Economy', render: () => <Economy /> },
  { path: '/edu', title: 'EDU', render: () => <Edu /> },
  { path: '/messaging', title: 'Messaging', render: () => <Messaging /> },
  { path: '/referrals', title: 'Referrals', render: () => <Referrals /> },
  { path: '/admin', title: 'Admin', render: () => <Admin /> },
  { path: '/settings', title: 'Settings', render: () => <Settings /> },
  { path: '/profile', title: 'Profile', render: () => <Profile /> },
  { path: '/contracts', title: 'Smart Contracts', render: () => <Contracts /> },
  { path: '/devhub', title: 'Developer Hub', render: () => <DevHub /> },
  { path: '/careers', title: 'Careers', render: () => <Careers /> },
  { path: '/learning', title: 'Learning', render: () => <Learning /> },
  { path: '/social-tasks', title: 'Social Tasks', render: () => <SocialTasks /> },
  { path: '/notifications', title: 'Notifications', render: () => <NotificationsView /> },
  { path: '/analytics', title: 'Analytics', render: () => <AnalyticsView /> },
  { path: '/help', title: 'Help Center', render: () => <Help /> },
  { path: '/search', title: 'Search', render: (n) => <SearchResults navigate={n} /> },
  { path: '/activity', title: 'Dashboard', render: (n) => <Dashboard navigate={n} /> },
];

/** Routes only 'admin'/'superadmin' may reach — checked as an exact-or-prefix match, same as the public-route check below. */
const ADMIN_ROUTES = ['/admin'];

export function matchRoute(path: string, isAuthenticated: boolean = true, role: string = 'user'): RouteDef {
  const clean = path.split('?')[0];

  // PHASE 0 FIX: Public routes that don't require authentication
  const publicRoutes = ['/landing', '/auth'];
  const isAdmin = role === 'admin' || role === 'superadmin';

  const denyIfAdminOnly = (routePath: string): RouteDef | null => {
    const isAdminRoute = ADMIN_ROUTES.some((r) => routePath === r || routePath.startsWith(r + '/'));
    // This is the real authorization boundary — a non-admin must never mount
    // Admin.tsx at all, not just see it render an "access denied" message
    // inside the normal page content (which is all the previous check did).
    if (isAdminRoute && !isAdmin) {
      return { path: '/', title: 'Dashboard', render: (n) => <Dashboard navigate={n} /> };
    }
    return null;
  };

  const exact = ROUTES.find((r) => r.path === clean);
  if (exact) {
    // If route requires auth but user not authenticated, return landing page
    if (!isAuthenticated && !publicRoutes.includes(clean)) {
      return { path: '/landing', title: 'Welcome', render: (n) => <Landing navigate={n} /> };
    }
    return denyIfAdminOnly(clean) || exact;
  }

  /* prefix fallback: /mines/campaign/x → mines home, etc. */
  const byPrefix = [...ROUTES].sort((a, b) => b.path.length - a.path.length).find((r) => r.path !== '/' && clean.startsWith(r.path + '/'));
  if (byPrefix) {
    // Check auth for prefix routes too
    if (!isAuthenticated && !publicRoutes.includes(byPrefix.path)) {
      return { path: '/landing', title: 'Welcome', render: (n) => <Landing navigate={n} /> };
    }
    return denyIfAdminOnly(byPrefix.path) || byPrefix;
  }

  // Default: if unauthenticated, go to landing; otherwise dashboard
  if (!isAuthenticated) {
    return { path: '/landing', title: 'Welcome', render: (n) => <Landing navigate={n} /> };
  }
  return { path: '/', title: 'Dashboard', render: (n) => <Dashboard navigate={n} /> };
}

export function useHashRoute(): { path: string; navigate: (p: string) => void } {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#\/?/, '/') || '/');

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '/') || '/';
      setPath(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: string) => {
    if (!p.startsWith('/')) p = '/' + p;
    window.location.hash = '#' + p;
  };

  return { path, navigate };
}