/**
 * AdminSidebar — the admin area's own nav shell, deliberately separate from
 * Sidebar.tsx. Shows nothing from the regular user app (no Wallet,
 * Marketplace, Staking, Governance, Mines, Validators, Explorer, Messaging,
 * Referrals, Contracts, DevHub, Careers, Settings, Profile) — an admin
 * session should look and navigate like a distinct control panel, not the
 * user dashboard with one extra menu item.
 *
 * Admin.tsx keeps its own internal tab switcher (Dashboard/Users/KYC
 * Review/Validator Applications/Mining/Audit Log/Local Banners) as the
 * actual section nav; this sidebar only frames that area and provides the
 * way back out.
 */
import { ArrowLeft } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion } from './ui';

export default function AdminSidebar({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;

  return (
    <aside className="sidebar">
      <div className="side-logo" style={{ color: 'var(--red-2, #f87171)' }}>
        <span className="hex">M</span>
        <span className="txt">Admin</span>
      </div>

      <div className="side-group">
        <div className="side-group-title">Signed in as</div>
        <div style={{ padding: '4px 18px 14px', fontSize: 12.5, color: 'var(--txt-2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{st.user.name || st.user.email}</div>
          <div className="tiny">{st.user.role}</div>
        </div>
      </div>

      <div className="side-group">
        <div className="side-item-wrap">
          <div className="side-item" onClick={() => navigate('/')}>
            <span className="ic"><ArrowLeft size={16} /></span>
            <span className="txt">Exit admin — back to app</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
