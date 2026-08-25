import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, StatusChip, Modal, toast } from '../../components/ui';
import {
  adminApi,
  type CurrentUser,
  type AdminDashboardStats,
  type AdminUser,
  type AdminValidatorApplication,
  type AdminKycSubmission,
  type AdminCampaign,
  type AdminSubmission,
  type AuditLogEntry,
  type AdminBadgePurchase,
  type AdminBadgeIssuance,
  type LiquidityActivityItem,
  type ReconciliationItem,
  type AdminWithdrawalRequest,
  type BurnPolicyEntry,
  type DynamicBurnThresholdEntry,
  type TreasuryLedgerEntry,
  type TreasuryMetricTotal,
} from '../../services/adminApi';
import { kycApi } from '../../services/kycApi';

type Tab = 'dashboard' | 'users' | 'kyc' | 'validators' | 'mining' | 'badges' | 'liquidity' | 'reconciliation' | 'withdrawals' | 'treasury' | 'audit' | 'local';

/**
 * Admin Control Center — real backend (backend/src/routes/adminPanel.js),
 * gated by the logged-in user's role. The old version was 100% local
 * store.state.admin mutations (fake users, fake "1.48M blocks · 157
 * validators" network stats, feature flags/announcements with no backend
 * model). Those last two had zero server-side representation, so they're
 * dropped rather than left as theater.
 */
