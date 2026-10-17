/**
 * CategoryPage — the single dispatcher used by AdminApp for any non-Reports
 * category window. Each `category` value points to its own subcomponent that
 * only talks to adminApi endpoints scoped to that category server-side
 * (see backend/src/middleware/categoryAccess.js). The dispatcher exists so
 * AdminApp doesn't need to know whether KYC vs Validator is up — it just
 * hands the category down.
 *
 * Wiring contract:
 *   <Page category={view} /> in AdminApp.tsx mounts <CategoryPage category={view}>.
 *   Reports has its own component (ReportsAdmin) and is routed by AdminApp.
 *
 * Data isolation:
 *   The components below never call endpoints that aren't scoped to their
 *   category. A category admin who is assigned to "kyc" cannot reach the
 *   endpoints the Validator admin calls — the server-side middleware
 *   short-circuits with 403, so we hide them from the UI too as defense
 *   in depth.
 */
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../../services/adminApi';
import type {
  AdminAmlReview,
  AdminBadgePurchase,
  AdminBadgeIssuance,
  AdminCampaign,
  AdminDashboardStats,
  AdminKycSubmission,
  AdminStructuringFlag,
  AdminSubmission,
  AdminUser,
  AdminValidatorApplication,
  AdminWithdrawalRequest,
  BurnPolicyEntry,
  ChainBlock,
  ChainStatus,
  ChainValidator,
  DynamicBurnThresholdEntry,
  LiquidityActivityItem,
  TreasuryLedgerEntry,
  TreasuryMetricTotal,
} from '../../../services/adminApi';
import { fmtNum, Modal, toast } from '../../../components/ui';
import { store } from '../../../store/store';
import ReportsAdmin from './ReportsAdmin';

export type Category =
  | 'users'
  | 'blockchain'
  | 'validator'
  | 'kyc'
  | 'mining'
  | 'treasury'
  | 'marketplace'
  | 'mlpts';

const CATEGORY_LABELS: Record<Category, string> = {
  users: 'Users',
  blockchain: 'Blockchain',
  validator: 'Validator',
  kyc: 'KYC & AML',
  mining: 'Mining & Badges',
  treasury: 'Treasury',
  marketplace: 'Marketplace',
  mlpts: 'MLPTS & Liquidity',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function formatKes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B KES';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M KES';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k KES';
  return `${Math.round(n * 100) / 100} KES`;
}

export default function CategoryPage({ category }: { category: Category }) {
  const me = store.state.user;
  const isSuper = me.role === 'superadmin';

  // Safety: if a category admin finds themselves here without the matching
  // adminCategory, surface the explanation instead of rendering the wrong UI.
  if (me.role === 'admin' && me.adminCategory !== category && me.adminCategory !== 'reports') {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>Category mismatch</h2>
        <p style={{ color: 'var(--txt-3)' }}>
          You're signed in as a <b>{me.adminCategory}</b> admin, but this window is
          for <b>{category}</b>. Each admin is scoped to their own window.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div className="sec-title">
        <h2>{CATEGORY_LABELS[category]}</h2>
        <span className="sub">
          {category === 'users'
            ? `${me.role === 'admin' ? 'Your category window — only users data is shown.' : 'All accounts live from MongoDB.'}`
            : 'Live backend data scoped to this category.'}
        </span>
        {isSuper && (
          <span className="chip gold" style={{ marginLeft: 'auto' }}>superadmin view</span>
        )}
      </div>
      <Body category={category} />

      {/* Reports channel (sender side): category admins live in their
          category window without a chooser, so the compose + status
          surface is rendered here instead of as a separate top-level tab.
          The backend scopes /api/admin/reports to the JWT user, so each
          admin only ever sees their own reports. */}
      {!isSuper && <ReportsAdmin />}
    </div>
  );
}

function Body({ category }: { category: Category }) {
  switch (category) {
    case 'users':
      return <UsersAdmin />;
    case 'blockchain':
      return <BlockchainAdmin />;
    case 'validator':
      return <ValidatorAdmin />;
    case 'kyc':
      return <KycAdmin />;
    case 'mining':
      return <MiningAdmin />;
    case 'treasury':
      return <TreasuryAdmin />;
    case 'marketplace':
      return <MarketplaceAdmin />;
    case 'mlpts':
      return <MlptsAdmin />;
  }
}

// ============================================================================
// USERS — /api/admin/users (category:users) + /api/admin/users POST/PATCH (superadmin)
// ============================================================================

