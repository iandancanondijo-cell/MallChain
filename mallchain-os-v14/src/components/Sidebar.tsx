/**
 * Sidebar — fixed 252px, never moves (desktop). 8 collapsible groups mirroring the
 * v14 OS navigation: Home, Wallet, Marketplace, Staking, Governance,
 * Mines, Validators, Explorer, Ecosystem. Admin access isn't listed here —
 * admin credentials are routed straight to the dedicated admin shell
 * (AdminSidebar.tsx) on login instead.
 *
 * Below 768px this becomes an off-canvas drawer (see styles/global.css's
 * .sidebar.open transform) instead of the old permanent icon-only rail,
 * which had no way to open/close or to reach an item's label at all —
 * `mobileOpen`/`onClose` are driven from App.tsx, which also owns the
 * hamburger toggle (TopBar) and the backdrop.
 */
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Home, Activity, Bell, Wallet, Send, Download, Repeat, History, List,
  ShoppingBag, Layers, Scale, Vote, SlidersHorizontal, Compass, Megaphone,
  CheckCircle, DollarSign, Trophy, BarChart3, ShieldCheck, Lock, Shield,
  ClipboardEdit, User, Search, MessageCircle, Link as LinkIcon, FileCode,
  Code, Briefcase, Settings as SettingsIcon, PieChart, GraduationCap,
} from 'lucide-react';
import { store, type AppState } from '../store/store';
import { useStoreVersion } from './ui';
import { t } from '../services/i18n';

export interface NavEntry {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: (s: AppState) => number;
  /** Restricts visibility to these roles — absent means visible to every authenticated user. */
  roles?: ('admin' | 'superadmin')[];
}

interface NavGroup {
  title: string;
  items: NavEntry[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Home',
    items: [
      { label: 'Dashboard', path: '/', icon: Home },
      { label: 'Activity', path: '/activity', icon: Activity },
      { label: 'Notifications', path: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'Wallet',
    items: [
      { label: 'Overview', path: '/wallet', icon: Wallet },
      { label: 'Send', path: '/wallet/send', icon: Send },
      { label: 'Receive', path: '/wallet/receive', icon: Download },
      { label: 'Swap', path: '/wallet/swap', icon: Repeat },
      { label: 'History', path: '/wallet/history', icon: History },
      { label: 'Performance', path: '/wallet/performance', icon: BarChart3 },
      { label: 'Transactions', path: '/transactions', icon: List },
    ],
  },
  {
    title: 'Marketplace',
    items: [{ label: 'Browse', path: '/marketplace', icon: ShoppingBag }],
  },
  {
    title: 'Staking',
    items: [{ label: 'Stake MALL', path: '/staking', icon: Layers }],
  },
  {
    title: 'Governance',
    items: [
      { label: 'Proposals', path: '/governance', icon: Scale },
      { label: 'Voting', path: '/governance/voting', icon: Vote },
    ],
  },
  {
    title: 'Mines',
    items: [
      { label: 'Command Center', path: '/mines', icon: SlidersHorizontal },
      { label: 'Discover', path: '/mines/discover', icon: Compass },
      { label: 'My Campaigns', path: '/mines/my-campaigns', icon: Megaphone, badge: (s) => s.mines.participations.filter((p) => p.status === 'inprogress').length },
      { label: 'Participation', path: '/mines/participation', icon: CheckCircle },
      { label: 'Earnings', path: '/mines/earnings', icon: DollarSign },
      { label: 'Leaderboard', path: '/mines/leaderboard', icon: Trophy },
      { label: 'Analytics', path: '/mines/analytics', icon: BarChart3 },
      { label: 'History', path: '/mines/history', icon: History },
      { label: 'Proof Reviewer Queue', path: '/mines/validator-queue', icon: ShieldCheck },
      { label: 'Stake to Review', path: '/mines/reviewer/stake', icon: Lock },
    ],
  },
  {
    title: 'Validators',
    items: [
      { label: 'Become a Validator', path: '/validators', icon: Shield },
      { label: 'Apply', path: '/validators/apply', icon: ClipboardEdit },
      { label: 'Leaderboard', path: '/validators/leaderboard', icon: Trophy },
      { label: 'My Application', path: '/validators/profile', icon: User },
    ],
  },
  {
    title: 'Explorer',
    items: [
      { label: 'Blocks & Txs', path: '/explorer', icon: Search },
      { label: 'Economy', path: '/economy', icon: PieChart },
    ],
  },
  {
    title: 'Ecosystem',
    items: [
      { label: 'Messaging', path: '/messaging', icon: MessageCircle, badge: (s) => s.messaging.conversations.reduce((a, c) => a + c.unread, 0) },
      { label: 'EDU', path: '/edu', icon: GraduationCap },
      { label: 'Referrals', path: '/referrals', icon: LinkIcon },
      { label: 'Smart Contracts', path: '/contracts', icon: FileCode },
      { label: 'Developer Hub', path: '/devhub', icon: Code },
      { label: 'Careers', path: '/careers', icon: Briefcase },
      { label: 'Settings', path: '/settings', icon: SettingsIcon },
      { label: 'Profile', path: '/profile', icon: User },
    ],
  },
];

export default function Sidebar({ path, mobileOpen, onClose }: { path: string; mobileOpen?: boolean; onClose?: () => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useStoreVersion();
  const st = store.state;
  const isActive = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <aside className={'sidebar' + (mobileOpen ? ' open' : '')}>
      <a href="#/" className="side-logo" onClick={() => onClose?.()}>
        <span className="hex" aria-hidden="true"><img src="/favicon.svg" alt="" width={28} height={28} /></span>
        <span className="txt">Mallchain</span>
      </a>
      <nav aria-label="Main navigation">
        {GROUPS.map((g) => (
          <div key={g.title} className={'side-group' + (collapsed[g.title] ? ' collapsed' : '')}>
            <button
              type="button"
              className="side-group-title"
              aria-expanded={!collapsed[g.title]}
              onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}
            >
              {t(g.title)}
              <span className="caret" aria-hidden="true">▼</span>
            </button>
            <div className="side-item-wrap">
              {g.items.filter((it) => !it.roles || it.roles.includes(st.user.role as 'admin' | 'superadmin')).map((it) => {
                const badge = it.badge?.(st) ?? 0;
                const Icon = it.icon;
                const active = isActive(it.path);
                return (
                  <a
                    key={it.path}
                    href={'#' + it.path}
                    className={'side-item' + (active ? ' active' : '')}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onClose?.()}
                  >
                    <span className="ic" aria-hidden="true"><Icon size={16} /></span>
                    <span className="txt">{t(it.label)}</span>
                    {badge > 0 && <span className="badge">{badge}<span className="sr-only"> unread</span></span>}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