export default function Admin() {
  useStoreVersion();

  const [me, setMe] = useState<CurrentUser | null | undefined>(undefined); // undefined = loading
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    adminApi.getMe().then((res) => setMe(res.ok && res.data ? res.data.user : null));
  }, []);

  if (me === undefined) {
    return <div className="card"><div className="tiny" style={{ padding: 20 }}>Checking access…</div></div>;
  }

  if (!me || (me.role !== 'admin' && me.role !== 'superadmin')) {
    return (
      <div>
        <div className="view-head"><h1>Admin Control Center</h1></div>
        <div className="empty-state"><div className="es-ico">🔒</div><div className="es-t">Access denied</div><div className="es-m">This section is restricted to admin accounts.</div></div>
      </div>
    );
  }

  const isSuperAdmin = me.role === 'superadmin';

  return (
    <div>
      <div className="view-head">
        <h1>Admin Control Center</h1>
        <span className="sub">signed in as {me.email} · {me.role}</span>
      </div>

      <div className="mc-subnav" style={{ marginBottom: 16 }}>
        <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
        <button className={tab === 'kyc' ? 'on' : ''} onClick={() => setTab('kyc')}>KYC Review</button>
        <button className={tab === 'validators' ? 'on' : ''} onClick={() => setTab('validators')}>Validator Applications</button>
        <button className={tab === 'mining' ? 'on' : ''} onClick={() => setTab('mining')}>Mining</button>
        <button className={tab === 'badges' ? 'on' : ''} onClick={() => setTab('badges')}>Badges</button>
        <button className={tab === 'liquidity' ? 'on' : ''} onClick={() => setTab('liquidity')}>Liquidity Activity</button>
        <button className={tab === 'reconciliation' ? 'on' : ''} onClick={() => setTab('reconciliation')}>Reconciliation</button>
        <button className={tab === 'withdrawals' ? 'on' : ''} onClick={() => setTab('withdrawals')}>Withdrawals</button>
        <button className={tab === 'treasury' ? 'on' : ''} onClick={() => setTab('treasury')}>Treasury</button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit Log</button>
        <button className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')}>Local Banners</button>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab isSuperAdmin={isSuperAdmin} />}
      {tab === 'kyc' && <KycReviewTab />}
      {tab === 'validators' && <ValidatorApplicationsTab />}
      {tab === 'mining' && <MiningTab meId={me.id} />}
      {tab === 'badges' && <BadgesTab />}
      {tab === 'liquidity' && <LiquidityActivityTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
      {tab === 'withdrawals' && <WithdrawalsTab />}
      {tab === 'treasury' && <TreasuryTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'local' && <LocalBannersTab />}
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getDashboard().then((res) => {
      if (res.ok && res.data) setStats(res.data.stats);
      else setError(res.error || 'Failed to load dashboard');
    });
  }, []);

  if (error) return <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>;

  return (
    <div>
      <div className="stat-grid">
        <div className="card"><div className="card-label">Total users</div><div className="card-value">{stats ? fmtNum(stats.users.total) : '—'}</div><div className="card-sub">{stats?.users.admins ?? '—'} admins · {stats?.users.banned ?? '—'} banned</div></div>
        <div className="card"><div className="card-label">Validator applications</div><div className="card-value" style={{ color: 'var(--gold)' }}>{stats?.validators.pending ?? '—'}</div><div className="card-sub">{stats?.validators.active ?? '—'} active validators</div></div>
        <div className="card"><div className="card-label">Pending mining reviews</div><div className="card-value">{stats?.mining.pendingSubmissions ?? '—'}</div><div className="card-sub">{stats?.mining.totalCampaigns ?? '—'} total campaigns</div></div>
      </div>
      <div className="card mt">
        <div className="sec-title"><h2>Recently joined</h2></div>
        {(stats?.recentUsers || []).map((u) => (
          <div key={u._id} className="list-row">
            <div className="grow"><div className="t">{u.email}</div><div className="m">{u.role} · joined {new Date(u.createdAt).toLocaleDateString()}</div></div>
            {u.banned && <span className="chip red">banned</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApi.listUsers(search ? { search } : undefined);
    if (res.ok && res.data) setUsers(res.data.users);
    else setError(res.error || 'Failed to load users');
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const doBan = async (u: AdminUser, banned: boolean) => {
    const res = await adminApi.banUser(u._id, banned, banned ? 'Banned by admin' : undefined);
    if (res.ok) {
      toast(banned ? `${u.email} banned` : `${u.email} unbanned`);
      load();
    } else {
      toast(res.error || 'Action failed', false);
    }
    setConfirmBan(null);
  };

  const setRole = async (u: AdminUser, role: 'user' | 'admin' | 'superadmin') => {
    const res = await adminApi.setUserRole(u._id, role);
    if (res.ok) {
      toast(`${u.email} is now ${role}`);
      load();
    } else {
      toast(res.error || 'Role change failed', false);
    }
  };

  return (
    <div>
      <div className="filter-row"><input className="input search" placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        <table className="tbl">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u._id}>
                <td><b>{u.username || u.email}</b><div className="tiny">{u.email}</div></td>
                <td>
                  {u.role === 'superadmin' ? (
                    <span className="chip gold" title="A superadmin's role is permanent and can't be changed">superadmin 🔒</span>
                  ) : isSuperAdmin ? (
                    <select className="input" value={u.role} onChange={(e) => setRole(u, e.target.value as 'user' | 'admin' | 'superadmin')}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      <option value="superadmin">superadmin</option>
                    </select>
                  ) : u.role}
                </td>
                <td>{u.banned ? <span className="frozen-badge">❄ Banned</span> : <span className="chip green">Active</span>}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmBan(u)}>{u.banned ? 'Unban' : 'Ban'}</button>
                  {isSuperAdmin && (
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={async () => {
                      const res = await adminApi.deleteUser(u._id);
                      if (res.ok) { toast(`${u.email} deleted`); load(); } else toast(res.error || 'Delete failed', false);
                    }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmBan && (
        <Modal title="Confirm user action" onClose={() => setConfirmBan(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>{confirmBan.banned ? 'Unban' : 'Ban'} <b>{confirmBan.email}</b>?</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmBan(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => doBan(confirmBan, !confirmBan.banned)}>Confirm {confirmBan.banned ? 'unban' : 'ban'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ValidatorApplicationsTab() {
  const [apps, setApps] = useState<AdminValidatorApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApi.listValidatorApplications('pending');
    if (res.ok && res.data) setApps(res.data.applications);
    else setError(res.error || 'Failed to load applications');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, action: 'approved' | 'rejected') => {
    const res = await adminApi.reviewValidatorApplication(id, action);
    if (res.ok) { toast(`Application ${action}`); load(); } else toast(res.error || 'Review failed', false);
  };

  return (
    <div>
      <div className="tiny muted mb">
        Approving unlocks the applicant's own "Activate validator" action on their My Application page — they self-bond from their own wallet, since
        this platform holds no custodial keys to do it on their behalf. It does not itself create anything on-chain.
      </div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {apps?.length === 0 && <div className="empty-state"><div className="es-ico">📝</div><div className="es-t">No pending applications</div></div>}
        {(apps || []).map((a) => (
          <div key={a._id} className="list-row">
            <div className="grow">
              <div className="t">{a.moniker}</div>
              <div className="m">{a.applicantAddress} · submitted {new Date(a.submittedAt).toLocaleString()}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => review(a._id, 'approved')}>Approve</button>
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => review(a._id, 'rejected')}>Reject</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function KycReviewTab() {
  const [subs, setSubs] = useState<AdminKycSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docModal, setDocModal] = useState<{ kycId: string; blobUrl: string; loading: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApi.listPendingKyc();
    if (res.ok && res.data) setSubs(res.data.submissions);
    else setError(res.error || 'Failed to load KYC submissions');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, action: 'approved' | 'rejected') => {
    const res = await adminApi.reviewKyc(id, action, notes[id]);
    if (res.ok) { toast(`KYC ${action}`); load(); } else toast(res.error || 'Review failed', false);
  };

  const viewDocument = async (kycId: string) => {
    setDocModal({ kycId, blobUrl: '', loading: true });
    const res = await kycApi.fetchDocumentBlobUrl(kycId);
    if (res.ok && res.data) setDocModal({ kycId, blobUrl: res.data, loading: false });
    else {
      toast(res.error || 'Failed to load document', false);
      setDocModal(null);
    }
  };

  const closeDocModal = () => {
    if (docModal?.blobUrl) URL.revokeObjectURL(docModal.blobUrl);
    setDocModal(null);
  };

  return (
    <div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {subs?.length === 0 && <div className="empty-state"><div className="es-ico">🪪</div><div className="es-t">No pending KYC submissions</div></div>}
        {(subs || []).map((s) => {
          const applicant = typeof s.userId === 'object' ? s.userId : null;
          return (
            <div key={s._id} className="list-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="t">{s.firstName} {s.lastName}</div>
                <div className="m">
                  {applicant?.email || 'unknown'} · {s.idType.replace('_', ' ')} #{s.idNumber} · risk: {s.riskLevel} ·
                  {' '}submitted {new Date(s.submittedAt).toLocaleString()}
                </div>
                <input
                  className="input input-sm"
                  placeholder="Review notes (optional)"
                  style={{ marginTop: 6, maxWidth: 320 }}
                  value={notes[s._id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [s._id]: e.target.value }))}
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => viewDocument(s._id)}>View document</button>
              <button className="btn btn-primary btn-sm" onClick={() => review(s._id, 'approved')}>Approve</button>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => review(s._id, 'rejected')}>Reject</button>
            </div>
          );
        })}
      </div>

      {docModal && (
        <Modal title="ID document" onClose={closeDocModal}>
          {docModal.loading ? (
            <div className="tiny" style={{ padding: 20 }}>Loading…</div>
          ) : docModal.blobUrl.startsWith('blob:') ? (
            <img src={docModal.blobUrl} alt="ID document" style={{ maxWidth: '100%', borderRadius: 8 }} onError={() => window.open(docModal.blobUrl, '_blank')} />
          ) : null}
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => window.open(docModal.blobUrl, '_blank')}>Open in new tab</button></div>
        </Modal>
      )}
    </div>
  );
}

function MiningTab({ meId }: { meId: string }) {
  const [campaigns, setCampaigns] = useState<AdminCampaign[] | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ratePerTask, setRatePerTask] = useState(10);
  const [budget, setBudget] = useState(1000);

  const load = useCallback(async () => {
    setError(null);
    const [campResult, subResult] = await Promise.all([adminApi.listMiningCampaigns(), adminApi.listPendingSubmissions()]);
    if (campResult.ok && campResult.data) setCampaigns(campResult.data.campaigns);
    else setError(campResult.error || 'Failed to load campaigns');
    if (subResult.ok && subResult.data) setSubmissions(subResult.data.submissions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createCampaign = async () => {
    if (!title.trim()) return toast('Title is required', false);
    const res = await adminApi.createCampaign({ creator_id: meId, title, description, rate_per_task: ratePerTask, budget_remaining: budget });
    if (res.ok) {
      toast(`Campaign "${title}" created`);
      setCreateOpen(false);
      setTitle(''); setDescription('');
      load();
    } else {
      toast(res.error || 'Failed to create campaign', false);
    }
  };

  const approve = async (id: string) => {
    const res = await adminApi.approveSubmission(id);
    if (res.ok) { toast('Submission approved'); load(); } else toast(res.error || 'Approve failed', false);
  };
  const reject = async (id: string) => {
    const res = await adminApi.rejectSubmission(id, 'Rejected by admin');
    if (res.ok) { toast('Submission rejected'); load(); } else toast(res.error || 'Reject failed', false);
  };

  return (
    <div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}

      <div className="card mb">
        <div className="sec-title"><h2>Campaigns</h2><button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setCreateOpen(true)}>＋ Create campaign</button></div>
        {(campaigns || []).map((c) => (
          <div key={c._id} className="list-row">
            <div className="grow"><div className="t">{c.title}</div><div className="m">{c.rate_per_task} MLPTS/task · budget {fmtNum(c.budget_remaining)} · {c.completions_count} completions</div></div>
            <StatusChip status={c.status} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Pending submissions</h2><span className="sub">manual-review fallback — used when no reviewers are staked</span></div>
        {submissions?.length === 0 && <div className="empty-state"><div className="es-ico">🛂</div><div className="es-t">Nothing pending</div></div>}
        {(submissions || []).map((s) => (
          <div key={s._id} className="list-row">
            <div className="grow"><div className="t">{s.title || `Submission ${s._id}`}</div><div className="m">{s.description}</div></div>
            <button className="btn btn-primary btn-sm" onClick={() => approve(s._id)}>Approve</button>
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => reject(s._id)}>Reject</button>
          </div>
        ))}
      </div>

      {createOpen && (
        <Modal title="Create campaign" onClose={() => setCreateOpen(false)}>
          <div className="field"><label>Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><label>Reward per task (MLPTS)</label><input className="input" type="number" value={ratePerTask} onChange={(e) => setRatePerTask(+e.target.value)} /></div>
            <div className="field"><label>Budget</label><input className="input" type="number" value={budget} onChange={(e) => setBudget(+e.target.value)} /></div>
          </div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={createCampaign}>Create</button></div>
        </Modal>
      )}
    </div>
  );
}

function BadgesTab() {
  const [purchases, setPurchases] = useState<AdminBadgePurchase[] | null>(null);
  const [issuances, setIssuances] = useState<AdminBadgeIssuance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantAddress, setGrantAddress] = useState('');
  const [granting, setGranting] = useState(false);
  const [voidTarget, setVoidTarget] = useState<AdminBadgePurchase | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const [purchaseRes, issuanceRes] = await Promise.all([adminApi.listBadgePurchases(), adminApi.listBadgeIssuances()]);
    if (purchaseRes.ok && purchaseRes.data) setPurchases(purchaseRes.data.purchases);
    else setError(purchaseRes.error || 'Failed to load badge purchases');
    if (issuanceRes.ok && issuanceRes.data) setIssuances(issuanceRes.data.issuances);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async () => {
    if (!grantAddress.trim()) return toast('Wallet address is required', false);
    setGranting(true);
    const res = await adminApi.grantBadge(grantAddress.trim());
    setGranting(false);
    if (res.ok) {
      toast('Badge granted');
      setGrantAddress('');
      load();
    } else {
      toast(res.error || 'Grant failed', false);
    }
  };

  const doVoid = async () => {
    if (!voidTarget) return;
    const res = await adminApi.voidBadgePurchase(voidTarget.quoteId, voidReason);
    if (res.ok) { toast('Purchase voided'); load(); } else toast(res.error || 'Void failed', false);
    setVoidTarget(null);
    setVoidReason('');
  };

  return (
    <div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}

      <div className="card mb">
        <div className="sec-title"><h2>Grant badge manually</h2></div>
        <div className="tiny muted mb">
          For support cases (a missed streak due to a tracking gap, a goodwill gesture, etc). Issues on-chain via the
          same path as the streak snapshot and paid purchases.
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1 }} placeholder="mall1…" value={grantAddress} onChange={(e) => setGrantAddress(e.target.value)} disabled={granting} />
          <button className="btn btn-primary btn-sm" onClick={grant} disabled={granting}>{granting && <span className="spin" />} Grant</button>
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Issuances</h2></div>
        {issuances?.length === 0 && <div className="empty-state"><div className="es-ico">🏅</div><div className="es-t">No badges issued yet</div></div>}
        {(issuances || []).map((i) => (
          <div key={i._id} className="list-row">
            <div className="grow">
              <div className="t mono" style={{ fontSize: 12.5 }}>{i.walletAddress}</div>
              <div className="m">{i.badgeType} · issued {new Date(i.issuedAt).toLocaleString()}{i.txHash && <> · {i.txHash.slice(0, 12)}…</>}</div>
            </div>
            <StatusChip status={i.method} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Purchases</h2></div>
        {purchases?.length === 0 && <div className="empty-state"><div className="es-ico">💳</div><div className="es-t">No purchases yet</div></div>}
        {(purchases || []).map((p) => (
          <div key={p._id} className="list-row">
            <div className="grow">
              <div className="t mono" style={{ fontSize: 12.5 }}>{p.walletAddress}</div>
              <div className="m">{p.phone} · KSh {p.fiatAmount} · {new Date(p.createdAt).toLocaleString()}{p.mpesaRef && <> · ref {p.mpesaRef}</>}</div>
            </div>
            <StatusChip status={p.status} />
            {p.status !== 'issued' && (
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => setVoidTarget(p)}>Void</button>
            )}
          </div>
        ))}
      </div>

      {voidTarget && (
        <Modal title="Void badge purchase" onClose={() => setVoidTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Void purchase <b className="mono">{voidTarget.quoteId}</b> for <b className="mono">{voidTarget.walletAddress}</b>?
            This marks it failed — it does not affect any on-chain badge, and only applies before issuance.
          </p>
          <div className="field mb">
            <label>Reason</label>
            <input className="input" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Refund requested, duplicate quote, etc." autoFocus />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setVoidTarget(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={doVoid}>Confirm void</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Liquidity Activity — the LiquidityPoolActivity ledger recorded through
 * buy/sell/withdraw/payout callbacks (see routes/liquidity.js#/activity).
 * Read-only: this is a monitoring feed, not an action queue.
 */
function LiquidityActivityTab() {
  const [items, setItems] = useState<LiquidityActivityItem[] | null>(null);
  const [flow, setFlow] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.listLiquidityActivity({ flow: flow || undefined, limit: 200 }).then((res) => {
      if (res.ok && res.data) setItems(res.data.items);
      else setError(res.error || 'Failed to load liquidity activity');
    });
  }, [flow]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mc-subnav" style={{ marginBottom: 12 }}>
        {['', 'buy', 'withdraw', 'reconciliation', 'mallpoints_convert'].map((f) => (
          <button key={f || 'all'} className={flow === f ? 'on' : ''} onClick={() => setFlow(f)}>{f || 'All'}</button>
        ))}
      </div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {items?.length === 0 && <div className="empty-state"><div className="es-ico">💧</div><div className="es-t">No liquidity activity yet</div></div>}
        {(items || []).map((it) => (
          <div key={it._id} className="list-row">
            <div className="grow">
              <div className="t">{it.flow} · {it.stage}</div>
              <div className="m">
                {it.walletAddress || '—'} · {fmtNum(it.amountMlcns || 0)} MLCNS
                {it.fiatAmount ? ` · ${fmtMoney(it.fiatAmount, it.currency || 'KES')}` : ''}
                {' · '}{new Date(it.createdAt).toLocaleString()}
              </div>
            </div>
            <StatusChip status={it.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Reconciliation Queue — pool-add failures after a credited purchase (see
 * models/LiquidityReconciliation.js), plus a manual trigger for the job
 * that detects and compensates them (services/reconciliationService.js).
 */
function ReconciliationTab() {
  const [items, setItems] = useState<ReconciliationItem[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    adminApi.listReconciliationItems(status || undefined).then((res) => {
      if (res.ok && res.data) setItems(res.data.items);
      else setError(res.error || 'Failed to load reconciliation items');
    });
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await adminApi.runReconciliation();
      if (res.ok) { toast('Reconciliation job triggered', true); load(); }
      else toast(res.error || 'Failed to trigger reconciliation', false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="mc-subnav" style={{ marginBottom: 12, justifyContent: 'space-between', display: 'flex' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['', 'detected', 'compensating', 'pending_manual', 'resolved'].map((s) => (
            <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={runNow} disabled={running}>{running ? 'Running…' : 'Run reconciliation now'}</button>
      </div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {items?.length === 0 && <div className="empty-state"><div className="es-ico">🧮</div><div className="es-t">Nothing to reconcile</div></div>}
        {(items || []).map((it) => (
          <div key={it._id} className="list-row">
            <div className="grow">
              <div className="t">{it.walletAddress}</div>
              <div className="m">
                {fmtNum(it.mlcnsAmount)} MLCNS / {fmtMoney(it.fiatAmount, 'KES')} · {it.reason || 'liquidity add failed after credit'}
                {' · '}{new Date(it.createdAt).toLocaleString()}
              </div>
            </div>
            <StatusChip status={it.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Withdrawals — cash-out requests from routes/buy.js's sell flow (models/WithdrawalRequest.js). */
function WithdrawalsTab() {
  const [items, setItems] = useState<AdminWithdrawalRequest[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listWithdrawals(status || undefined).then((res) => {
      if (res.ok && res.data) setItems(res.data.withdrawals);
      else setError(res.error || 'Failed to load withdrawals');
    });
  }, [status]);

  return (
    <div>
      <div className="mc-subnav" style={{ marginBottom: 12 }}>
        {['', 'pending_review', 'payout_initiated', 'completed', 'failed'].map((s) => (
          <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {items?.length === 0 && <div className="empty-state"><div className="es-ico">💸</div><div className="es-t">No withdrawal requests</div></div>}
        {(items || []).map((w) => (
          <div key={w._id} className="list-row">
            <div className="grow">
              <div className="t">{w.walletAddress} · {w.phone}</div>
              <div className="m">
                {fmtNum(w.amountMlcns)} MLCNS → {fmtMoney(w.amountKes, w.currency || 'KES')}
                {w.payoutRef ? ` · ref ${w.payoutRef}` : ''}
                {' · '}{new Date(w.createdAt).toLocaleString()}
              </div>
            </div>
            <StatusChip status={w.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Treasury — burn policies, dynamic supply-based thresholds, the ledger,
 * and aggregate metrics (routes/adminPanel.js#treasury/*). Policies and
 * thresholds are upserted by (activity[, supplyThreshold]), matching the
 * backend's own upsert key.
 */
function TreasuryTab() {
  const [policies, setPolicies] = useState<BurnPolicyEntry[] | null>(null);
  const [thresholds, setThresholds] = useState<DynamicBurnThresholdEntry[] | null>(null);
  const [ledger, setLedger] = useState<TreasuryLedgerEntry[] | null>(null);
  const [metrics, setMetrics] = useState<TreasuryMetricTotal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPolicy, setNewPolicy] = useState({ activity: 'cash_out', burnPercentage: 0, description: '' });
  const [newThreshold, setNewThreshold] = useState({ activity: 'cash_out', supplyThreshold: 0, burnPercentage: 0 });

  const load = useCallback(() => {
    Promise.all([
      adminApi.listBurnPolicies(),
      adminApi.listDynamicThresholds(),
      adminApi.getTreasuryLedger({ limit: 100 }),
      adminApi.getTreasuryMetrics(),
    ]).then(([p, t, l, m]) => {
      if (p.ok && p.data) setPolicies(p.data.policies);
      if (t.ok && t.data) setThresholds(t.data.thresholds);
      if (l.ok && l.data) setLedger(l.data.entries);
      if (m.ok && m.data) setMetrics(m.data.totals);
      if (!p.ok) setError(p.error || 'Failed to load treasury data');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePolicy = async () => {
    const res = await adminApi.saveBurnPolicy(newPolicy);
    if (res.ok) { toast('Burn policy saved', true); load(); }
    else toast(res.error || 'Failed to save policy', false);
  };

  const removePolicy = async (activity: string) => {
    const res = await adminApi.deleteBurnPolicy(activity);
    if (res.ok) { toast('Burn policy removed', true); load(); }
    else toast(res.error || 'Failed to remove policy', false);
  };

  const saveThreshold = async () => {
    const res = await adminApi.saveDynamicThreshold(newThreshold);
    if (res.ok) { toast('Dynamic threshold saved', true); load(); }
    else toast(res.error || 'Failed to save threshold', false);
  };

  const removeThreshold = async (id: string) => {
    const res = await adminApi.deleteDynamicThreshold(id);
    if (res.ok) { toast('Threshold removed', true); load(); }
    else toast(res.error || 'Failed to remove threshold', false);
  };

  return (
    <div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}

      {metrics && metrics.length > 0 && (
        <div className="stat-grid mb">
          {metrics.map((m) => (
            <div key={`${m.activity}-${m.direction}`} className="card">
              <div className="card-label">{m.activity} · {m.direction}</div>
              <div className="card-value">{fmtNum(m.totalAmount)}</div>
              <div className="card-sub">{m.count} entries</div>
            </div>
          ))}
        </div>
      )}

      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Burn Policies</h3>
        {(policies || []).map((p) => (
          <div key={p._id} className="list-row">
            <div className="grow">
              <div className="t">{p.activity}</div>
              <div className="m">{p.burnPercentage}% · {p.description || 'no description'}</div>
            </div>
            <StatusChip status={p.enabled ? 'active' : 'disabled'} />
            <button className="btn btn-ghost btn-sm" onClick={() => removePolicy(p.activity)}>Remove</button>
          </div>
        ))}
        <div className="list-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="input" value={newPolicy.activity} onChange={(e) => setNewPolicy((s) => ({ ...s, activity: e.target.value }))}>
            {['marketplace_purchase', 'wallet_transfer', 'cash_out', 'validator_penalty', 'lost_recovery'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="input" type="number" min={0} max={100} placeholder="Burn %" value={newPolicy.burnPercentage}
            onChange={(e) => setNewPolicy((s) => ({ ...s, burnPercentage: Number(e.target.value) }))} style={{ width: 90 }} />
          <input className="input" placeholder="Description" value={newPolicy.description}
            onChange={(e) => setNewPolicy((s) => ({ ...s, description: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn btn-primary btn-sm" onClick={savePolicy}>Save</button>
        </div>
      </div>

      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Dynamic Burn Thresholds</h3>
        {(thresholds || []).map((t) => (
          <div key={t._id} className="list-row">
            <div className="grow">
              <div className="t">{t.activity} · supply ≥ {fmtNum(t.supplyThreshold)}</div>
              <div className="m">{t.burnPercentage}% burn</div>
            </div>
            <StatusChip status={t.enabled ? 'active' : 'disabled'} />
            <button className="btn btn-ghost btn-sm" onClick={() => removeThreshold(t._id)}>Remove</button>
          </div>
        ))}
        <div className="list-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="input" value={newThreshold.activity} onChange={(e) => setNewThreshold((s) => ({ ...s, activity: e.target.value }))}>
            {['cash_out', 'marketplace_purchase', 'wallet_transfer'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="input" type="number" placeholder="Supply threshold" value={newThreshold.supplyThreshold}
            onChange={(e) => setNewThreshold((s) => ({ ...s, supplyThreshold: Number(e.target.value) }))} style={{ width: 160 }} />
          <input className="input" type="number" min={0} max={100} placeholder="Burn %" value={newThreshold.burnPercentage}
            onChange={(e) => setNewThreshold((s) => ({ ...s, burnPercentage: Number(e.target.value) }))} style={{ width: 90 }} />
          <button className="btn btn-primary btn-sm" onClick={saveThreshold}>Save</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ledger</h3>
        {(ledger || []).length === 0 && <div className="empty-state"><div className="es-ico">📒</div><div className="es-t">No ledger entries yet</div></div>}
        {(ledger || []).map((l) => (
          <div key={l._id} className="list-row">
            <div className="grow">
              <div className="t">{l.activity}</div>
              <div className="m">{l.description || '—'} · {new Date(l.createdAt).toLocaleString()}</div>
            </div>
            <div className="t">{l.direction === 'outflow' ? '−' : '+'}{fmtNum(l.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getAuditLog(100).then((res) => {
      if (res.ok && res.data) setLogs(res.data.logs);
      else setError(res.error || 'Failed to load audit log');
    });
  }, []);

  return (
    <div>
      {error && <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div></div>}
      <div className="card">
        {logs?.length === 0 && <div className="empty-state"><div className="es-ico">📜</div><div className="es-t">No audit entries yet</div></div>}
        {(logs || []).map((l) => (
          <div key={l._id} className="list-row">
            <div className="grow"><div className="t">{l.action}</div><div className="m">{l.actor} · {new Date(l.createdAt).toLocaleString()}</div></div>
            <StatusChip status={l.outcome} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Maintenance-mode / announcement banners (App.tsx, TopBar.tsx). These have
 * no backend model — they're a per-browser local toggle, not a real
 * cross-user broadcast, so they're kept here but clearly labeled as such
 * rather than presented as real admin infrastructure.
 */
function LocalBannersTab() {
  useStoreVersion();
  const st = store.state;
  const [annText, setAnnText] = useState('');

  return (
    <div>
      <div className="card mb" style={{ borderColor: 'rgba(243,186,47,.35)' }}>
        <div className="tiny">⚠ These toggles only affect this browser session — there's no backend model backing them, so they don't broadcast to other users.</div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Maintenance mode</h2></div>
          <label className="switch">
            <input type="checkbox" checked={!!st.admin.flags.maintenance} onChange={(e) => { st.admin.flags.maintenance = e.target.checked; store.commit(); }} />
            <span className="track" /><span className="knob" />
          </label>
        </div>
        <div className="card">
          <div className="sec-title"><h2>Local announcement banner</h2></div>
          {st.admin.announcements.length > 0 && (
            <div className="card mb" style={{ background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{st.admin.announcements[0].text}</div>
              <button className="btn btn-danger btn-sm" onClick={() => { st.admin.announcements.shift(); store.commit(); }}>Dismiss</button>
            </div>
          )}
          <textarea className="input" rows={2} placeholder="Write a local banner…" value={annText} onChange={(e) => setAnnText(e.target.value)} />
          <button className="btn btn-primary btn-block mt" onClick={() => {
            if (!annText.trim()) return toast('Text is required', false);
            st.admin.announcements.unshift({ id: 'ann' + Date.now(), text: annText.trim(), ts: Date.now() });
            store.commit();
            setAnnText('');
          }}>Set local banner</button>
        </div>
      </div>
    </div>
  );
}
