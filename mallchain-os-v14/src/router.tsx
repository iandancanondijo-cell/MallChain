/**
 * Mallchain Mission Control v14 — hash router (mirrors the dashboard's
 * #/ route map). Every route is deep-linkable on reload.
 */
import { useEffect, useState } from 'react';
import { store } from './store/store';
import { seedIfDemo } from './demo/seeds';
import { Careers, Learning, SocialTasks, NotificationsView, AnalyticsView, Help } from './features/misc/MiscViews';

/* pages */
import Landing from './pages/Landing';
import WalletSettings from './pages/WalletSettings';
import AddressBook from './pages/AddressBook';
import SecuritySettings from './pages/SecuritySettings';
import TransactionHistory from './pages/TransactionHistory';
import BlockchainExplorer from './pages/BlockchainExplorer';

/* feature modules — each maps to a v14 view */
import Dashboard from './features/dashboard/Dashboard';
import AuthFlow from './features/auth/AuthFlow';
import WalletHub from './features/wallet/WalletHub';
import WalletSend from './features/wallet/WalletSend';
import WalletReceive from './features/wallet/WalletReceive';
import WalletSwap from './features/wallet/WalletSwap';
import WalletHistory from './features/wallet/WalletHistory';
import Marketplace from './features/marketplace/Marketplace';
import Staking from './features/staking/Staking';
import Governance from './features/governance/Governance';
import MinesHome from './features/mines/MinesHome';
import MinesDiscover from './features/mines/MinesDiscover';
import MinesMyCampaigns from './features/mines/MinesMyCampaigns';
import MinesParticipation from './features/mines/MinesParticipation';
import MinesEarnings from './features/mines/MinesEarnings';
import MinesLeaderboard from './features/mines/MinesLeaderboard';
import MinesAnalytics from './features/mines/MinesAnalytics';
import MinesHistory from './features/mines/MinesHistory';
import MinesValidatorQueue from './features/mines/MinesValidatorQueue';
import ValidatorsHome from './features/validators/ValidatorsHome';
import ValidatorsApply from './features/validators/ValidatorsApply';
import ValidatorsStake from './features/validators/ValidatorsStake';
import ValidatorsTraining from './features/validators/ValidatorsTraining';
import ValidatorsApproval from './features/validators/ValidatorsApproval';
import ValidatorsDashboard from './features/validators/ValidatorsDashboard';
import ValidatorsCalculator from './features/validators/ValidatorsCalculator';
import ValidatorsLeaderboard from './features/validators/ValidatorsLeaderboard';
import ValidatorsProfile from './features/validators/ValidatorsProfile';
import Explorer from './features/explorer/Explorer';
import Messaging from './features/messaging/Messaging';
import Referrals from './features/referrals/Referrals';
import Admin from './features/admin/Admin';
import Settings from './features/settings/Settings';
import Profile from './features/profile/Profile';
import Contracts from './features/contracts/Contracts';
import DevHub from './features/devhub/DevHub';

/* routes: specific-before-generic */
export interface RouteDef {
  path: string;
  render: (navigate: (p: string) => void) => React.ReactNode;
}

