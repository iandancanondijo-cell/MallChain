import { useEffect, useState } from 'react';
import { store } from '../../../store/store';
import { useStoreVersion } from '../../../components/ui';
import CategoryPage from '../categories/CategoryPage';
import ReportsAdmin from '../categories/ReportsAdmin';
import PlatformAdmin from '../categories/PlatformAdmin';

// View state model:
//   'home'     — superadmin only: chooser modal listing all categories
//   'platform' — superadmin only: system-wide operations window
//   <category> — a single category window (works for any role, scoped server-side)
//
// The prior 'specialised' view (advanced/console.ts) was removed as part of
// the "purge admin hardcoded data" pass: it was a self-contained demo engine
// whose seeded rows and Math.random monitoring baselines kept rendering as
// fake data whenever a backend block was unimplemented. All admin surfaces
// are now served live through the React category pages below.
//
// URL hash drives routing. Examples:
//   #/admin?cat=kyc → KYC category window
//   #/admin?cat=platform → superadmin Platform window
//   #/admin         → Home chooser for superadmin, direct category for category admin
type AdminView = 'home' | 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports' | 'platform';

const CATEGORIES: AdminView[] = ['users', 'blockchain', 'validator', 'kyc', 'mining', 'treasury', 'marketplace', 'mlpts', 'reports', 'platform'];

// What each window covers — shown as one-liners in the chooser so an admin
// can study and go across all parts of Mallchain without guessing.
export const CATEGORY_DESCRIPTIONS: Record<Exclude<AdminView, 'home'>, { title: string; sub: string }> = {
  users: { title: 'Users Admin', sub: 'Account search, ban/unban, and provisioning new category admins' },
  blockchain: { title: 'Blockchain Admin', sub: 'Block height, chain health, validators and governance proposals' },
  validator: { title: 'Validator Admin', sub: 'Validator sign-up applications — approve or reject the active set' },
  kyc: { title: 'KYC & AML Admin', sub: 'Identity submissions, AML reviews, decision history, structuring flags' },
  mining: { title: 'Mining Admin', sub: 'Campaigns, task submissions awaiting payout, badge issuance' },
  treasury: { title: 'Treasury Admin', sub: 'Withdrawal payouts, treasury ledger, burn policies, AML flags' },
  marketplace: { title: 'Marketplace Admin', sub: 'On-chain escrow deals and marketplace burn events' },
  mlpts: { title: 'MLPTS & Liquidity Admin', sub: 'Mallpoints↔Mallcoin conversions and every liquidity pool flow' },
  reports: { title: 'Reports Admin', sub: 'Read and action escalation reports from category admins' },
  platform: { title: 'Platform Control', sub: 'Superadmin only: maintenance pause, broadcasts, audit log, reconciliation, roles, badge design' },
};

function parseHashView(): AdminView | null {
  const hash = window.location.hash || '';
  const catMatch = hash.match(/cat=([a-z]+)/);
  if (catMatch && (catMatch[1] === 'home' || CATEGORIES.includes(catMatch[1] as AdminView))) {
    return catMatch[1] as AdminView;
  }
  if (hash.includes('view=home')) return 'home';
  return null;
}

function getInitialView(): AdminView {
  const fromHash = parseHashView();
  if (fromHash) return fromHash;

  const role = store.state.user.role;
  const cat = store.state.user.adminCategory;

  if (role === 'admin') return (cat as AdminView) || 'home';
  return 'home';
}

export default function AdminApp() {
  useStoreVersion();
  const [view, setView] = useState<AdminView>(getInitialView);

  useEffect(() => {
    const compute = () => {
      const next = getInitialView();
      setView((prev) => (prev === next ? prev : next));
    };
    return store.subscribe(compute);
  }, []);

  const syncHash = (next: AdminView) => {
    if (next === 'home') {
      window.location.hash = '#/admin';
    } else {
      window.location.hash = `#/admin?cat=${next}`;
    }
  };

  useEffect(() => {
    const onHash = () => {
      const next = parseHashView() || getInitialView();
      setView(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const chooseCategory = (cat: AdminView) => {
    try {
      localStorage.setItem('admin_view_preference', cat);
    } catch {}
    setView(cat);
    syncHash(cat);
  };

  const goHome = () => {
    try {
      localStorage.setItem('admin_view_preference', 'home');
    } catch {}
    setView('home');
    syncHash('home');
  };

  const role = store.state.user.role;

  if (view === 'home') {
    return (
      <Chooser
        isSuperadmin={role === 'superadmin'}
        onPickCategory={chooseCategory}
        currentView={'home'}
      />
    );
  }

  return (
    <>
      <div className="adm-actions">
        {role === 'superadmin' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={goHome}>
            ← Categories
          </button>
        )}
        <a className="btn btn-ghost btn-sm" href="#/">Exit admin</a>
      </div>
      {view === 'reports' ? (
        <ReportsAdmin />
      ) : view === 'platform' ? (
        <PlatformAdmin />
      ) : (
        <CategoryPage category={view as Exclude<AdminView, 'home' | 'reports' | 'platform'>} />
      )}
    </>
  );
}

function Chooser({
  isSuperadmin,
  onPickCategory,
  currentView,
}: {
  isSuperadmin: boolean;
  onPickCategory: (cat: AdminView) => void;
  currentView: AdminView;
}) {
  if (!isSuperadmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt-2, #888)' }}>
        <h2 style={{ margin: 0 }}>No category assigned</h2>
        <p>Contact the superadmin to assign you to a category window.</p>
      </div>
    );
  }

  const cats: Array<{ id: AdminView; title: string; sub: string }> = [
    'platform', 'users', 'blockchain', 'validator', 'kyc', 'mining', 'treasury', 'marketplace', 'mlpts', 'reports',
  ].map((id) => ({
    id: id as AdminView,
    title: CATEGORY_DESCRIPTIONS[id as Exclude<AdminView, 'home'>].title,
    sub: CATEGORY_DESCRIPTIONS[id as Exclude<AdminView, 'home'>].sub,
  }));

  return (
    <div style={{ padding: '40px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', color: 'var(--txt-1, #fff)' }}>Choose an admin window</h2>
          <p style={{ margin: 0, color: 'var(--txt-3, #888)', fontSize: 14 }}>
            Each window shows only data for its category. Super admin can switch freely.
          </p>
        </div>
        <a className="btn btn-ghost btn-sm" href="#/">Exit admin</a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => onPickCategory(c.id)}
            className="adm-cat-tile"
            data-active={currentView === c.id ? 'true' : 'false'}
          >
            <strong>{c.title}</strong>
            <span className="adm-cat-sub">{c.sub}</span>
          </button>
        ))}
      </div>
      <style>{`
        .adm-cat-tile {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 18px 16px;
          text-align: left;
          color: var(--txt-1, #fff);
          cursor: pointer;
          font: inherit;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: transform .15s ease, border-color .15s ease, background .15s ease;
        }
        .adm-cat-tile:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.07); }
        .adm-cat-tile strong { font-size: 15px; }
        .adm-cat-sub { font-size: 12px; color: var(--txt-3, #999); font-weight: 400; }
      `}</style>
    </div>
  );
}
