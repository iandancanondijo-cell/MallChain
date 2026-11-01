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
  AdminKycUserDetail,
  AdminReviewedAml,
  AdminReviewedKyc,
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
  GovernanceStats,
  LiquidityActivityItem,
  TreasuryLedgerEntry,
  TreasuryMetricTotal,
} from '../../../services/adminApi';
import { fmtNum, Modal, toast } from '../../../components/ui';
import { store } from '../../../store/store';
import { config } from '../../../services/config';
import { AdminErrorBanner, collectErrors, amlAmountLabel, displayPii } from '../adminShared';
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

function formatCommission(rate: string): string {
  const r = parseFloat(rate);
  if (isNaN(r)) return rate || '—';
  const pct = r * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

function statusLabel(status: string): string {
  const s = status.replace(/^BOND_STATUS_/, '');
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function formatTokens(t: string): string {
  const n = Number(t);
  if (!Number.isFinite(n)) return t || '—';
  return n.toLocaleString();
}

/** A populated `userId` comes back as an object, but old rows / unfilled
 *  refs are plain strings — normalize to a display email + raw id. */
function identityOf(ref: { _id: string; email: string; username: string | null } | string | null | undefined): { email: string; id: string | null } {
  if (!ref) return { email: '—', id: null };
  if (typeof ref === 'string') return { email: displayPii(ref), id: ref };
  return { email: displayPii(ref.email || ref._id) || '—', id: ref._id || null };
}

/** Why the review screenshot is mandatory — surfaced inline so admins
 *  understand the compliance flow instead of treating it as UI friction. */
const SCREENSHOT_WHY = 'Audit compliance: your decision must be backed by a capture of the evidence you reviewed. Without it a review is your word against the record and fails a compliance audit — the backend rejects approve/reject without it. Stored with your admin id and retrievable only by admins.';

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
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

  const load = async (q?: string) => {
    setLoading(true);
    const r = await adminApi.listUsers(q ? { search: q } : undefined);
    if (r.ok && r.data) {
      setUsers(r.data.users);
      setTotal(r.data.total);
    } else {
      toast(r.error || 'Failed to load users', false);
    }
    setErrors(collectErrors([['user list', r]]));
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
      <AdminErrorBanner errors={errors} />

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
  // /api/admin/governance/stats is requireCategory('blockchain') — works for
  // the blockchain category admin. /api/admin/dashboard was superadmin-only,
  // so category admins saw '—' here permanently.
  const [governance, setGovernance] = useState<GovernanceStats | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, b, v, g] = await Promise.all([
      adminApi.getChainStatus(),
      adminApi.getChainBlocks(8),
      adminApi.getChainValidators(),
      adminApi.getGovernanceStats(),
    ]);
    if (s.ok && s.data) setStatus(s.data.status);
    if (b.ok && b.data) setBlocks(b.data.blocks);
    if (v.ok && v.data) {
      setValidators(v.data.validators);
      setBonded(v.data.bondedTokens);
    }
    if (g.ok && g.data) setGovernance(g.data.stats);
    setErrors(collectErrors([
      ['chain status', s],
      ['recent blocks', b],
      ['validators', v],
      ['governance stats', g],
    ]));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <AdminErrorBanner errors={errors} />

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Block Height</div>
          <div className="card-value">{status ? status.blockHeight.toLocaleString() : '—'}</div>
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
          <div className="card-sub">{bonded ? formatTokens(bonded) : '—'} stake bonded</div>
        </div>
        <div className="card">
          <div className="card-label">Governance Proposals</div>
          <div className="card-value">
            {governance ? governance.voting : '—'}
          </div>
          <div className="card-sub">
            {governance ? `${governance.voting} voting · ${governance.passed} passed · ${governance.rejected} rejected` : 'x/gov proposals open'}
          </div>
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
                #{b.height.toLocaleString()} — {b.txCount} txs
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
            {validators.length} active · {bonded ? `${formatTokens(bonded)} stake` : '0'} bonded
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
                    <span className="chip green">{statusLabel(v.status)}</span>
                  )}
                </td>
                <td className="num">{formatTokens(v.tokens)}</td>
                <td className="num">{formatCommission(v.commission)}</td>
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
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = async (status = statusFilter) => {
    setLoading(true);
    const r = await adminApi.listValidatorApplications(status);
    if (r.ok && r.data) setApps(r.data.applications);
    setErrors(collectErrors([[`validator applications (${status})`, r]]));
    setLoading(false);
  };

  useEffect(() => {
    void load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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
      <AdminErrorBanner errors={errors} />
      <div className="sec-title">
        <h2>{statusFilter === 'pending' ? 'Pending validator applications' : `${statusFilter} validator applications`}</h2>
        <span className="sub">{apps.length} shown · x/staking sign-up queue</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => void load(statusFilter)}>
          Refresh
        </button>
      </div>
      {!loading && apps.length === 0 && (
        <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
          No {statusFilter} applications.
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
// KYC — /api/admin/kyc/*, /api/admin/aml-reviews/*, /api/admin/structuring-flags
// (categories: kyc; structuring flags are shared with treasury)
//
// The full compliance flow lives here: pending KYC submissions → pending AML
// reviews → decision history (Reviewed tab) → structuring flags (same
// section the treasury window shows, so AML admins see the whole picture).
// ============================================================================

function KycAdmin() {
  const [tab, setTab] = useState<'kyc' | 'aml' | 'reviewed' | 'flags'>('kyc');
  const [kyc, setKyc] = useState<AdminKycSubmission[]>([]);
  const [aml, setAml] = useState<AdminAmlReview[]>([]);
  const [reviewedKyc, setReviewedKyc] = useState<AdminReviewedKyc[]>([]);
  const [reviewedAml, setReviewedAml] = useState<AdminReviewedAml[]>([]);
  const [reviewedPage, setReviewedPage] = useState(0);
  const [reviewedTotal, setReviewedTotal] = useState({ kyc: 0, aml: 0 });
  const [flags, setFlags] = useState<AdminStructuringFlag[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<Record<string, AdminKycUserDetail | 'loading' | 'error'>>({});
  // Backend (/api/admin/kyc/:id/review) refuses approval/rejection without a
  // screenshotRef that was uploaded by *this* admin. Pick a file per row,
  // upload on click, then send the returned documentRef with the decision.
  const [screenshots, setScreenshots] = useState<Record<string, File | undefined>>({});

  const load = async (page = 0) => {
    const [k, a, rk, ra, f] = await Promise.all([
      adminApi.listPendingKyc(),
      adminApi.listPendingAmlReviews(),
      adminApi.listReviewedKyc({ page, limit: 25 }),
      adminApi.listReviewedAml({ page, limit: 25 }),
      adminApi.listStructuringFlags(false),
    ]);
    if (k.ok && k.data) setKyc(k.data.submissions);
    if (a.ok && a.data) setAml(a.data.reviews);
    if (rk.ok && rk.data) {
      setReviewedKyc((prev) => (page === 0 ? rk.data!.submissions : [...prev, ...rk.data!.submissions]));
      setReviewedTotal((t) => ({ ...t, kyc: rk.data!.total }));
    }
    if (ra.ok && ra.data) {
      setReviewedAml((prev) => (page === 0 ? ra.data!.reviews : [...prev, ...ra.data!.reviews]));
      setReviewedTotal((t) => ({ ...t, aml: ra.data!.total }));
    }
    if (f.ok && f.data) setFlags(f.data.flags);
    setReviewedPage(page);
    setErrors(collectErrors([
      ['pending KYC submissions', k],
      ['pending AML reviews', a],
      ['reviewed KYC decisions', rk],
      ['reviewed AML decisions', ra],
      ['structuring flags', f],
    ]));
  };

  useEffect(() => {
    void load(0);
    const id = setInterval(() => void load(0), 30000);
    return () => clearInterval(id);
  }, []);

  const toggleUserDetail = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (userDetail[userId] && userDetail[userId] !== 'error') return;
    setUserDetail((m) => ({ ...m, [userId]: 'loading' }));
    const r = await adminApi.getKycUserDetail(userId);
    if (r.ok && r.data) {
      setUserDetail((m) => ({ ...m, [userId]: r.data! }));
    } else {
      toast(r.error || 'Failed to load user detail', false);
      setUserDetail((m) => ({ ...m, [userId]: 'error' }));
    }
  };

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
      void load(0);
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
      void load(0);
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const acknowledgeFlag = async (id: string) => {
    const r = await adminApi.acknowledgeStructuringFlag(id);
    if (r.ok) {
      toast('Flag acknowledged');
      void load(0);
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const docUrl = (kycId: string, side: 'front' | 'back' | 'document') =>
    `${config.apiBaseUrl}/api/kyc/document/${encodeURIComponent(kycId)}?side=${side}`;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['kyc', `KYC submissions (${kyc.length})`],
          ['aml', `AML reviews (${aml.length})`],
          ['reviewed', `Reviewed (${reviewedKyc.length + reviewedAml.length}/${reviewedTotal.kyc + reviewedTotal.aml})`],
          ['flags', `Structuring flags (${flags.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <AdminErrorBanner errors={errors} />

      {tab === 'kyc' && (
        <div className="card">
          <div className="sec-title">
            <h2>KYC submissions</h2>
            <span className="sub">{kyc.length} pending · every 30s</span>
          </div>
          {!kyc.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending submissions.</div>}
          {kyc.map((k) => {
            const who = identityOf(k.userId);
            return (
            <div key={k._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="t">{k.firstName} {k.lastName}</div>
                  <div className="m tiny">
                    applicant: {who.email}{' '}
                    {who.id && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: 6, padding: '2px 8px' }}
                        onClick={() => void toggleUserDetail(who.id!)}
                        title="Account status, KYC history and AML count for this user"
                      >
                        {expandedUser === who.id ? 'Hide user detail' : 'User detail'}
                      </button>
                    )}
                  </div>
                  <div className="m tiny mono">
                    {k.idType} · {k.idNumber}
                  </div>
                </div>
                <span className={`chip ${k.riskLevel === 'high' ? 'red' : k.riskLevel === 'medium' ? 'gold' : 'green'}`}>
                  risk: {k.riskLevel}
                </span>
              </div>

              {who.id && expandedUser === who.id && (
                <div className="card" style={{ padding: 12, marginTop: 8, background: 'rgba(255,255,255,0.03)' }}>
                  {userDetail[who.id] === 'loading' && <span className="tiny">loading…</span>}
                  {userDetail[who.id] === 'error' && <span className="tiny" style={{ color: 'var(--danger, #FF7A70)' }}>Couldn't load this user.</span>}
                  {userDetail[who.id] && userDetail[who.id] !== 'loading' && userDetail[who.id] !== 'error' && (
                    <div className="tiny" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                      <div><b>Account</b><div>{(userDetail[who.id] as AdminKycUserDetail).user.email}</div></div>
                      <div><b>Status</b><div>{(userDetail[who.id] as AdminKycUserDetail).user.banned ? 'banned' : 'active'} · joined {new Date((userDetail[who.id] as AdminKycUserDetail).user.createdAt).toLocaleDateString()}</div></div>
                      <div><b>KYC level</b><div>{(userDetail[who.id] as AdminKycUserDetail).user.kycLevel} · {(userDetail[who.id] as AdminKycUserDetail).kyc.total} submission(s)</div></div>
                      <div><b>AML reviews</b><div>{(userDetail[who.id] as AdminKycUserDetail).aml.total} total · {(userDetail[who.id] as AdminKycUserDetail).aml.pending} pending</div></div>
                    </div>
                  )}
                </div>
              )}

              <div className="tiny mono" style={{ marginTop: 4, color: 'var(--txt-3)' }}>
                ID documents:{' '}
                <a href={docUrl(k._id, 'front')} target="_blank" rel="noreferrer">view front</a>
                {' · '}
                <a href={docUrl(k._id, 'back')} target="_blank" rel="noreferrer">view back</a>
                {' · '}
                <a href={docUrl(k._id, 'document')} target="_blank" rel="noreferrer">legacy single doc</a>
                <span style={{ marginLeft: 8, color: 'var(--txt-3)' }}>(served by /api/kyc/document — access is audited)</span>
              </div>
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
                title={SCREENSHOT_WHY}
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
                  <div className="tiny" style={{ marginTop: 2 }}>
                    Why: {SCREENSHOT_WHY}
                  </div>
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
            );
          })}
        </div>
      )}

      {tab === 'aml' && (
        <div className="card">
          <div className="sec-title">
            <h2>AML reviews</h2>
            <span className="sub">{aml.length} pending · triggered by withdrawal cash-out checks</span>
          </div>
          {!aml.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No pending AML reviews.</div>}
          {aml.map((r) => {
            const who = identityOf(r.userId);
            return (
            <div key={r._id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div>
                <div className="t mono">{r.walletAddress}</div>
                <div className="m tiny">
                  user: {who.email} · triggered at {amlAmountLabel(r.triggerAmountKes)} · source: {r.fundsSource}
                </div>
                {!r.triggerAmountKes && (
                  <div className="tiny" style={{ color: 'var(--gold, #f3ba2f)' }}>
                    The client-supplied amount was not recorded on this submission — verify the real
                    withdrawal amount in the Treasury window before deciding.
                  </div>
                )}
                <div className="m tiny" style={{ marginTop: 4 }}>{r.narrative}</div>
                {r.documentRef && (
                  <div className="tiny mono" style={{ color: 'var(--txt-3)', marginTop: 4 }}>
                    ref: <a href={`${config.apiBaseUrl}/api/admin/proof/${encodeURIComponent(r.documentRef)}`} target="_blank" rel="noreferrer">{r.documentRef}</a>
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
            );
          })}
        </div>
      )}

      {tab === 'reviewed' && (
        <>
          <div className="card">
            <div className="sec-title">
              <h2>Reviewed KYC decisions</h2>
              <span className="sub">{reviewedKyc.length} of {reviewedTotal.kyc} shown — newest first</span>
            </div>
            {!reviewedKyc.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No KYC decisions recorded yet.</div>}
            <table className="tbl">
              <thead>
                <tr><th>Applicant</th><th>Name</th><th>Decision</th><th>Decided by</th><th>When</th><th>Proof</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {reviewedKyc.map((k) => {
                  const who = identityOf(k.userId);
                  const by = identityOf(k.reviewedBy);
                  return (
                    <tr key={k._id}>
                      <td className="tiny">{who.email}</td>
                      <td>{k.firstName} {k.lastName}</td>
                      <td>
                        <span className={`chip ${k.status === 'approved' ? 'green' : 'red'}`}>{k.status}</span>
                      </td>
                      <td className="tiny">{by.email}</td>
                      <td className="tiny">{k.reviewedAt ? new Date(k.reviewedAt).toLocaleString() : '—'}</td>
                      <td className="tiny">
                        {k.reviewedScreenshotRef ? (
                          <a href={`${config.apiBaseUrl}/api/admin/proof/${encodeURIComponent(k.reviewedScreenshotRef)}`} target="_blank" rel="noreferrer">screenshot</a>
                        ) : '—'}
                      </td>
                      <td className="tiny" style={{ maxWidth: 220 }}>{k.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card mt">
            <div className="sec-title">
              <h2>Reviewed AML decisions</h2>
              <span className="sub">{reviewedAml.length} of {reviewedTotal.aml} shown</span>
            </div>
            {!reviewedAml.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No AML decisions recorded yet.</div>}
            <table className="tbl">
              <thead>
                <tr><th>User</th><th>Wallet</th><th>Amount</th><th>Decision</th><th>Decided by</th><th>When</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {reviewedAml.map((r) => {
                  const who = identityOf(r.userId);
                  const by = identityOf(r.reviewedBy);
                  return (
                    <tr key={r._id}>
                      <td className="tiny">{who.email}</td>
                      <td className="tiny mono">{r.walletAddress ? `${r.walletAddress.slice(0, 12)}…${r.walletAddress.slice(-6)}` : '—'}</td>
                      <td className="num tiny">{amlAmountLabel(r.triggerAmountKes)}</td>
                      <td>
                        <span className={`chip ${r.status === 'approved' ? 'green' : 'red'}`}>{r.status}</span>
                      </td>
                      <td className="tiny">{by.email}</td>
                      <td className="tiny">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : '—'}</td>
                      <td className="tiny" style={{ maxWidth: 220 }}>{r.reviewNotes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(reviewedKyc.length < reviewedTotal.kyc || reviewedAml.length < reviewedTotal.aml) && (
            <button className="btn btn-ghost btn-sm mt" onClick={() => void load(reviewedPage + 1)}>
              Load more decisions
            </button>
          )}
        </>
      )}

      {tab === 'flags' && (
        <div className="card">
          <div className="sec-title">
            <h2>Structuring flags</h2>
            <span className="sub">{flags.length} unacknowledged · also visible in the Treasury window</span>
          </div>
          <p className="tiny" style={{ color: 'var(--txt-3)', margin: '0 0 8px' }}>
            Raised automatically when one wallet's cumulative cash-outs exceed the structuring threshold
            inside a rolling window. Acknowledging here records the AML review; withdrawal-level detail
            lives in <a href="#/admin?cat=treasury">the Treasury window</a>.
          </p>
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
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

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
    setErrors(collectErrors([
      ['mining campaigns', c],
      ['pending submissions', s],
      ['badge purchases', p],
      ['badge issuances', i],
    ]));
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
      <AdminErrorBanner errors={errors} />

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
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

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
    setErrors(collectErrors([
      ['pending withdrawals', w],
      ['treasury ledger', l],
      ['treasury metrics', m],
      ['burn policies', p],
      ['structuring flags', f],
    ]));
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
      <AdminErrorBanner errors={errors} />

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
          <span className="sub">{flags.length} unacknowledged · <a href="#/admin?cat=kyc">AML reviews live in the KYC window</a></span>
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
// MARKETPLACE — escrow state read live from the chain relay
// (/api/marketplace/escrow → x/marketplace on :1317) plus the treasury burn
// ledger. There is no separate admin-gated marketplace endpoint on the
// backend; the on-chain escrow query is the real record of deals in flight.
// Dispute/listing queues are not implemented in x/marketplace yet, so the
// panel says so honestly instead of showing blanks.
// ============================================================================

interface ChainEscrow {
  id?: string;
  escrowId?: string;
  buyer?: string;
  seller?: string;
  amount?: { denom?: string; amount?: string } | string;
  status?: string;
  state?: string;
  createdAt?: string;
  openedAt?: string;
}

function MarketplaceAdmin() {
  const [ledger, setLedger] = useState<TreasuryLedgerEntry[]>([]);
  const [escrows, setEscrows] = useState<ChainEscrow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [escrowError, setEscrowError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [r, e] = await Promise.all([
      adminApi.getTreasuryLedger({ activity: 'burn', limit: 30 }),
      adminApi.listMarketplaceEscrows(),
    ]);
    if (r.ok && r.data) {
      setLedger(r.data.entries);
    } else {
      setError(r.error || 'Failed to load burn ledger');
    }
    if (e.ok && e.data) {
      setEscrows((e.data.escrows || []) as ChainEscrow[]);
      setEscrowError(null);
    } else {
      setEscrows([]);
      setEscrowError(e.error || 'Escrow query unavailable (chain REST offline?)');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, []);

  const escrowCount = (s?: string) => (s || '').toLowerCase();

  return (
    <>
      <div className="card">
        <div className="sec-title">
          <h2>Marketplace category</h2>
          <span className="sub">escrow deals on-chain + burn events from marketplace purchases</span>
        </div>
        <p className="tiny" style={{ color: 'var(--txt-3)' }}>
          Deals settle through on-chain escrow (x/marketplace), surfaced live below. Listing creation
          and dispute transactions run on <code>/api/marketplace</code> user-side; this window is the
          admin read surface. Dispute/listing <em>queues</em> aren't implemented on-chain yet — no
          marketplace transaction data exists for them, so there is nothing to show there beyond an
          honest "coming soon".
        </p>
      </div>

      <div className="stat-grid mt">
        <div className="card">
          <div className="card-label">Escrows in flight</div>
          <div className="card-value">{escrows.filter((e) => !['released', 'refunded', 'closed', 'completed'].includes(escrowCount(e.status || e.state))).length}</div>
          <div className="card-sub">from x/marketplace chain query</div>
        </div>
        <div className="card">
          <div className="card-label">Escrows (total)</div>
          <div className="card-value">{escrows.length}</div>
          <div className="card-sub">all statuses on the chain</div>
        </div>
        <div className="card">
          <div className="card-label">Marketplace burns</div>
          <div className="card-value">{ledger.length}</div>
          <div className="card-sub">treasury ledger entries (latest 30)</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Escrow deals</h2>
          <span className="sub">{loading ? 'loading…' : escrowError ? 'unavailable' : `${escrows.length} on-chain`}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void load()}>Refresh</button>
        </div>
        {escrowError && (
          <div style={{ color: 'var(--danger, #FF7A70)', padding: '8px 0' }}>{escrowError}</div>
        )}
        {!escrowError && !escrows.length && !loading && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
            No escrow deals recorded yet — the marketplace opens an on-chain escrow for each purchase.
          </div>
        )}
        {escrows.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {escrows.slice(0, 50).map((e, i) => (
                <tr key={e.id || e.escrowId || i}>
                  <td className="tiny mono">{e.id || e.escrowId || '—'}</td>
                  <td className="tiny mono">{e.buyer ? `${e.buyer.slice(0, 12)}…${e.buyer.slice(-6)}` : '—'}</td>
                  <td className="tiny mono">{e.seller ? `${e.seller.slice(0, 12)}…${e.seller.slice(-6)}` : '—'}</td>
                  <td className="num tiny">
                    {typeof e.amount === 'object' && e.amount
                      ? `${e.amount.amount ?? '—'} ${e.amount.denom ?? ''}`
                      : (e.amount as string) || '—'}
                  </td>
                  <td>
                    <span className="chip gold">{e.status || e.state || 'unknown'}</span>
                  </td>
                  <td className="tiny">{(e.createdAt || e.openedAt) ? timeAgo(e.createdAt || e.openedAt!) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
            No burn events recorded yet — marketplace purchase burns land here once deals settle.
          </div>
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

// The backend LiquidityPoolActivity `flow` enum grows (mallpoints_purchase,
// reward, transfer, faucet, refund were added alongside the original
// buy/withdraw/reconciliation/mallpoints_convert). Keep a friendly label for
// every known flow, but never hardcode the *rendered set*: unknown flows fall
// back to a prettified raw value so the panel can't silently hide new data.
const LIQUIDITY_FLOW_LABELS: Record<string, string> = {
  buy: 'Mallcoin buy (M-Pesa in)',
  withdraw: 'Withdrawal (M-Pesa out)',
  reconciliation: 'Reconciliation',
  mallpoints_convert: 'Mallpoints → Mallcoin conversion',
  mallpoints_purchase: 'Mallpoints purchase',
  reward: 'Reward payout',
  transfer: 'Wallet transfer',
  faucet: 'Faucet',
  refund: 'Refund',
};

function flowLabel(flow: string): string {
  if (LIQUIDITY_FLOW_LABELS[flow]) return LIQUIDITY_FLOW_LABELS[flow];
  return flow.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function MlptsAdmin() {
  const [items, setItems] = useState<LiquidityActivityItem[]>([]);
  const [flowFilter, setFlowFilter] = useState<string>('all');
  const [flowsSeen, setFlowsSeen] = useState<string[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [metrics, setMetrics] = useState<TreasuryMetricTotal[]>([]);
  // Every MLPTS→MLCNS conversion collection, not just whatever shares the
  // latest-25 page with buy/withdraw noise — /api/liquidity/activity filters
  // server-side by flow and reports the unfiltered-by-page `total`.
  const [conversions, setConversions] = useState<{ items: LiquidityActivityItem[]; total: number }>({ items: [], total: 0 });

  const load = async () => {
    const [l, c, m] = await Promise.all([
      adminApi.listLiquidityActivity(flowFilter === 'all' ? { limit: 50 } : { flow: flowFilter, limit: 50 }),
      adminApi.listLiquidityActivity({ flow: 'mallpoints_convert', limit: 500 }),
      adminApi.getTreasuryMetrics(),
    ]);
    if (l.ok && l.data) {
      setItems(l.data.items);
      if (flowFilter === 'all') {
        setFlowsSeen((prev) => Array.from(new Set([...prev, ...l.data!.items.map((i) => i.flow)])));
      }
    }
    if (c.ok && c.data) setConversions({ items: c.data.items, total: c.data.total });
    if (m.ok && m.data) setMetrics(m.data.totals);
    setErrors(collectErrors([
      ['liquidity activity', l],
      ['conversion ledger', c],
      ['treasury metrics', m],
    ]));
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowFilter]);

  // Filter options = the known enum ∪ flows actually observed in the data —
  // so new backend flow types are filterable as soon as they appear.
  const flowOptions = useMemo(
    () => Array.from(new Set([...Object.keys(LIQUIDITY_FLOW_LABELS), ...flowsSeen])),
    [flowsSeen]
  );

  const mallpointsConversion = useMemo(
    () =>
      metrics
        .filter((m) => m.activity === 'mallpoints_convert')
        .reduce((acc, m) => acc + Number(m.totalAmount || 0), 0),
    [metrics]
  );

  const convertedMlcns = useMemo(
    () => conversions.items.reduce((acc, i) => acc + Number(i.amountMlcns || 0), 0),
    [conversions.items]
  );

  return (
    <>
      <AdminErrorBanner errors={errors} />

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">MLPTS converted (all-time)</div>
          <div className="card-value">{formatKes(mallpointsConversion)}</div>
          <div className="card-sub">sum of mallpoints_convert activity</div>
        </div>
        <div className="card">
          <div className="card-label">Conversions recorded</div>
          <div className="card-value">{conversions.total}</div>
          <div className="card-sub">{fmtNum(conversions.items.length)} loaded, {fmtNum(convertedMlcns)} MLCNS issued</div>
        </div>
        <div className="card">
          <div className="card-label">Recent liquidity events</div>
          <div className="card-value">{items.length}</div>
          <div className="card-sub">refresh every 30s</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Mallpoints → Mallcoin conversions</h2>
          <span className="sub">every conversion collection · admin-only</span>
        </div>
        {!conversions.items.length && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No Mallpoints conversions have been settled yet.</div>
        )}
        {conversions.items.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>MLCNS credited</th>
                <th>MLPTS value (KES)</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Reference</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {conversions.items.map((i) => (
                <tr key={i._id}>
                  <td className="tiny mono">{i.walletAddress ? `${i.walletAddress.slice(0, 12)}…${i.walletAddress.slice(-6)}` : '—'}</td>
                  <td className="num">{i.amountMlcns != null ? `${i.amountMlcns} MLCNS` : '—'}</td>
                  <td className="num">{i.fiatAmount != null ? formatKes(i.fiatAmount) : '—'}</td>
                  <td>
                    <span className={`chip ${i.status === 'success' ? 'green' : i.status === 'failed' ? 'red' : 'gold'}`}>{i.status}</span>
                  </td>
                  <td className="tiny">{i.stage}</td>
                  <td className="tiny mono">{i.creditTxHash ? `${i.creditTxHash.slice(0, 14)}…` : '—'}</td>
                  <td className="tiny">{timeAgo(i.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mt">
        <div className="sec-title">
          <h2>Liquidity activity</h2>
          <span className="sub">latest 50 entries · admin-only</span>
          <select
            className="input"
            style={{ marginLeft: 'auto', width: 'auto', padding: '6px 10px', fontSize: 12 }}
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value)}
            title="Filter by transaction flow type"
          >
            <option value="all">All flows</option>
            {flowOptions.map((f) => (
              <option key={f} value={f}>{flowLabel(f)}</option>
            ))}
          </select>
        </div>
        {!items.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No liquidity events yet{flowFilter !== 'all' ? ` for flow "${flowLabel(flowFilter)}"` : ''}.</div>}
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
                <td>
                  <span className="chip gold" title={i.flow}>{flowLabel(i.flow)}</span>
                </td>
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
