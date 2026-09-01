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
 * way back out. Same off-canvas drawer behavior on mobile as Sidebar.tsx —
 * previously this had no mobile nav at all (the 64px icon-rail collapse
 * also clipped the "Signed in as" name/email with no CSS handling for it;
 * the wider drawer used here doesn't have that problem).
 */
import { ArrowLeft } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion } from './ui';

export default function AdminSidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  useStoreVersion();
  const st = store.state;

  return (
    <aside className={'sidebar' + (mobileOpen ? ' open' : '')}>
      <div className="side-logo" style={{ color: 'var(--red-2, #f87171)' }}>
        <span className="hex" aria-hidden="true">M</span>
        <span className="txt">Admin</span>
      </div>

      <div className="side-group">
        <div className="side-group-title" style={{ cursor: 'default' }}>Signed in as</div>
        <div style={{ padding: '4px 18px 14px', fontSize: 12.5, color: 'var(--txt-2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{st.user.name || st.user.email}</div>
          <div className="tiny">{st.user.role}</div>
        </div>
      </div>

      <nav aria-label="Admin navigation" className="side-group">
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
