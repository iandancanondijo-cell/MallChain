/**
 * Sidebar — fixed 252px, never moves. 9 collapsible groups mirroring the
 * v14 OS navigation: Home, Wallet, Marketplace, Staking, Governance,
 * Mines, Validators, Explorer, Ecosystem.
 */
import { useState } from 'react';
import { store, type AppState } from '../store/store';
import { useStoreVersion } from './ui';

export interface NavEntry {
  label: string;
  path: string;
  icon: string;
  badge?: (s: AppState) => number;
}

interface NavGroup {
  title: string;
  items: NavEntry[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Home',
    items: [
      { label: 'Dashboard', path: '/', icon: '⌂' },
      { label: 'Activity', path: '/activity', icon: '◷' },
      { label: 'Notifications', path: '/notifications', icon: '🔔' },
    ],
  },
  {
    title: 'Wallet',
    items: [
      { label: 'Overview', path: '/wallet', icon: '◈' },
      { label: 'Send', path: '/wallet/send', icon: '➤' },
      { label: 'Receive', path: '/wallet/receive', icon: '⬇' },
      { label: 'Swap', path: '/wallet/swap', icon: '⇄' },
      { label: 'History', path: '/wallet/history', icon: '▤' },
      { label: 'Transactions', path: '/transactions', icon: '📋' },
    ],
  },
  {
    title: 'Marketplace',
    items: [{ label: 'Browse', path: '/marketplace', icon: '🛍' }],
  },
  {
    title: 'Staking',
    items: [{ label: 'Stake MALL', path: '/staking', icon: '⛁' }],
  },
  {
    title: 'Governance',
    items: [
      { label: 'Proposals', path: '/governance', icon: '⚖' },
      { label: 'Voting', path: '/governance/voting', icon: '🗳' },
    ],
  },
  {
    title: 'Mines',
    items: [
      { label: 'Command Center', path: '/mines', icon: '🎛' },
      { label: 'Discover', path: '/mines/discover', icon: '🧭' },
      { label: 'My Campaigns', path: '/mines/my-campaigns', icon: '📣', badge: (s) => s.mines.participations.filter((p) => p.status === 'inprogress').length },
      { label: 'Participation', path: '/mines/participation', icon: '✅' },
      { label: 'Earnings', path: '/mines/earnings', icon: '💰' },
      { label: 'Leaderboard', path: '/mines/leaderboard', icon: '🏆' },
      { label: 'Analytics', path: '/mines/analytics', icon: '📊' },
      { label: 'History', path: '/mines/history', icon: '🕘' },
      { label: 'Validator Queue', path: '/mines/validator-queue', icon: '🛂' },
    ],
  },
  {
    title: 'Validators',
    items: [
      { label: 'Become a Validator', path: '/validators', icon: '🛡' },
      { label: 'Apply', path: '/validators/apply', icon: '📝' },
      { label: 'Stake', path: '/validators/stake', icon: '🔒' },
      { label: 'Training', path: '/validators/training', icon: '🎓' },
      { label: 'Approval', path: '/validators/approval', icon: '⏳' },
      { label: 'Dashboard', path: '/validators/dashboard', icon: '📟' },
      { label: 'Rewards Calculator', path: '/validators/calculator', icon: '🧮' },
      { label: 'Rewards Leaderboard', path: '/validators/rewards-leaderboard', icon: '🏅' },
      { label: 'Leaderboard', path: '/validators/leaderboard', icon: '🏆' },
      { label: 'Profile', path: '/validators/profile', icon: '👤' },
    ],
  },
  {
    title: 'Explorer',
    items: [{ label: 'Blocks & Txs', path: '/explorer', icon: '🔎' }],
  },
  {
    title: 'Ecosystem',
    items: [
      { label: 'Messaging', path: '/messaging', icon: '💬', badge: (s) => s.messaging.conversations.reduce((a, c) => a + c.unread, 0) },
      { label: 'Referrals', path: '/referrals', icon: '🔗' },
      { label: 'Smart Contracts', path: '/contracts', icon: '📜' },
      { label: 'Developer Hub', path: '/devhub', icon: '⚙' },
      { label: 'Careers', path: '/careers', icon: '💼' },
      { label: 'Settings', path: '/settings', icon: '⚙' },
      { label: 'Profile', path: '/profile', icon: '👤' },
      { label: 'Admin', path: '/admin', icon: '🛠' },
    ],
  },
];

export default function Sidebar({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useStoreVersion();
  const st = store.state;
  const isActive = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <aside className="sidebar">
      <div className="side-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <span className="hex">M</span>
        <span className="txt">Mallchain</span>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} className={'side-group' + (collapsed[g.title] ? ' collapsed' : '')}>
          <div className="side-group-title" onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}>
            {g.title}
            <span className="caret">▼</span>
          </div>
          <div className="side-item-wrap">
            {g.items.map((it) => {
              const badge = it.badge?.(st) ?? 0;
              return (
                <div
                  key={it.path}
                  className={'side-item' + (isActive(it.path) ? ' active' : '')}
                  onClick={() => navigate(it.path)}
                >
                  <span className="ic">{it.icon}</span>
                  <span className="txt">{it.label}</span>
                  {badge > 0 && <span className="badge">{badge}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
