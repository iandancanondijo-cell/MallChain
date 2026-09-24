/**
 * AdminSidebar — the admin area's own nav shell, deliberately separate from
 * Sidebar.tsx. Shows nothing from the regular user app (no Wallet,
 * Marketplace, Staking, Governance, Mines, Validators, Explorer, Messaging,
 * Referrals, Contracts, DevHub, Careers, Settings, Profile) — an admin
 * session should look and navigate like a distinct control panel, not the
 * user dashboard with one extra menu item.
 *
 * The sidebar now owns the primary navigation for the 12 admin sections
 * (Dashboard, Users, KYC Review, AML Review, Validator Applications, Mining,
 * Badges, Liquidity Activity, Reconciliation, Withdrawals, Treasury, Audit Log)
 * plus a secondary "Local" item for Maintenance & Banners. Tab selection is
 * driven by activeTab/onTabChange props owned by App.tsx, which also passes
 * them to Admin.tsx.
 *
 * Same off-canvas drawer behavior on mobile as Sidebar.tsx — mobileOpen/onClose
 * are driven from App.tsx, which also owns the hamburger toggle (TopBar) and
 * the backdrop.
 */
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Hammer,
  Award,
  Waves,
  FileCheck2,
  ArrowUpRight,
  Landmark,
  ScrollText,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion } from './ui';

type AdminTab = 'dashboard' | 'users' | 'kyc' | 'aml' | 'validators' | 'mining' | 'badges' | 'liquidity' | 'reconciliation' | 'withdrawals' | 'treasury' | 'audit' | 'local';

interface AdminNavItem {
  tab: AdminTab;
  label: string;
  icon: LucideIcon;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { tab: 'users', label: 'Users', icon: Users },
  { tab: 'kyc', label: 'KYC Review', icon: Shield },
  { tab: 'aml', label: 'AML Review', icon: ShieldAlert },
  { tab: 'validators', label: 'Validator Applications', icon: ShieldCheck },
  { tab: 'mining', label: 'Mining', icon: Hammer },
  { tab: 'badges', label: 'Badges', icon: Award },
  { tab: 'liquidity', label: 'Liquidity Activity', icon: Waves },
  { tab: 'reconciliation', label: 'Reconciliation', icon: FileCheck2 },
  { tab: 'withdrawals', label: 'Withdrawals', icon: ArrowUpRight },
  { tab: 'treasury', label: 'Treasury', icon: Landmark },
  { tab: 'audit', label: 'Audit Log', icon: ScrollText },
];

export default function AdminSidebar({
  mobileOpen,
  onClose,
  activeTab,
  onTabChange,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}) {
  useStoreVersion();
  const st = store.state;

  const handleNavClick = (tab: AdminTab) => {
    onTabChange(tab);
    onClose?.();
  };

  return (
    <aside className={'sidebar' + (mobileOpen ? ' open' : '')}>
      <div className="side-logo" style={{ color: 'var(--red-2, #f87171)' }}>
        <span className="hex" aria-hidden="true"><img src="/favicon.svg" alt="" width={28} height={28} /></span>
        <span className="txt">Admin</span>
      </div>

      <nav aria-label="Admin navigation" className="side-group">
        <div className="side-item-wrap">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                className={'side-item' + (isActive ? ' active' : '')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleNavClick(item.tab)}
              >
                <span className="ic" aria-hidden="true"><Icon size={16} /></span>
                <span className="txt">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="side-group">
        <div className="side-group-title" style={{ cursor: 'default' }}>Settings</div>
        <div className="side-item-wrap">
          <button
            type="button"
            className={'side-item' + (activeTab === 'local' ? ' active' : '')}
            aria-current={activeTab === 'local' ? 'page' : undefined}
            onClick={() => handleNavClick('local')}
          >
            <span className="ic" aria-hidden="true"><Wrench size={16} /></span>
            <span className="txt">Maintenance & Banners</span>
          </button>
        </div>
      </div>

      <div className="side-group">
        <div className="side-group-title" style={{ cursor: 'default' }}>Signed in as</div>
        <div style={{ padding: '4px 18px 14px', fontSize: 12.5, color: 'var(--txt-2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{st.user.name || st.user.email}</div>
          <div className="tiny">{st.user.role}</div>
        </div>
      </div>

      <nav aria-label="Exit admin" className="side-group">
        <div className="side-item-wrap">
          <a href="#/" className="side-item" onClick={() => onClose?.()}>
            <span className="ic" aria-hidden="true"><ArrowLeft size={16} /></span>
            <span className="txt">Exit admin — back to app</span>
          </a>
        </div>
      </nav>
    </aside>
  );
}
