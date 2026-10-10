import { ArrowLeft } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion } from './ui';

export type AdminTab =
  | 'overview'
  | 'chain'
  | 'users'
  | 'kyc'
  | 'aml'
  | 'mining'
  | 'badges'
  | 'treasury'
  | 'withdrawals'
  | 'reconciliation'
  | 'liquidity'
  | 'notifications'
  | 'emergency'
  | 'audit';

interface AdminNavItem {
  tab: AdminTab;
  label: string;
}

interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: 'Overview',
    items: [
      { tab: 'overview', label: 'Dashboard' },
    ],
  },
  {
    title: 'Blockchain',
    items: [
      { tab: 'chain', label: 'Network monitoring' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { tab: 'users', label: 'Users' },
      { tab: 'kyc', label: 'KYC review' },
      { tab: 'aml', label: 'AML review' },
      { tab: 'mining', label: 'Mining campaigns' },
      { tab: 'badges', label: 'Badges' },
    ],
  },
  {
    title: 'Economy',
    items: [
      { tab: 'treasury', label: 'Treasury' },
      { tab: 'withdrawals', label: 'Withdrawals' },
      { tab: 'reconciliation', label: 'Reconciliation' },
      { tab: 'liquidity', label: 'Liquidity' },
    ],
  },
  {
    title: 'Security',
    items: [
      { tab: 'notifications', label: 'Broadcast' },
      { tab: 'emergency', label: 'System lock' },
      { tab: 'audit', label: 'Audit log' },
    ],
  },
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
    <aside className="adm-side">
      <div className="adm-logo">
        <span className="adm-logo-dot" aria-hidden="true" />
        <span>Control Center</span>
      </div>

      <nav aria-label="Admin navigation" style={{ flex: 1, overflowY: 'auto' }}>
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="adm-gh">{group.title}</div>
            {group.items.map((item) => {
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  className="adm-nav"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(item.tab)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="adm-side-footer">
        <div className="adm-side-user">
          <b>{st.user.name || st.user.email}</b>
          {st.user.role}
        </div>
        <a href="#/" className="adm-exit" onClick={() => onClose?.()}>
          <ArrowLeft size={14} />
          Exit admin
        </a>
      </div>
    </aside>
  );
}