function UsersAdmin() {
  const me = store.state.user;
  const isSuper = me.role === 'superadmin';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (q?: string) => {
    setLoading(true);
    const r = await adminApi.listUsers(q ? { search: q } : undefined);
    if (r.ok && r.data) {
      setUsers(r.data.users);
      setTotal(r.data.total);
    } else {
      toast(r.error || 'Failed to load users', false);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const ban = async () => {
    if (!banTarget) return;
    const r = await adminApi.banUser(banTarget._id, true, banReason.trim() || undefined);
    if (r.ok && r.data) {
      toast(`${r.data.user.email} banned`);
      setBanTarget(null);
      setBanReason('');
      void load(search);
    } else {
      toast(r.error || 'Failed to ban user', false);
    }
  };

  const unban = async (u: AdminUser) => {
    const r = await adminApi.banUser(u._id, false);
    if (r.ok) {
      toast(`${u.email} unbanned`);
      void load(search);
    } else {
      toast(r.error || 'Failed to unban', false);
    }
  };

  return (
    <>
      <div className="card mt">
        <div className="sec-title">
          <h2>Accounts</h2>
          <span className="sub">{fmtNum(total)} users · live from MongoDB</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Search by email or username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(search);
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => void load(search)}>
            Search
          </button>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>
                  <b>{u.username || u.email}</b>
                  <div className="tiny">{u.email}</div>
                </td>
                <td>{u.role}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  {u.banned ? (
                    <span className="chip red">Banned</span>
                  ) : (
                    <span className="chip green">Active</span>
                  )}
                </td>
                <td>
                  {u.banned ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => void unban(u)}>
                      Unban
                    </button>
                  ) : u.role !== 'superadmin' ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setBanTarget(u);
                        setBanReason('');
                      }}
                    >
                      Ban
                    </button>
                  ) : (
                    <span className="tiny" style={{ color: 'var(--txt-3)' }}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
            No users match this search.
          </div>
        )}
      </div>

      {isSuper && <CreateCategoryAdmin onCreated={() => void load(search)} />}

      {banTarget && (
        <Modal title="Ban user" onClose={() => setBanTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Ban <b>{banTarget.email}</b>? They will be signed out and blocked from signing back in.
          </p>
          <textarea
            className="input"
            rows={2}
            placeholder="Reason (stored on the account)…"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setBanTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={() => void ban()}>
              Confirm ban
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateCategoryAdmin({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [cat, setCat] = useState<Category>('kyc');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      toast('Email and password are required', false);
      return;
    }
    if (password.length < 10) {
      toast('Password must be at least 10 characters', false);
      return;
    }
    setBusy(true);
    const r = await adminApi.createCategoryAdmin({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
      adminCategory: cat,
    });
    setBusy(false);
    if (r.ok && r.data) {
      toast(`Created ${cat} admin: ${r.data.user.email}`);
      setEmail('');
      setPassword('');
      setName('');
      onCreated();
    } else {
      toast(r.error || 'Failed to create admin', false);
    }
  };

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Create category admin</h2>
        <span className="sub">Superadmin only — provision a new admin scoped to one window</span>
        <span className="chip gold" style={{ marginLeft: 'auto' }}>
          superadmin
        </span>
      </div>
      <div className="stat-grid" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-label">Email</div>
          <input
            className="input mt"
            type="email"
            placeholder="kyc-admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-label">Name (optional)</div>
          <input
            className="input mt"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-label">Password (≥10 chars)</div>
          <input
            className="input mt"
            type="password"
            placeholder="Strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-label">Category</div>
          <select
            className="input mt"
            value={cat}
            onChange={(e) => setCat(e.target.value as Category)}
          >
            <option value="users">Users</option>
            <option value="blockchain">Blockchain</option>
            <option value="validator">Validator</option>
            <option value="kyc">KYC &amp; AML</option>
            <option value="mining">Mining &amp; Badges</option>
            <option value="treasury">Treasury</option>
            <option value="marketplace">Marketplace</option>
            <option value="mlpts">MLPTS &amp; Liquidity</option>
            <option value="reports">Reports</option>
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary mt"
        onClick={() => void submit()}
        disabled={busy}
        style={{ marginTop: 12 }}
      >
        {busy ? 'Creating…' : 'Create admin'}
      </button>
      <p className="tiny mt" style={{ color: 'var(--txt-3)' }}>
        The new admin will land on their category window on login. They cannot reach any other
        category window — server-side middleware enforces this on every request.
      </p>
    </div>
  );
}

// ============================================================================
// BLOCKCHAIN — /api/admin/chain/* (category:blockchain) + /api/admin/governance/stats
// ============================================================================

function BlockchainAdmin() {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [blocks, setBlocks] = useState<ChainBlock[]>([]);
  const [validators, setValidators] = useState<ChainValidator[]>([]);
  const [bonded, setBonded] = useState('');
  const [governance, setGovernance] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, b, v, g] = await Promise.all([
      adminApi.getChainStatus(),
      adminApi.getChainBlocks(8),
      adminApi.getChainValidators(),
      adminApi.getDashboard(),
    ]);
    if (s.ok && s.data) setStatus(s.data.status);
    if (b.ok && b.data) setBlocks(b.data.blocks);
    if (v.ok && v.data) {
      setValidators(v.data.validators);
      setBonded(v.data.bondedTokens);
    }
    if (g.ok && g.data) setGovernance(g.data.stats);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Block Height</div>
          <div className="card-value">{status ? fmtNum(status.blockHeight) : '—'}</div>
          <div className="card-sub">
            {status ? `${status.peerCount} peers · ${status.chainId}` : 'live from :1317'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Latest Block Time</div>
          <div className="card-value" style={{ fontSize: 18 }}>
            {status?.blockTime ? timeAgo(status.blockTime) : '—'}
          </div>
          <div className="card-sub">
            {status
              ? `${status.txCountInBlock} txs in latest block`
              : 'synced from tendermint'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Validators</div>
          <div className="card-value">{validators.length}</div>
          <div className="card-sub">{bonded || '—'} bonded</div>
        </div>
        <div className="card">
          <div className="card-label">Pending Proposals</div>
          <div className="card-value">
            {governance ? governance.validators.pending : '—'}
          </div>
          <div className="card-sub">x/gov proposals open</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Recent blocks</h2>
          <span className="sub">Refreshed every 15s</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {blocks.length === 0 && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
            {loading ? 'loading.........' : 'No block data available.'}
          </div>
        )}
        {blocks.map((b) => (
          <div key={b.height} className="list-row">
            <div className="grow">
              <div className="t mono">
                #{fmtNum(b.height)} — {b.txCount} txs
              </div>
              <div className="m tiny mono">
                {b.hash.slice(0, 18)}… · {b.proposer}
              </div>
            </div>
            <span className="chip green">finalized</span>
            <span className="tiny" style={{ color: 'var(--txt-3)', marginLeft: 8 }}>
              {timeAgo(b.time)}
            </span>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Validators</h2>
          <span className="sub">
            {validators.length} active · {bonded || '0'} bonded
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Moniker</th>
              <th>Status</th>
              <th>Tokens</th>
              <th>Commission</th>
            </tr>
          </thead>
          <tbody>
            {validators.map((v, i) => (
              <tr key={v.operatorAddress || `${v.moniker}-${i}`}>
                <td>
                  <b>{v.moniker}</b>
                  <div className="tiny mono">{v.consensusAddress}</div>
                </td>
                <td>
                  {v.jailed ? (
                    <span className="chip red">jailed</span>
                  ) : (
                    <span className="chip green">{v.status}</span>
                  )}
                </td>
                <td className="num">{v.tokens}</td>
                <td className="num">{v.commission}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================================
// VALIDATOR — /api/admin/validators/applications (category:validator)
// ============================================================================

function ValidatorAdmin() {
  const [apps, setApps] = useState<AdminValidatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = async (status = 'pending') => {
    setLoading(true);
    const r = await adminApi.listValidatorApplications(status);
    if (r.ok && r.data) setApps(r.data.applications);
    setLoading(false);
  };

  useEffect(() => {
    void load('pending');
  }, []);

  const review = async (id: string, action: 'approved' | 'rejected') => {
    setReviewing(id);
    const r = await adminApi.reviewValidatorApplication(id, action, reviewNotes[id]?.trim() || undefined);
    setReviewing(null);
    if (r.ok) {
      toast(`Application ${action}`);
      setReviewNotes((m) => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
      void load('pending');
    } else {
      toast(r.error || `Failed to ${action}`, false);
    }
  };

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Pending validator applications</h2>
        <span className="sub">{apps.length} pending · x/staking sign-up queue</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void load('pending')}>
          Refresh
        </button>
      </div>
      {!loading && apps.length === 0 && (
        <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
          No pending applications.
        </div>
      )}
      {apps.map((a) => (
        <div key={a._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="t mono">{a.moniker}</div>
              <div className="m tiny mono">
                {a.applicantAddress} → {a.validatorAddress}
              </div>
            </div>
            <span className="chip gold">pending</span>
          </div>
          <textarea
            className="input mt"
            rows={2}
            placeholder="Review notes (optional)…"
            value={reviewNotes[a._id] ?? ''}
            onChange={(e) =>
              setReviewNotes((m) => ({ ...m, [a._id]: e.target.value }))
            }
            style={{ marginTop: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void review(a._id, 'approved')}
              disabled={reviewing === a._id}
            >
              Approve
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => void review(a._id, 'rejected')}
              disabled={reviewing === a._id}
            >
              Reject
            </button>
            <span className="tiny" style={{ color: 'var(--txt-3)', alignSelf: 'center' }}>
              submitted {timeAgo(a.submittedAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KYC — /api/admin/kyc/* and /api/admin/aml-reviews/* (category:kyc)
// ============================================================================

function KycAdmin() {
  const [tab, setTab] = useState<'kyc' | 'aml'>('kyc');
  const [kyc, setKyc] = useState<AdminKycSubmission[]>([]);
  const [aml, setAml] = useState<AdminAmlReview[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Backend (/api/admin/kyc/:id/review) refuses approval/rejection without a
  // screenshotRef that was uploaded by *this* admin. Pick a file per row,
  // upload on click, then send the returned documentRef with the decision.
  const [screenshots, setScreenshots] = useState<Record<string, File | undefined>>({});

  const load = async () => {
    const [k, a] = await Promise.all([
      adminApi.listPendingKyc(),
      adminApi.listPendingAmlReviews(),
    ]);
    if (k.ok && k.data) setKyc(k.data.submissions);
    if (a.ok && a.data) setAml(a.data.reviews);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, []);

  const reviewKyc = async (id: string, action: 'approved' | 'rejected') => {
    const file = screenshots[id];
    if (!file) {
      toast('Attach a review screenshot before deciding', false);
      return;
    }
    setBusy(id);
    const up = await adminApi.uploadAdminProof(file);
    if (!up.ok || !up.data?.documentRef) {
      setBusy(null);
      toast(up.error || 'Screenshot upload failed', false);
      return;
    }
    const r = await adminApi.reviewKyc(id, action, up.data.documentRef, notes[id]?.trim() || undefined);
    setBusy(null);
    if (r.ok) {
      toast(`KYC ${action}`);
      setNotes((m) => {
        const { [id]: _n, ...rest } = m;
        return rest;
      });
      setScreenshots((m) => {
        const { [id]: _f, ...rest } = m;
        return rest;
      });
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const reviewAml = async (id: string, action: 'approved' | 'rejected') => {
    setBusy(id);
    const r = await adminApi.reviewAmlSubmission(id, action, notes[id]?.trim() || undefined);
    setBusy(null);
    if (r.ok) {
      toast(`AML ${action}`);
      setNotes((m) => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${tab === 'kyc' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('kyc')}
        >
          KYC submissions ({kyc.length})
        </button>
        <button
          className={`btn btn-sm ${tab === 'aml' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('aml')}
        >
          AML reviews ({aml.length})
        </button>
      </div>

      {tab === 'kyc' ? (
        <div className="card">
          <div className="sec-title">
            <h2>KYC submissions</h2>
            <span className="sub">{kyc.length} pending · every 30s</span>
          </div>
          {!kyc.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending submissions.</div>}
          {kyc.map((k) => (
            <div key={k._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="t">{k.firstName} {k.lastName}</div>
                  <div className="m tiny mono">
                    {k.idType} · {k.idNumber}
                  </div>
                </div>
                <span className={`chip ${k.riskLevel === 'high' ? 'red' : k.riskLevel === 'medium' ? 'gold' : 'green'}`}>
                  risk: {k.riskLevel}
                </span>
              </div>
              {k.idDocumentUrl && (
                <div className="tiny mono" style={{ marginTop: 4, color: 'var(--txt-3)' }}>
                  doc: <a href={k.idDocumentUrl} target="_blank" rel="noreferrer">{k.idDocumentUrl.slice(0, 50)}…</a>
                </div>
              )}
              <textarea
                className="input mt"
                rows={2}
                placeholder="Review notes (optional)…"
                value={notes[k._id] ?? ''}
                onChange={(e) => setNotes((m) => ({ ...m, [k._id]: e.target.value }))}
              />
              <label
                className="input mt"
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px' }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ fontSize: 12 }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setScreenshots((m) => ({ ...m, [k._id]: f }));
                  }}
                />
                <span className="tiny" style={{ color: 'var(--txt-3)' }}>
                  {screenshots[k._id]
                    ? `✓ ${screenshots[k._id]!.name}`
                    : 'Review screenshot (PNG/JPG) — required to approve or reject'}
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void reviewKyc(k._id, 'approved')}
                  disabled={busy === k._id}
                >
                  Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => void reviewKyc(k._id, 'rejected')}
                  disabled={busy === k._id}
                >
                  Reject
                </button>
                <span className="tiny" style={{ color: 'var(--txt-3)', alignSelf: 'center' }}>
                  submitted {timeAgo(k.submittedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="sec-title">
            <h2>AML reviews</h2>
            <span className="sub">{aml.length} pending</span>
          </div>
          {!aml.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending AML reviews.</div>}
          {aml.map((r) => (
            <div key={r._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div>
                <div className="t mono">{r.walletAddress}</div>
                <div className="m tiny">
                  Triggered at {formatKes(r.triggerAmountKes)} · source: {r.fundsSource}
                </div>
                <div className="m tiny" style={{ marginTop: 4 }}>{r.narrative}</div>
                {r.documentRef && (
                  <div className="tiny mono" style={{ color: 'var(--txt-3)', marginTop: 4 }}>
                    ref: {r.documentRef}
                  </div>
                )}
              </div>
              <textarea
                className="input mt"
                rows={2}
                placeholder="Review notes (optional)…"
                value={notes[r._id] ?? ''}
                onChange={(e) => setNotes((m) => ({ ...m, [r._id]: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void reviewAml(r._id, 'approved')}
                  disabled={busy === r._id}
                >
                  Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => void reviewAml(r._id, 'rejected')}
                  disabled={busy === r._id}
                >
                  Reject
                </button>
                <span className="tiny" style={{ color: 'var(--txt-3)', alignSelf: 'center' }}>
                  submitted {timeAgo(r.submittedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// MINING — /api/admin/mining/* and /api/admin/badges/* (category:mining)
// ============================================================================

function MiningAdmin() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [subs, setSubs] = useState<AdminSubmission[]>([]);
  const [purchases, setPurchases] = useState<AdminBadgePurchase[]>([]);
  const [issuances, setIssuances] = useState<AdminBadgeIssuance[]>([]);
  // approveSubmission / rejectSubmission now require a screenshotRef uploaded
  // through /api/admin/proof by *this* admin — without it the backend 400s.
  const [decisionShots, setDecisionShots] = useState<Record<string, File | undefined>>({});
  const [busySub, setBusySub] = useState<string | null>(null);

  const load = async () => {
    const [c, s, p, i] = await Promise.all([
      adminApi.listMiningCampaigns('active'),
      adminApi.listPendingSubmissions(),
      adminApi.listBadgePurchases('awaiting_admin'),
      adminApi.listBadgeIssuances(),
    ]);
    if (c.ok && c.data) setCampaigns(c.data.campaigns);
    if (s.ok && s.data) setSubs(s.data.submissions);
    if (p.ok && p.data) setPurchases(p.data.purchases);
    if (i.ok && i.data) setIssuances(i.data.issuances);
  };

  useEffect(() => {
    void load();
  }, []);

  const approveSub = async (id: string) => {
    const file = decisionShots[id];
    if (!file) {
      toast('Attach an approval screenshot first', false);
      return;
    }
    setBusySub(id);
    const up = await adminApi.uploadAdminProof(file);
    if (!up.ok || !up.data?.documentRef) {
      setBusySub(null);
      toast(up.error || 'Screenshot upload failed', false);
      return;
    }
    const r = await adminApi.approveSubmission(id, up.data.documentRef);
    setBusySub(null);
    if (r.ok) {
      toast('Submission approved');
      setDecisionShots((m) => {
        const { [id]: _f, ...rest } = m;
        return rest;
      });
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const rejectSub = async (id: string) => {
    const file = decisionShots[id];
    if (!file) {
      toast('Attach a rejection screenshot first', false);
      return;
    }
    setBusySub(id);
    const up = await adminApi.uploadAdminProof(file);
    if (!up.ok || !up.data?.documentRef) {
      setBusySub(null);
      toast(up.error || 'Screenshot upload failed', false);
      return;
    }
    const r = await adminApi.rejectSubmission(id, up.data.documentRef, 'Rejected by category admin');
    setBusySub(null);
    if (r.ok) {
      toast('Submission rejected');
      setDecisionShots((m) => {
        const { [id]: _f, ...rest } = m;
        return rest;
      });
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const approveBadge = async (p: AdminBadgePurchase) => {
    if (!p.walletAddress) {
      toast('No wallet address on this purchase', false);
      return;
    }
    const r = await adminApi.approveBadge(p.quoteId, p.walletAddress);
    if (r.ok) {
      toast('Badge issued');
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const rejectBadge = async (p: AdminBadgePurchase) => {
    const reason = window.prompt('Reason for rejection?') || '';
    if (!reason.trim()) return;
    const r = await adminApi.rejectBadge(p.quoteId, reason);
    if (r.ok) {
      toast('Badge purchase rejected');
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  return (
    <>
      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Active campaigns</div>
          <div className="card-value">{campaigns.length}</div>
          <div className="card-sub">live mining bounties</div>
        </div>
        <div className="card">
          <div className="card-label">Pending submissions</div>
          <div className="card-value">{subs.length}</div>
          <div className="card-sub">awaiting approval</div>
        </div>
        <div className="card">
          <div className="card-label">Badges to issue</div>
          <div className="card-value">{purchases.length}</div>
          <div className="card-sub">M-Pesa confirmed</div>
        </div>
        <div className="card">
          <div className="card-label">Issuances (total)</div>
          <div className="card-value">{issuances.length}</div>
          <div className="card-sub">streak + purchase + manual</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Pending submissions</h2>
          <span className="sub">{subs.length} awaiting review</span>
        </div>
        {!subs.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending submissions.</div>}
        {subs.map((s) => (
          <div key={s._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="t">{s.title || 'Submission'}</div>
                <div className="m tiny">{s.description}</div>
                {s.proof_url && (
                  <div className="tiny mono" style={{ marginTop: 4 }}>
                    <a href={s.proof_url.startsWith('http') ? s.proof_url : `/api/mines/proof/${encodeURIComponent(s.proof_url)}`} target="_blank" rel="noreferrer">proof</a>
                  </div>
                )}
              </div>
              <span className="chip gold">pending</span>
            </div>
            <label
              className="input mt"
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px' }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg"
                style={{ fontSize: 12 }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setDecisionShots((m) => ({ ...m, [s._id]: f }));
                }}
              />
              <span className="tiny" style={{ color: 'var(--txt-3)' }}>
                {decisionShots[s._id]
                  ? `✓ ${decisionShots[s._id]!.name}`
                  : 'Decision screenshot (PNG/JPG) — required to approve or reject'}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => void approveSub(s._id)} disabled={busySub === s._id}>
                Approve
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void rejectSub(s._id)} disabled={busySub === s._id}>
                Reject
              </button>
              <span className="tiny" style={{ color: 'var(--txt-3)', alignSelf: 'center' }}>
                submitted {timeAgo(s.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Badge purchases awaiting issuance</h2>
          <span className="sub">{purchases.length} M-Pesa confirmed</span>
        </div>
        {!purchases.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No badges to issue right now.</div>}
        {purchases.map((p) => (
          <div key={p._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="t mono">{p.walletAddress || '—'}</div>
                <div className="m tiny">
                  {p.fiatAmount} {p.currency} · {p.phone}
                  {p.mpesaRef && ` · ref ${p.mpesaRef}`}
                </div>
              </div>
              <span className="chip gold">awaiting admin</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void approveBadge(p)}
                disabled={!p.walletAddress}
              >
                Issue badge
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void rejectBadge(p)}>
                Reject
              </button>
              <span className="tiny" style={{ color: 'var(--txt-3)', alignSelf: 'center' }}>
                {timeAgo(p.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Active campaigns</h2>
          <span className="sub">{campaigns.length} running</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Title</th>
              <th>Rate per task</th>
              <th>Budget remaining</th>
              <th>Completions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td><b>{c.title}</b></td>
                <td className="num">{c.rate_per_task}</td>
                <td className="num">{c.budget_remaining}</td>
                <td className="num">{c.completions_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================================
// TREASURY — /api/admin/treasury/* + /api/admin/withdrawals + /api/admin/structuring-flags
// (category:treasury)
// ============================================================================

function TreasuryAdmin() {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRequest[]>([]);
  const [ledger, setLedger] = useState<TreasuryLedgerEntry[]>([]);
  const [metrics, setMetrics] = useState<TreasuryMetricTotal[]>([]);
  const [policies, setPolicies] = useState<BurnPolicyEntry[]>([]);
  const [flags, setFlags] = useState<AdminStructuringFlag[]>([]);

  const load = async () => {
    const [w, l, m, p, f] = await Promise.all([
      adminApi.listWithdrawals('pending_review'),
      adminApi.getTreasuryLedger({ limit: 20 }),
      adminApi.getTreasuryMetrics(),
      adminApi.listBurnPolicies(),
      adminApi.listStructuringFlags(false),
    ]);
    if (w.ok && w.data) setWithdrawals(w.data.withdrawals);
    if (l.ok && l.data) setLedger(l.data.entries);
    if (m.ok && m.data) setMetrics(m.data.totals);
    if (p.ok && p.data) setPolicies(p.data.policies);
    if (f.ok && f.data) setFlags(f.data.flags);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20000);
    return () => clearInterval(id);
  }, []);

  const retry = async (id: string) => {
    const r = await adminApi.retryWithdrawal(id);
    if (r.ok) {
      toast('Retry queued');
      void load();
    } else {
      toast(r.error || 'Retry failed', false);
    }
  };

  const acknowledgeFlag = async (id: string) => {
    const r = await adminApi.acknowledgeStructuringFlag(id);
    if (r.ok) {
      toast('Flag acknowledged');
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const totalInflow = useMemo(
    () =>
      metrics.filter((m) => m.direction === 'inflow').reduce((acc, m) => acc + Number(m.totalAmount || 0), 0),
    [metrics]
  );
  const totalOutflow = useMemo(
    () =>
      metrics
        .filter((m) => m.direction === 'outflow')
        .reduce((acc, m) => acc + Number(m.totalAmount || 0), 0),
    [metrics]
  );

  return (
    <>
      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Pending withdrawals</div>
          <div className="card-value">{withdrawals.length}</div>
          <div className="card-sub">awaiting payout or retry</div>
        </div>
        <div className="card">
          <div className="card-label">Structuring flags</div>
          <div className="card-value">{flags.length}</div>
          <div className="card-sub">unacknowledged AML alerts</div>
        </div>
        <div className="card">
          <div className="card-label">Inflow total</div>
          <div className="card-value">{formatKes(totalInflow)}</div>
          <div className="card-sub">cash-out inflows</div>
        </div>
        <div className="card">
          <div className="card-label">Outflow total</div>
          <div className="card-value">{formatKes(totalOutflow)}</div>
          <div className="card-sub">rewards + payouts</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Pending withdrawals</h2>
          <span className="sub">{withdrawals.length} pending review</span>
        </div>
        {!withdrawals.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending withdrawals.</div>}
        <table className="tbl">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w._id}>
                <td>
                  <div className="t mono">{w.walletAddress}</div>
                  <div className="tiny mono">{w.phone}</div>
                </td>
                <td className="num">{w.amountMlcns} MLCNS · {formatKes(w.amountKes)}</td>
                <td>{w.currency || 'KES'}</td>
                <td>
                  <span className="chip gold">{w.status}</span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => void retry(w._id)}>
                    Retry payout
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Structuring flags</h2>
          <span className="sub">{flags.length} unacknowledged</span>
        </div>
        {!flags.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No active flags.</div>}
        {flags.map((f) => (
          <div key={f._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="t mono">{f.walletAddress}</div>
                <div className="m tiny">
                  {formatKes(f.cumulativeKes)} in window · {f.relatedWithdrawalIds.length} withdrawals
                </div>
                <div className="tiny" style={{ color: 'var(--txt-3)' }}>
                  {new Date(f.windowStartAt).toLocaleString()} → {new Date(f.windowEndAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => void acknowledgeFlag(f._id)}>
                Acknowledge
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Burn policies</h2>
          <span className="sub">{policies.length} configured</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Burn %</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p._id}>
                <td>{p.activity}</td>
                <td className="num">{p.burnPercentage}%</td>
                <td>
                  {p.enabled ? (
                    <span className="chip green">on</span>
                  ) : (
                    <span className="chip">off</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Treasury ledger</h2>
          <span className="sub">latest 20 entries</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l._id}>
                <td>{l.activity}</td>
                <td>
                  <span className={`chip ${l.direction === 'inflow' ? 'green' : l.direction === 'outflow' ? 'red' : 'gold'}`}>
                    {l.direction}
                  </span>
                </td>
                <td className="num">{l.amount}</td>
                <td className="tiny">{timeAgo(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================================
// MARKETPLACE — scoped placeholder. The marketplace routes (escrow/listings)
// live on /api/marketplace which is user-facing, not admin-gated. From the
// admin panel we surface what this category is meant to watch over: deals
// in flight, escrow state, dispute queues. For now we offer admins a
// read-only window into the treasury ledger (which captures marketplace
// burns) and a clear note about its scope.
// ============================================================================

function MarketplaceAdmin() {
  const [ledger, setLedger] = useState<TreasuryLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    const r = await adminApi.getTreasuryLedger({ activity: 'burn', limit: 30 });
    if (r.ok && r.data) {
      setLedger(r.data.entries);
    } else {
      setError(r.error || 'Failed to load burn ledger');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="card">
        <div className="sec-title">
          <h2>Marketplace category</h2>
          <span className="sub">burn events tied to marketplace purchases</span>
        </div>
        <p className="tiny" style={{ color: 'var(--txt-3)' }}>
          This admin window watches the marketplace. End-user listing flows run on{' '}
          <code>/api/marketplace</code> and don't surface here. The treasury ledger
          captures every marketplace burn — that's the canonical signal this admin
          needs to act on.
        </p>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Marketplace burns</h2>
          <span className="sub">{loading ? 'loading…' : error ? 'unavailable' : `${ledger.length} entries`}</span>
        </div>
        {error && (
          <div style={{ color: 'var(--danger, #FF7A70)', padding: 20 }}>
            {error}
          </div>
        )}
        {!error && !loading && !ledger.length && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No burn events recorded.</div>
        )}
        {!error && ledger.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l._id}>
                <td>{l.activity}</td>
                <td>
                  <span className="chip gold">{l.direction}</span>
                </td>
                <td className="num">{l.amount}</td>
                <td className="tiny">{timeAgo(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </>
  );
}

// ============================================================================
// MLPTS & LIQUIDITY — uses /api/admin/liquidity/activity (admin-gated) +
// /api/admin/treasury/metrics so a category admin only has the MLPTS lens.
// ============================================================================

function MlptsAdmin() {
  const [items, setItems] = useState<LiquidityActivityItem[]>([]);
  const [metrics, setMetrics] = useState<TreasuryMetricTotal[]>([]);

  const load = async () => {
    const [l, m] = await Promise.all([
      adminApi.listLiquidityActivity({ limit: 25 }),
      adminApi.getTreasuryMetrics(),
    ]);
    if (l.ok && l.data) setItems(l.data.items);
    if (m.ok && m.data) setMetrics(m.data.totals);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, []);

  const mallpointsConversion = useMemo(
    () =>
      metrics
        .filter((m) => m.activity === 'mallpoints_convert')
        .reduce((acc, m) => acc + Number(m.totalAmount || 0), 0),
    [metrics]
  );

  return (
    <>
      <div className="stat-grid">
        <div className="card">
          <div className="card-label">MLPTS converted (all-time)</div>
          <div className="card-value">{formatKes(mallpointsConversion)}</div>
          <div className="card-sub">sum of mallpoints_convert activity</div>
        </div>
        <div className="card">
          <div className="card-label">Recent liquidity events</div>
          <div className="card-value">{items.length}</div>
          <div className="card-sub">refresh every 30s</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Liquidity activity</h2>
          <span className="sub">latest 25 entries · admin-only</span>
        </div>
        {!items.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No liquidity events yet.</div>}
        <table className="tbl">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Stage</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Wallet</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i._id}>
                <td>{i.flow}</td>
                <td>{i.stage}</td>
                <td>
                  <span
                    className={`chip ${i.status === 'success' ? 'green' : i.status === 'failed' ? 'red' : 'gold'}`}
                  >
                    {i.status}
                  </span>
                </td>
                <td className="num">
                  {i.amountMlcns ? `${i.amountMlcns} MLCNS` : i.fiatAmount ? formatKes(i.fiatAmount) : '—'}
                </td>
                <td className="tiny mono">{i.walletAddress ? `${i.walletAddress.slice(0, 10)}…` : '—'}</td>
                <td className="tiny">{timeAgo(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Suppress unused-imports lint hints for types referenced only in JSDoc.
export type _CategoryTypeRefs =
  | AdminDashboardStats
  | AdminUser
  | AdminValidatorApplication
  | AdminKycSubmission
  | AdminAmlReview
  | AdminStructuringFlag
  | AdminCampaign
  | AdminSubmission
  | AdminBadgePurchase
  | AdminBadgeIssuance
  | BurnPolicyEntry
  | DynamicBurnThresholdEntry
  | LiquidityActivityItem;