export const ROUTES: RouteDef[] = [
  { path: '/landing', render: (n) => <Landing navigate={n} /> },
  { path: '/', render: (n) => <Dashboard navigate={n} /> },
  /* auth - redirect to landing if already authenticated */
  { path: '/auth', render: (n) => <AuthFlow navigate={n} /> },
  { path: '/login', render: (n) => <AuthFlow navigate={n} /> },
  /* wallet */
  { path: '/wallet/settings', render: () => <WalletSettings /> },
  { path: '/wallet/address-book', render: () => <AddressBook /> },
  { path: '/security', render: () => <SecuritySettings /> },
  { path: '/transactions', render: () => <TransactionHistory /> },
  { path: '/wallet/send', render: () => <WalletSend /> },
  { path: '/wallet/receive', render: () => <WalletReceive /> },
  { path: '/wallet/swap', render: () => <WalletSwap /> },
  { path: '/wallet/history', render: () => <WalletHistory /> },
  { path: '/wallet', render: (n) => <WalletHub navigate={n} /> },
  /* marketplace / staking / governance */
  { path: '/marketplace', render: (n) => <Marketplace navigate={n} /> },
  { path: '/staking', render: () => <Staking /> },
  { path: '/governance', render: () => <Governance /> },
  { path: '/governance/voting', render: () => <Governance /> },
  /* mines */
  { path: '/mines/discover', render: (n) => <MinesDiscover navigate={n} /> },
  { path: '/mines/my-campaigns', render: () => <MinesMyCampaigns /> },
  { path: '/mines/participation', render: () => <MinesParticipation /> },
  { path: '/mines/earnings', render: () => <MinesEarnings /> },
  { path: '/mines/leaderboard', render: () => <MinesLeaderboard /> },
  { path: '/mines/analytics', render: () => <MinesAnalytics /> },
  { path: '/mines/history', render: () => <MinesHistory /> },
  { path: '/mines/validator-queue', render: () => <MinesValidatorQueue /> },
  { path: '/mines', render: (n) => <MinesHome navigate={n} /> },
  /* validators */
  { path: '/validators/calculator', render: (n) => <ValidatorsCalculator navigate={n} /> },
  { path: '/validators/rewards-leaderboard', render: (n) => <ValidatorsLeaderboard tab="rewards" navigate={n} /> },
  { path: '/validators/leaderboard', render: (n) => <ValidatorsLeaderboard tab="reputation" navigate={n} /> },
  { path: '/validators/apply', render: (n) => <ValidatorsApply navigate={n} /> },
  { path: '/validators/stake', render: (n) => <ValidatorsStake navigate={n} /> },
  { path: '/validators/training', render: (n) => <ValidatorsTraining navigate={n} /> },
  { path: '/validators/approval', render: (n) => <ValidatorsApproval navigate={n} /> },
  { path: '/validators/dashboard', render: (n) => <ValidatorsDashboard navigate={n} /> },
  { path: '/validators/profile', render: () => <ValidatorsProfile /> },
  { path: '/validators', render: (n) => <ValidatorsHome navigate={n} /> },
  /* explorer / messaging / referrals / admin / settings / profile / misc */
  { path: '/explorer', render: () => <BlockchainExplorer /> },
  { path: '/messaging', render: () => <Messaging /> },
  { path: '/referrals', render: () => <Referrals /> },
  { path: '/admin', render: () => <Admin /> },
  { path: '/settings', render: () => <Settings /> },
  { path: '/profile', render: () => <Profile /> },
  { path: '/contracts', render: () => <Contracts /> },
  { path: '/devhub', render: () => <DevHub /> },
  { path: '/careers', render: () => <Careers /> },
  { path: '/learning', render: () => <Learning /> },
  { path: '/social-tasks', render: () => <SocialTasks /> },
  { path: '/notifications', render: () => <NotificationsView /> },
  { path: '/analytics', render: () => <AnalyticsView /> },
  { path: '/help', render: () => <Help /> },
  { path: '/security', render: () => <Help /> },
  { path: '/search', render: (n) => <Dashboard navigate={n} /> },
  { path: '/activity', render: (n) => <Dashboard navigate={n} /> },
];

export function matchRoute(path: string, isAuthenticated: boolean = true): RouteDef {
  const clean = path.split('?')[0];
  
  // PHASE 0 FIX: Public routes that don't require authentication
  const publicRoutes = ['/landing', '/auth'];
  
  const exact = ROUTES.find((r) => r.path === clean);
  if (exact) {
    // If route requires auth but user not authenticated, return landing page
    if (!isAuthenticated && !publicRoutes.includes(clean)) {
      return { path: '/landing', render: (n) => <Landing navigate={n} /> };
    }
    return exact;
  }
  
  /* prefix fallback: /mines/campaign/x → mines home, etc. */
  const byPrefix = [...ROUTES].sort((a, b) => b.path.length - a.path.length).find((r) => r.path !== '/' && clean.startsWith(r.path + '/'));
  if (byPrefix) {
    // Check auth for prefix routes too
    if (!isAuthenticated && !publicRoutes.includes(byPrefix.path)) {
      return { path: '/landing', render: (n) => <Landing navigate={n} /> };
    }
    return byPrefix;
  }
  
  // Default: if unauthenticated, go to landing; otherwise dashboard
  if (!isAuthenticated) {
    return { path: '/landing', render: (n) => <Landing navigate={n} /> };
  }
  return { path: '/', render: (n) => <Dashboard navigate={n} /> };
}

/**
 * Check if a route requires authentication
 * Returns true for all routes except landing, auth, and login
 */
export function requiresAuth(path: string): boolean {
  const publicRoutes = ['/landing', '/auth', '/login'];
  const clean = path.split('?')[0];
  return !publicRoutes.includes(clean) && !clean.startsWith('/auth');
}

export function useHashRoute(): { path: string; navigate: (p: string) => void } {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#\/?/, '/') || '/');

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '/') || '/';
      setPath(h);
    };
    window.addEventListener('hashchange', onHash);
    /* seed demo data once on boot (demoMode gate) */
    seedIfDemo(store.state);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: string) => {
    if (!p.startsWith('/')) p = '/' + p;
    window.location.hash = '#' + p;
  };

  return { path, navigate };
}