import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, toast, scheduleUndoable } from '../../components/ui';
import {
  adminApi,
  type CurrentUser,
  type AdminDashboardStats,
  type AdminUser,
  type AdminValidatorApplication,
  type AdminKycSubmission,
  type AdminAmlReview,
  type AdminStructuringFlag,
  type AdminCampaign,
  type AdminSubmission,
  type AuditLogEntry,
  type AdminBadgePurchase,
  type AdminBadgeIssuance,
  type BadgeDesignRecord,
  type LiquidityActivityItem,
  type ReconciliationItem,
  type AdminWithdrawalRequest,
  type BurnPolicyEntry,
  type DynamicBurnThresholdEntry,
  type TreasuryLedgerEntry,
  type TreasuryMetricTotal,
  type ChainStatus,
  type ChainBlock,
  type ChainValidator,
  type MaintenanceState,
} from '../../services/adminApi';
import { kycApi } from '../../services/kycApi';
import { withdrawalAmlApi } from '../../services/withdrawalAmlApi';
import type { AdminTab } from '../../components/AdminSidebar';
import './Admin.css';

const TAB_TITLES: Record<AdminTab, string> = {
  overview: 'Dashboard',
  chain: 'Network monitoring',
  users: 'Users',
  kyc: 'KYC review',
  aml: 'AML review',
  mining: 'Mining campaigns',
  badges: 'Badges',
  treasury: 'Treasury',
  withdrawals: 'Withdrawals',
  reconciliation: 'Reconciliation',
  liquidity: 'Liquidity',
  notifications: 'Broadcast',
  emergency: 'System lock',
  audit: 'Audit log',
};

function AdminModal({ title, onClose, children, maxWidth }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div className="adm-overlay" onClick={onClose}>
      <div className="adm-modal" style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = ['active', 'approved', 'completed', 'verified', 'success', 'healthy', 'bonded'].includes(status) ? 'g'
    : ['rejected', 'failed', 'banned', 'down', 'jailed', 'error'].includes(status) ? 'r'
    : ['pending', 'pending_review', 'pending_manual', 'review', 'draft', 'voting', 'expiring', 'degraded', 'rotation due', 'unverified', 'suspended', 'detected', 'compensating', 'payout_initiated', 'processing', 'payment_initiated', 'confirmed'].includes(status) ? 'y' : '';
  return <span className={`adm-badge ${color}`}>{status}</span>;
}

function ErrorCard({ message }: { message: string }) {
  return <div className="adm-banner red" style={{ marginBottom: 16 }}>{message}</div>;
}

export default function Admin({ activeTab = 'overview', onTabChange = () => {} }: { activeTab?: AdminTab; onTabChange?: (tab: AdminTab) => void } = {}) {
  useStoreVersion();

  const [me, setMe] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    adminApi.getMe().then((res) => setMe(res.ok && res.data ? res.data.user : null));
  }, []);

  if (me === undefined) {
    return <div className="adm-main"><div style={{ padding: 40, color: 'var(--adm-muted)' }}>Checking access…</div></div>;
  }

  if (!me || (me.role !== 'admin' && me.role !== 'superadmin')) {
    return (
      <div className="adm-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2>Access denied</h2>
          <p style={{ color: 'var(--adm-muted)' }}>This section is restricted to admin accounts.</p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = me.role === 'superadmin';

  return (
    <div className="adm-main">
      <div className="adm-top">
        <h1 className="text-gradient">{TAB_TITLES[activeTab] || 'Admin'}</h1>
        <span style={{ color: 'var(--adm-muted)', fontSize: 13 }}>signed in as {me.email} · {me.role}</span>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'chain' && <ChainTab />}
      {activeTab === 'users' && <UsersTab isSuperAdmin={isSuperAdmin} />}
      {activeTab === 'kyc' && <KycReviewTab />}
      {activeTab === 'aml' && <AmlReviewTab />}
      {activeTab === 'mining' && <MiningTab meId={me.id} />}
      {activeTab === 'badges' && <BadgesTab />}
      {activeTab === 'treasury' && <TreasuryTab />}
      {activeTab === 'withdrawals' && <WithdrawalsTab />}
      {activeTab === 'reconciliation' && <ReconciliationTab />}
      {activeTab === 'liquidity' && <LiquidityActivityTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'emergency' && <EmergencyTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getDashboard().then((res) => {
      if (res.ok && res.data) setStats(res.data.stats);
      else setError(res.error || 'Failed to load dashboard');
    });
    adminApi.getChainStatus().then((res) => {
      if (res.ok && res.data) setChainStatus(res.data.status);
    });
  }, []);

  if (error) return <ErrorCard message={error} />;

  return (
    <div>
      <div className="adm-kpis stagger">
        <div className="adm-kpi card-glow bg-gradient-card card-hover">
          <small>Total users</small>
          <b>{stats ? fmtNum(stats.users.total) : '—'}</b>
          <small>{stats?.users.admins ?? '—'} admins · {stats?.users.banned ?? '—'} banned</small>
        </div>
        <div className="adm-kpi card-glow bg-gradient-card card-hover">
          <small>Block height</small>
          <b style={{ color: 'var(--adm-gold)' }}>{chainStatus ? fmtNum(chainStatus.blockHeight) : '—'}</b>
          <small>{chainStatus?.syncing ? 'Syncing…' : 'In sync'}</small>
        </div>
        <div className="adm-kpi card-glow bg-gradient-card card-hover">
          <small>Validators</small>
          <b>{chainStatus ? chainStatus.peerCount : '—'}</b>
          <small>peers connected</small>
        </div>
        <div className="adm-kpi card-glow bg-gradient-card card-hover">
          <small>Pending mining</small>
          <b>{stats?.mining.pendingSubmissions ?? '—'}</b>
          <small>{stats?.mining.totalCampaigns ?? '—'} campaigns</small>
        </div>
      </div>

      <div className="adm-two" style={{ marginTop: 20 }}>
        <div className="adm-card card-glow bg-gradient-card">
          <h3>Recently joined</h3>
          <div className="adm-list">
          {(stats?.recentUsers || []).length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 12 }}>No recent users</div>}
          {(stats?.recentUsers || []).map((u) => (
            <div key={u._id}>
              <div style={{ flex: 1 }}>
                <div>{u.email}</div>
                <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{u.role} · {new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
              {u.banned && <StatusBadge status="banned" />}
            </div>
          ))}
          </div>
        </div>
        <div className="adm-card card-glow bg-gradient-card">
          <h3>Node status</h3>
          {chainStatus ? (
            <div className="adm-list">
              <div><span style={{ color: 'var(--adm-muted)' }}>Chain ID</span><span className="mono">{chainStatus.chainId}</span></div>
              <div><span style={{ color: 'var(--adm-muted)' }}>Version</span><span className="mono">{chainStatus.nodeVersion}</span></div>
              <div><span style={{ color: 'var(--adm-muted)' }}>Moniker</span><span>{chainStatus.moniker}</span></div>
              <div><span style={{ color: 'var(--adm-muted)' }}>Last block</span><span>{chainStatus.blockTime ? new Date(chainStatus.blockTime).toLocaleString() : '—'}</span></div>
              <div><span style={{ color: 'var(--adm-muted)' }}>Status</span><StatusBadge status={chainStatus.syncing ? 'syncing' : 'healthy'} /></div>
            </div>
          ) : (
            <div style={{ color: 'var(--adm-muted)', padding: 12 }}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChainTab() {
  const [subTab, setSubTab] = useState<'blocks' | 'validators' | 'applications'>('blocks');
  const [blocks, setBlocks] = useState<ChainBlock[] | null>(null);
  const [validators, setValidators] = useState<ChainValidator[] | null>(null);
  const [apps, setApps] = useState<AdminValidatorApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(() => {
    adminApi.getChainBlocks(20).then((res) => {
      if (res.ok && res.data) setBlocks(res.data.blocks);
      else setError(res.error || 'Failed to load blocks');
    });
  }, []);

  const loadValidators = useCallback(() => {
    adminApi.getChainValidators().then((res) => {
      if (res.ok && res.data) setValidators(res.data.validators);
      else setError(res.error || 'Failed to load validators');
    });
  }, []);

  const loadApps = useCallback(() => {
    adminApi.listValidatorApplications('pending').then((res) => {
      if (res.ok && res.data) setApps(res.data.applications);
      else setError(res.error || 'Failed to load applications');
    });
  }, []);

  useEffect(() => {
    if (subTab === 'blocks') loadBlocks();
    else if (subTab === 'validators') loadValidators();
    else loadApps();
  }, [subTab, loadBlocks, loadValidators, loadApps]);

  const reviewApp = async (id: string, action: 'approved' | 'rejected') => {
    const res = await adminApi.reviewValidatorApplication(id, action);
    if (res.ok) { toast(`Application ${action}`); loadApps(); } else toast(res.error || 'Review failed', false);
  };

  return (
    <div>
      {error && <ErrorCard message={error} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`adm-btn ${subTab === 'blocks' ? 'gold' : ''}`} onClick={() => setSubTab('blocks')}>Blocks</button>
        <button className={`adm-btn ${subTab === 'validators' ? 'gold' : ''}`} onClick={() => setSubTab('validators')}>Validators</button>
        <button className={`adm-btn ${subTab === 'applications' ? 'gold' : ''}`} onClick={() => setSubTab('applications')}>Applications</button>
      </div>

      {subTab === 'blocks' && (
        <div className="adm-tw">
          <table>
            <thead><tr><th>Height</th><th>Hash</th><th>Proposer</th><th>Time</th><th>Txs</th></tr></thead>
            <tbody>
              {(blocks || []).map((b) => (
                <tr key={b.height}>
                  <td className="mono">{fmtNum(b.height)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{b.hash.slice(0, 16)}…</td>
                  <td>{b.proposer}</td>
                  <td>{new Date(b.time).toLocaleString()}</td>
                  <td>{b.txCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'validators' && (
        <div className="adm-tw">
          <table>
            <thead><tr><th>Moniker</th><th>Address</th><th>Status</th><th>Tokens</th><th>Commission</th><th>Jailed</th></tr></thead>
            <tbody>
              {(validators || []).map((v) => (
                <tr key={v.operatorAddress}>
                  <td>{v.moniker}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{v.operatorAddress.slice(0, 20)}…</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="mono">{fmtNum(parseInt(v.tokens) / 1e6)}</td>
                  <td>{v.commission}%</td>
                  <td>{v.jailed ? <StatusBadge status="jailed" /> : <StatusBadge status="active" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'applications' && (
        <div className="adm-card">
          <div className="adm-list">
          {apps?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No pending applications</div>}
          {(apps || []).map((a) => (
            <div key={a._id} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div>{a.moniker}</div>
                <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{a.applicantAddress} · {new Date(a.submittedAt).toLocaleString()}</div>
              </div>
              <button className="adm-btn sm grn" onClick={() => reviewApp(a._id, 'approved')}>Approve</button>
              <button className="adm-btn sm red" onClick={() => reviewApp(a._id, 'rejected')}>Reject</button>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApi.listUsers(search ? { search } : undefined);
    if (res.ok && res.data) setUsers(res.data.users);
    else setError(res.error || 'Failed to load users');
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const doBan = async (u: AdminUser, banned: boolean) => {
    const res = await adminApi.banUser(u._id, banned, banned ? (banReason.trim() || 'Banned by admin') : undefined);
    if (res.ok) {
      toast(banned ? `${u.email} banned` : `${u.email} unbanned`);
      load();
    } else {
      toast(res.error || 'Action failed', false);
    }
    setConfirmBan(null);
    setBanReason('');
  };

  const doDelete = async (u: AdminUser) => {
    const res = await adminApi.deleteUser(u._id);
    if (res.ok) { toast(`${u.email} deleted`); load(); } else toast(res.error || 'Delete failed', false);
    setConfirmDelete(null);
  };

  const setRole = async (u: AdminUser, role: 'user' | 'admin' | 'superadmin') => {
    const res = await adminApi.setUserRole(u._id, role);
    if (res.ok) { toast(`${u.email} is now ${role}`); load(); }
    else toast(res.error || 'Role change failed', false);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input className="adm-input" placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 400 }} />
      </div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-tw">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u._id}>
                  <td><b>{u.username || u.email}</b><div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{u.email}</div></td>
                  <td>
                    {u.role === 'superadmin' ? (
                      <StatusBadge status="superadmin" />
                    ) : isSuperAdmin ? (
                      <select className="adm-select" value={u.role} onChange={(e) => setRole(u, e.target.value as 'user' | 'admin' | 'superadmin')}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    ) : <StatusBadge status={u.role} />}
                  </td>
                  <td>{u.banned ? <StatusBadge status="banned" /> : <StatusBadge status="active" />}</td>
                  <td>
                    <button className="adm-btn sm" onClick={() => setConfirmBan(u)}>{u.banned ? 'Unban' : 'Ban'}</button>
                    {isSuperAdmin && <button className="adm-btn sm red" onClick={() => setConfirmDelete(u)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmBan && (
        <AdminModal title="Confirm user action" onClose={() => { setConfirmBan(null); setBanReason(''); }}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>{confirmBan.banned ? 'Unban' : 'Ban'} <b>{confirmBan.email}</b>?</p>
          {!confirmBan.banned && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason</label>
              <input className="adm-input" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Fraud investigation, ToS violation, etc." autoFocus />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => { setConfirmBan(null); setBanReason(''); }}>Cancel</button>
            <button className="adm-btn red" onClick={() => doBan(confirmBan, !confirmBan.banned)}>Confirm {confirmBan.banned ? 'unban' : 'ban'}</button>
          </div>
        </AdminModal>
      )}

      {confirmDelete && (
        <AdminModal title="Delete user" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            Permanently delete <b>{confirmDelete.email}</b>? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="adm-btn red" onClick={() => doDelete(confirmDelete)}>Confirm delete</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function maskIdNumber(idNumber: string): string {
  const digits = idNumber.trim();
  if (digits.length <= 4) return '•'.repeat(digits.length);
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function KycReviewTab() {
  const [subs, setSubs] = useState<AdminKycSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docModal, setDocModal] = useState<{ kycId: string; blobUrl: string; loading: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [confirmTarget, setConfirmTarget] = useState<AdminKycSubmission | null>(null);
  const [accessReason, setAccessReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApi.listPendingKyc();
    if (res.ok && res.data) setSubs(res.data.submissions);
    else setError(res.error || 'Failed to load KYC submissions');
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = (id: string, action: 'approved' | 'rejected') => {
    const note = notes[id];
    scheduleUndoable(async () => {
      const res = await adminApi.reviewKyc(id, action, note);
      if (res.ok) load();
      else toast(res.error || 'Review failed', false);
    }, `Marking KYC as ${action}…`);
  };

  const viewDocument = async (kycId: string, reason: string) => {
    setDocModal({ kycId, blobUrl: '', loading: true });
    const res = await kycApi.fetchDocumentBlobUrl(kycId, reason);
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

  const confirmViewDocument = () => {
    if (!confirmTarget) return;
    const kycId = confirmTarget._id;
    const reason = accessReason;
    setConfirmTarget(null);
    setAccessReason('');
    viewDocument(kycId, reason);
  };

  return (
    <div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-list">
        {subs?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No pending KYC submissions</div>}
        {(subs || []).map((s) => {
          const applicant = typeof s.userId === 'object' ? s.userId : null;
          const revealed = !!revealedIds[s._id];
          return (
            <div key={s._id} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div>{s.firstName || 'Unknown'} {s.lastName || ''}</div>
                <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                  {applicant?.email || 'unknown'} · {(s.idType || 'Unknown').replace('_', ' ')} #{revealed ? (s.idNumber || 'N/A') : maskIdNumber(s.idNumber || '')}
                  {' '}
                  <button
                    type="button"
                    style={{ fontSize: 11, color: 'var(--adm-gold)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setRevealedIds((r) => ({ ...r, [s._id]: !r[s._id] }))}
                  >
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                  {' '}· risk: {s.riskLevel} · {new Date(s.submittedAt).toLocaleString()}
                </div>
                <input
                  className="adm-input"
                  placeholder="Review notes (optional)"
                  style={{ marginTop: 6, maxWidth: 320 }}
                  value={notes[s._id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [s._id]: e.target.value }))}
                />
              </div>
              <button className="adm-btn sm" onClick={() => setConfirmTarget(s)}>View document</button>
              <button className="adm-btn sm grn" onClick={() => review(s._id, 'approved')}>Approve</button>
              <button className="adm-btn sm red" onClick={() => review(s._id, 'rejected')}>Reject</button>
            </div>
          );
        })}
        </div>
      </div>

      {confirmTarget && (
        <AdminModal title="Sensitive PII access" onClose={() => setConfirmTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            🔒 You're about to view <b>{confirmTarget.firstName || 'Unknown'} {confirmTarget.lastName || ''}</b>'s government ID document.
            This access is logged to your admin account.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason (optional)</label>
            <input className="adm-input" value={accessReason} onChange={(e) => setAccessReason(e.target.value)} placeholder="Reviewing rejected KYC appeal, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setConfirmTarget(null)}>Cancel</button>
            <button className="adm-btn gold" onClick={confirmViewDocument}>View document</button>
          </div>
        </AdminModal>
      )}

      {docModal && (
        <AdminModal title="ID document" onClose={closeDocModal} maxWidth={700}>
          <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 8 }}>🔒 Sensitive PII — this view was logged.</div>
          {docModal.loading ? (
            <div style={{ padding: 20 }}>Loading…</div>
          ) : docModal.blobUrl.startsWith('blob:') ? (
            <img src={docModal.blobUrl} alt="ID document" style={{ maxWidth: '100%', borderRadius: 8 }} onError={() => window.open(docModal.blobUrl, '_blank')} />
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="adm-btn" onClick={() => window.open(docModal.blobUrl, '_blank')}>Open in new tab</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

const FUNDS_SOURCE_LABELS: Record<string, string> = {
  mining_staking_rewards: 'Mining/Staking rewards',
  mallpoints_conversion: 'Mallpoints conversion',
  referral_bonus: 'Referral bonus',
  salary: 'Salary/employment',
  business_income: 'Business income',
  gift: 'Gift',
  asset_sale: 'Asset sale',
  other: 'Other',
};

function AmlReviewTab() {
  const [reviews, setReviews] = useState<AdminAmlReview[] | null>(null);
  const [flags, setFlags] = useState<AdminStructuringFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docModal, setDocModal] = useState<{ reviewId: string; blobUrl: string; loading: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<AdminAmlReview | null>(null);
  const [accessReason, setAccessReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const [reviewRes, flagRes] = await Promise.all([
      adminApi.listPendingAmlReviews(),
      adminApi.listStructuringFlags(false),
    ]);
    if (reviewRes.ok && reviewRes.data) setReviews(reviewRes.data.reviews);
    else setError(reviewRes.error || 'Failed to load AML reviews');
    if (flagRes.ok && flagRes.data) setFlags(flagRes.data.flags);
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = (id: string, action: 'approved' | 'rejected') => {
    const note = notes[id];
    scheduleUndoable(async () => {
      const res = await adminApi.reviewAmlSubmission(id, action, note);
      if (res.ok) load();
      else toast(res.error || 'Review failed', false);
    }, `Marking AML review as ${action}…`);
  };

  const acknowledgeFlag = async (id: string) => {
    const res = await adminApi.acknowledgeStructuringFlag(id);
    if (res.ok) load();
    else toast(res.error || 'Failed to acknowledge', false);
  };

  const viewDocument = async (reviewId: string, reason: string) => {
    setDocModal({ reviewId, blobUrl: '', loading: true });
    const res = await withdrawalAmlApi.fetchDocumentBlobUrl(reviewId, reason);
    if (res.ok && res.data) setDocModal({ reviewId, blobUrl: res.data, loading: false });
    else {
      toast(res.error || 'Failed to load document', false);
      setDocModal(null);
    }
  };

  const closeDocModal = () => {
    if (docModal?.blobUrl) URL.revokeObjectURL(docModal.blobUrl);
    setDocModal(null);
  };

  const confirmViewDocument = () => {
    if (!confirmTarget) return;
    const reviewId = confirmTarget._id;
    const reason = accessReason;
    setConfirmTarget(null);
    setAccessReason('');
    viewDocument(reviewId, reason);
  };

  return (
    <div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-list">
        {reviews?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No pending withdrawal verifications</div>}
        {(reviews || []).map((r) => {
          const applicant = typeof r.userId === 'object' ? r.userId : null;
          return (
            <div key={r._id} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div>{applicant?.email || r.walletAddress} · {fmtMoney(r.triggerAmountKes, 'KES')}</div>
                <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                  {FUNDS_SOURCE_LABELS[r.fundsSource] || r.fundsSource}
                  {r.isNativeEarnings ? ' (platform earnings — no document required)' : ''}
                  {' '}· {new Date(r.submittedAt).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginTop: 4, maxWidth: 480 }}>{r.narrative}</div>
                <input
                  className="adm-input"
                  placeholder="Review notes (optional)"
                  style={{ marginTop: 6, maxWidth: 320 }}
                  value={notes[r._id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r._id]: e.target.value }))}
                />
              </div>
              {r.documentRef && <button className="adm-btn sm" onClick={() => setConfirmTarget(r)}>View document</button>}
              <button className="adm-btn sm grn" onClick={() => review(r._id, 'approved')}>Approve</button>
              <button className="adm-btn sm red" onClick={() => review(r._id, 'rejected')}>Reject</button>
            </div>
          );
        })}
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Structuring alerts</h3>
      <div className="adm-card">
        <div className="adm-list">
        {flags?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No unacknowledged structuring alerts</div>}
        {(flags || []).map((f) => (
          <div key={f._id}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13 }}>{f.walletAddress}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                {fmtMoney(f.cumulativeKes, 'KES')} across {f.relatedWithdrawalIds.length} withdrawal(s)
              </div>
            </div>
            <button className="adm-btn sm" onClick={() => acknowledgeFlag(f._id)}>Acknowledge</button>
          </div>
        ))}
        </div>
      </div>

      {confirmTarget && (
        <AdminModal title="Sensitive document access" onClose={() => setConfirmTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            🔒 You're about to view a source-of-funds document for <b>{confirmTarget.walletAddress}</b>'s withdrawal.
            This access is logged.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason (optional)</label>
            <input className="adm-input" value={accessReason} onChange={(e) => setAccessReason(e.target.value)} placeholder="Verifying source of funds, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setConfirmTarget(null)}>Cancel</button>
            <button className="adm-btn gold" onClick={confirmViewDocument}>View document</button>
          </div>
        </AdminModal>
      )}

      {docModal && (
        <AdminModal title="Supporting document" onClose={closeDocModal} maxWidth={700}>
          <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 8 }}>🔒 Sensitive document — this view was logged.</div>
          {docModal.loading ? (
            <div style={{ padding: 20 }}>Loading…</div>
          ) : docModal.blobUrl.startsWith('blob:') ? (
            <img src={docModal.blobUrl} alt="Supporting document" style={{ maxWidth: '100%', borderRadius: 8 }} onError={() => window.open(docModal.blobUrl, '_blank')} />
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="adm-btn" onClick={() => window.open(docModal.blobUrl, '_blank')}>Open in new tab</button>
          </div>
        </AdminModal>
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

  useEffect(() => { load(); }, [load]);

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
      {error && <ErrorCard message={error} />}

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Campaigns</h3>
          <button className="adm-btn gold" onClick={() => setCreateOpen(true)}>＋ Create campaign</button>
        </div>
        <div className="adm-list">
        {(campaigns || []).map((c) => (
          <div key={c._id}>
            <div style={{ flex: 1 }}>
              <div>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{c.rate_per_task} MLPTS/task · budget {fmtNum(c.budget_remaining)} · {c.completions_count} completions</div>
            </div>
            <StatusBadge status={c.status} />
          </div>
        ))}
        </div>
      </div>

      <div className="adm-card">
        <h3>Pending submissions</h3>
        <div className="adm-list">
        {submissions?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>Nothing pending</div>}
        {(submissions || []).map((s) => (
          <div key={s._id}>
            <div style={{ flex: 1 }}>
              <div>{s.title || `Submission ${s._id}`}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{s.description}</div>
            </div>
            <button className="adm-btn sm grn" onClick={() => approve(s._id)}>Approve</button>
            <button className="adm-btn sm red" onClick={() => reject(s._id)}>Reject</button>
          </div>
        ))}
        </div>
      </div>

      {createOpen && (
        <AdminModal title="Create campaign" onClose={() => setCreateOpen(false)}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Title</label>
            <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Description</label>
            <textarea className="adm-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reward per task (MLPTS)</label>
              <input className="adm-input" type="number" value={ratePerTask} onChange={(e) => setRatePerTask(+e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Budget</label>
              <input className="adm-input" type="number" value={budget} onChange={(e) => setBudget(+e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="adm-btn gold" onClick={createCampaign}>Create</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function BadgesTab() {
  const [purchases, setPurchases] = useState<AdminBadgePurchase[] | null>(null);
  const [issuances, setIssuances] = useState<AdminBadgeIssuance[] | null>(null);
  const [currentDesign, setCurrentDesign] = useState<BadgeDesignRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantAddress, setGrantAddress] = useState('');
  const [granting, setGranting] = useState(false);
  const [voidTarget, setVoidTarget] = useState<AdminBadgePurchase | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [approveTarget, setApproveTarget] = useState<AdminBadgePurchase | null>(null);
  const [approveWallet, setApproveWallet] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminBadgePurchase | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designMonth, setDesignMonth] = useState(new Date().getMonth() + 1);
  const [designYear, setDesignYear] = useState(new Date().getFullYear());
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const [purchaseRes, issuanceRes, designRes] = await Promise.all([
      adminApi.listBadgePurchases(),
      adminApi.listBadgeIssuances(),
      adminApi.getBadgeDesign(),
    ]);
    if (purchaseRes.ok && purchaseRes.data) setPurchases(purchaseRes.data.purchases);
    else setError(purchaseRes.error || 'Failed to load badge purchases');
    if (issuanceRes.ok && issuanceRes.data) setIssuances(issuanceRes.data.issuances);
    if (designRes.ok && designRes.data) setCurrentDesign(designRes.data.design);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingPurchases = (purchases || []).filter((p) => p.status === 'awaiting_admin');

  const grant = () => {
    if (!grantAddress.trim()) return toast('Wallet address is required', false);
    const address = grantAddress.trim();
    setGrantAddress('');
    scheduleUndoable(async () => {
      setGranting(true);
      const res = await adminApi.grantBadge(address);
      setGranting(false);
      if (res.ok) load();
      else toast(res.error || 'Grant failed', false);
    }, `Granting a badge to ${address.slice(0, 10)}…`);
  };

  const doApprove = () => {
    if (!approveTarget || !approveWallet.trim()) return;
    const target = approveTarget;
    const wallet = approveWallet.trim();
    setApproveTarget(null);
    setApproveWallet('');
    scheduleUndoable(async () => {
      setApproving(true);
      const res = await adminApi.approveBadge(target.quoteId, wallet);
      setApproving(false);
      if (res.ok) { load(); toast('Badge issued on-chain'); }
      else toast(res.error || 'Approve failed', false);
    }, `Issuing badge to ${wallet.slice(0, 14)}…`);
  };

  const doReject = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    const target = rejectTarget;
    const reason = rejectReason.trim();
    setRejectTarget(null);
    setRejectReason('');
    scheduleUndoable(async () => {
      setRejecting(true);
      const res = await adminApi.rejectBadge(target.quoteId, reason);
      setRejecting(false);
      if (res.ok) { load(); toast('Purchase rejected'); }
      else toast(res.error || 'Reject failed', false);
    }, `Rejecting purchase ${target.quoteId}…`);
  };

  const doVoid = () => {
    if (!voidTarget || !voidReason.trim()) return;
    const target = voidTarget;
    const reason = voidReason.trim();
    setVoidTarget(null);
    setVoidReason('');
    scheduleUndoable(async () => {
      const res = await adminApi.voidBadgePurchase(target.quoteId, reason);
      if (res.ok) { load(); toast('Purchase voided'); }
      else toast(res.error || 'Void failed', false);
    }, `Voiding purchase ${target.quoteId}…`);
  };

  const doUploadDesign = async () => {
    if (!designFile) return toast('Select a badge image first', false);
    setUploading(true);
    const res = await adminApi.uploadBadgeDesign(designFile, designMonth, designYear);
    setUploading(false);
    if (res.ok) {
      toast('Badge design uploaded');
      setDesignFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } else {
      toast(res.error || 'Upload failed', false);
    }
  };

  return (
    <div>
      {error && <ErrorCard message={error} />}

      {pendingPurchases.length > 0 && (
        <div className="adm-card" style={{ marginBottom: 16, borderColor: 'rgba(0, 200, 255, 0.3)' }}>
          <h3>Pending approvals ({pendingPurchases.length})</h3>
          <div className="adm-list">
            {pendingPurchases.map((p) => (
              <div key={p._id}>
                <div style={{ flex: 1 }}>
                  <div className="mono" style={{ fontSize: 13 }}>{p.walletAddress}</div>
                  <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                    {p.phone} · KSh {p.fiatAmount} · {new Date(p.createdAt).toLocaleString()}
                    {p.mpesaRef && <> · ref <b>{p.mpesaRef}</b></>}
                  </div>
                  <div style={{ fontSize: 11, color: '#00c8ff', marginTop: 2 }}>
                    Payment confirmed — awaiting your approval
                  </div>
                </div>
                <button className="adm-btn sm" style={{ background: 'rgba(0, 200, 255, 0.15)', color: '#00c8ff' }} onClick={() => { setApproveTarget(p); setApproveWallet(p.walletAddress); }}>Approve</button>
                <button className="adm-btn sm red" onClick={() => setRejectTarget(p)}>Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h3>Badge design</h3>
        <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 8 }}>
          Upload a new badge image (PNG or SVG, max 2MB). This replaces the current monthly design.
        </div>
        {currentDesign && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={currentDesign.imageUrl} alt="Current badge" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--adm-border)' }} />
            <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
              Current: {currentDesign.originalName || 'badge'} · {currentDesign.month}/{currentDesign.year}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={(e) => setDesignFile(e.target.files?.[0] || null)} style={{ fontSize: 12, color: 'var(--adm-muted)' }} />
          <input className="adm-input" type="number" min={1} max={12} value={designMonth} onChange={(e) => setDesignMonth(Number(e.target.value))} style={{ width: 60 }} placeholder="Month" />
          <input className="adm-input" type="number" min={2024} max={2099} value={designYear} onChange={(e) => setDesignYear(Number(e.target.value))} style={{ width: 80 }} placeholder="Year" />
          <button className="adm-btn gold" onClick={doUploadDesign} disabled={uploading || !designFile}>{uploading ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h3>Grant badge manually</h3>
        <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 8 }}>
          For support cases (missed streak, goodwill gesture, etc). Issues on-chain.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="adm-input" style={{ flex: 1 }} placeholder="mall1…" value={grantAddress} onChange={(e) => setGrantAddress(e.target.value)} disabled={granting} />
          <button className="adm-btn gold" onClick={grant} disabled={granting}>{granting && '…'} Grant</button>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h3>Issuances</h3>
        <div className="adm-list">
        {issuances?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No badges issued yet</div>}
        {(issuances || []).map((i) => (
          <div key={i._id}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13 }}>{i.walletAddress}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{i.badgeType} · {new Date(i.issuedAt).toLocaleString()}{i.txHash && <> · {i.txHash.slice(0, 12)}…</>}</div>
            </div>
            <StatusBadge status={i.method} />
          </div>
        ))}
        </div>
      </div>

      <div className="adm-card">
        <h3>All purchases</h3>
        <div className="adm-list">
        {purchases?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No purchases yet</div>}
        {(purchases || []).map((p) => (
          <div key={p._id}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13 }}>{p.walletAddress}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{p.phone} · KSh {p.fiatAmount} · {new Date(p.createdAt).toLocaleString()}{p.mpesaRef && <> · ref {p.mpesaRef}</>}</div>
            </div>
            <StatusBadge status={p.status} />
            {p.status === 'awaiting_admin' && (
              <>
                <button className="adm-btn sm" style={{ background: 'rgba(0, 200, 255, 0.15)', color: '#00c8ff' }} onClick={() => { setApproveTarget(p); setApproveWallet(p.walletAddress); }}>Approve</button>
                <button className="adm-btn sm red" onClick={() => setRejectTarget(p)}>Reject</button>
              </>
            )}
            {p.status !== 'issued' && p.status !== 'awaiting_admin' && <button className="adm-btn sm red" onClick={() => setVoidTarget(p)}>Void</button>}
          </div>
        ))}
        </div>
      </div>

      {approveTarget && (
        <AdminModal title="Approve badge issuance" onClose={() => { setApproveTarget(null); setApproveWallet(''); }}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)', marginBottom: 12 }}>
            Issue badge to wallet for purchase <b className="mono">{approveTarget.quoteId}</b>.
            Payment of KSh {approveTarget.fiatAmount} confirmed{approveTarget.mpesaRef && <> (ref {approveTarget.mpesaRef})</>}.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Wallet address</label>
            <input className="adm-input" value={approveWallet} onChange={(e) => setApproveWallet(e.target.value)} placeholder="mall1…" autoFocus />
            {approveWallet !== approveTarget.walletAddress && approveWallet && (
              <div style={{ fontSize: 11, color: '#f5a623', marginTop: 4 }}>
                Warning: differs from the original purchase wallet
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => { setApproveTarget(null); setApproveWallet(''); }}>Cancel</button>
            <button className="adm-btn" style={{ background: 'rgba(0, 200, 255, 0.15)', color: '#00c8ff' }} onClick={doApprove} disabled={approving || !approveWallet.trim()}>{approving ? 'Issuing…' : 'Issue badge'}</button>
          </div>
        </AdminModal>
      )}

      {rejectTarget && (
        <AdminModal title="Reject badge purchase" onClose={() => { setRejectTarget(null); setRejectReason(''); }}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)', marginBottom: 12 }}>
            Reject purchase <b className="mono">{rejectTarget.quoteId}</b> for <b className="mono">{rejectTarget.walletAddress}</b>?
            The user will be notified.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason</label>
            <input className="adm-input" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Suspected fraud, payment mismatch, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Cancel</button>
            <button className="adm-btn red" onClick={doReject} disabled={rejecting || !rejectReason.trim()}>{rejecting ? 'Rejecting…' : 'Confirm reject'}</button>
          </div>
        </AdminModal>
      )}

      {voidTarget && (
        <AdminModal title="Void badge purchase" onClose={() => setVoidTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            Void purchase <b className="mono">{voidTarget.quoteId}</b> for <b className="mono">{voidTarget.walletAddress}</b>?
            This marks it failed — does not affect any on-chain badge.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason</label>
            <input className="adm-input" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Refund requested, duplicate quote, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setVoidTarget(null)}>Cancel</button>
            <button className="adm-btn red" onClick={doVoid}>Confirm void</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function LiquidityActivityTab() {
  const [items, setItems] = useState<LiquidityActivityItem[] | null>(null);
  const [flow, setFlow] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [debouncedWallet, setDebouncedWallet] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedWallet(walletAddress), 400);
    return () => clearTimeout(t);
  }, [walletAddress]);

  const load = useCallback(() => {
    adminApi.listLiquidityActivity({
      flow: flow || undefined,
      limit: 200,
      walletAddress: debouncedWallet || undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
    }).then((res) => {
      if (res.ok && res.data) setItems(res.data.items);
      else setError(res.error || 'Failed to load liquidity activity');
    });
  }, [flow, debouncedWallet, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = useCallback(() => {
    const rows = [['id', 'flow', 'stage', 'status', 'walletAddress', 'amountMlcns', 'fiatAmount', 'currency', 'createdAt'].join(',')];
    (items || []).forEach((it) =>
      rows.push(
        [it._id, it.flow, it.stage, it.status, it.walletAddress || '', it.amountMlcns ?? '', it.fiatAmount ?? '', it.currency || '', new Date(it.createdAt).toISOString()].join(',')
      )
    );
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liquidity-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [items]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['', 'buy', 'withdraw', 'reconciliation', 'mallpoints_convert'].map((f) => (
          <button key={f || 'all'} className={`adm-btn sm ${flow === f ? 'gold' : ''}`} onClick={() => setFlow(f)}>{f || 'All'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="adm-input" type="search" placeholder="Filter by wallet address (mall1…)" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} style={{ flex: '1 1 260px', minWidth: 220 }} />
        <input className="adm-input" type="date" placeholder="From" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className="adm-input" type="date" placeholder="To" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className="adm-btn sm" onClick={exportCsv} disabled={!items || items.length === 0}>⬇ Export CSV</button>
      </div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-list">
        {items?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No liquidity activity yet</div>}
        {(items || []).map((it) => (
          <div key={it._id}>
            <div style={{ flex: 1 }}>
              <div>{it.flow} · {it.stage}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                {it.walletAddress || '—'} · {fmtNum(it.amountMlcns || 0)} MLCNS
                {it.fiatAmount ? ` · ${fmtMoney(it.fiatAmount, it.currency || 'KES')}` : ''}
                {' · '}{new Date(it.createdAt).toLocaleString()}
              </div>
            </div>
            <StatusBadge status={it.status} />
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function ReconciliationTab() {
  const [items, setItems] = useState<ReconciliationItem[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ReconciliationItem | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

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

  const doResolve = async () => {
    if (!resolveTarget || !resolveNote.trim()) return;
    setResolving(true);
    const res = await adminApi.resolveReconciliationItem(resolveTarget._id, resolveNote.trim());
    setResolving(false);
    if (res.ok) { toast('Marked resolved'); load(); } else toast(res.error || 'Failed to resolve', false);
    setResolveTarget(null);
    setResolveNote('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'detected', 'compensating', 'pending_manual', 'resolved'].map((s) => (
            <button key={s || 'all'} className={`adm-btn sm ${status === s ? 'gold' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
          ))}
        </div>
        <button className="adm-btn sm" onClick={runNow} disabled={running}>{running ? 'Running…' : 'Run reconciliation now'}</button>
      </div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-list">
        {items?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>Nothing to reconcile</div>}
        {(items || []).map((it) => (
          <div key={it._id}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13 }}>{it.walletAddress}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                {fmtNum(it.mlcnsAmount)} MLCNS / {fmtMoney(it.fiatAmount, 'KES')} · {it.reason || 'liquidity add failed'}
                {' · '}{new Date(it.createdAt).toLocaleString()}
                {it.status === 'resolved' && it.resolutionNote && <> · resolved: {it.resolutionNote}</>}
              </div>
            </div>
            <StatusBadge status={it.status} />
            {it.status !== 'resolved' && <button className="adm-btn sm" onClick={() => setResolveTarget(it)}>Resolve</button>}
          </div>
        ))}
        </div>
      </div>

      {resolveTarget && (
        <AdminModal title="Resolve reconciliation item" onClose={() => setResolveTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            Mark <b className="mono">{resolveTarget.walletAddress}</b>'s {fmtNum(resolveTarget.mlcnsAmount)} MLCNS item resolved.
            This is a record only — does not perform any on-chain reversal.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Resolution note</label>
            <input className="adm-input" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Manually re-added liquidity, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setResolveTarget(null)}>Cancel</button>
            <button className="adm-btn gold" onClick={doResolve} disabled={resolving || !resolveNote.trim()}>{resolving && '…'} Confirm resolved</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function WithdrawalsTab() {
  const [items, setItems] = useState<AdminWithdrawalRequest[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<AdminWithdrawalRequest | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<'completed' | 'refunded'>('refunded');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(() => {
    adminApi.listWithdrawals(status || undefined).then((res) => {
      if (res.ok && res.data) setItems(res.data.withdrawals);
      else setError(res.error || 'Failed to load withdrawals');
    });
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const doRetry = async (w: AdminWithdrawalRequest) => {
    setRetryingId(w._id);
    const res = await adminApi.retryWithdrawal(w._id);
    setRetryingId(null);
    if (res.ok) { toast('Payout retried'); load(); } else toast(res.error || 'Retry failed', false);
  };

  const doResolve = async () => {
    if (!resolveTarget || !resolveNote.trim()) return;
    setResolving(true);
    const res = await adminApi.resolveWithdrawal(resolveTarget._id, resolveOutcome, resolveNote.trim());
    setResolving(false);
    if (res.ok) { toast('Withdrawal updated'); load(); } else toast(res.error || 'Failed to update', false);
    setResolveTarget(null);
    setResolveNote('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['', 'pending_review', 'payout_initiated', 'completed', 'failed', 'refunded'].map((s) => (
          <button key={s || 'all'} className={`adm-btn sm ${status === s ? 'gold' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        <div className="adm-list">
        {items?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No withdrawal requests</div>}
        {(items || []).map((w) => (
          <div key={w._id}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13 }}>{w.walletAddress} · {w.phone}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>
                {fmtNum(w.amountMlcns)} MLCNS → {fmtMoney(w.amountKes, w.currency || 'KES')}
                {w.payoutRef ? ` · ref ${w.payoutRef}` : ''}
                {' · '}{new Date(w.createdAt).toLocaleString()}
                {w.notes && <> · {w.notes}</>}
              </div>
            </div>
            <StatusBadge status={w.status} />
            {w.status === 'failed' && (
              <>
                <button className="adm-btn sm" onClick={() => doRetry(w)} disabled={retryingId === w._id}>
                  {retryingId === w._id && '…'} Retry
                </button>
                <button className="adm-btn sm" onClick={() => { setResolveTarget(w); setResolveOutcome('refunded'); }}>Resolve</button>
              </>
            )}
          </div>
        ))}
        </div>
      </div>

      {resolveTarget && (
        <AdminModal title="Resolve withdrawal" onClose={() => setResolveTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--adm-muted)' }}>
            Record how <b className="mono">{resolveTarget.walletAddress}</b>'s failed {fmtMoney(resolveTarget.amountKes, resolveTarget.currency || 'KES')}
            {' '}withdrawal was settled. This does not move any money.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Outcome</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`adm-btn sm ${resolveOutcome === 'completed' ? 'gold' : ''}`} onClick={() => setResolveOutcome('completed')}>Completed (paid manually)</button>
              <button className={`adm-btn sm ${resolveOutcome === 'refunded' ? 'gold' : ''}`} onClick={() => setResolveOutcome('refunded')}>Refunded</button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Note</label>
            <input className="adm-input" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Sent via manual M-Pesa transfer, ref ABC123, etc." autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setResolveTarget(null)}>Cancel</button>
            <button className="adm-btn gold" onClick={doResolve} disabled={resolving || !resolveNote.trim()}>{resolving && '…'} Confirm</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

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
      {error && <ErrorCard message={error} />}

      {metrics && metrics.length > 0 && (
        <div className="adm-kpis" style={{ marginBottom: 16 }}>
          {metrics.map((m) => (
            <div key={`${m.activity}-${m.direction}`} className="adm-kpi">
              <small>{m.activity} · {m.direction}</small>
              <b>{fmtNum(m.totalAmount)}</b>
              <small>{m.count} entries</small>
            </div>
          ))}
        </div>
      )}

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h3>Burn Policies</h3>
        <div className="adm-list">
        {(policies || []).map((p) => (
          <div key={p._id}>
            <div style={{ flex: 1 }}>
              <div>{p.activity}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{p.burnPercentage}% · {p.description || 'no description'}</div>
            </div>
            <StatusBadge status={p.enabled ? 'active' : 'disabled'} />
            <button className="adm-btn sm" onClick={() => removePolicy(p.activity)}>Remove</button>
          </div>
        ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--adm-line)' }}>
          <select className="adm-select" value={newPolicy.activity} onChange={(e) => setNewPolicy((s) => ({ ...s, activity: e.target.value }))}>
            {['marketplace_purchase', 'wallet_transfer', 'cash_out', 'validator_penalty', 'lost_recovery'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="adm-input" type="number" min={0} max={100} placeholder="Burn %" value={newPolicy.burnPercentage}
            onChange={(e) => setNewPolicy((s) => ({ ...s, burnPercentage: Number(e.target.value) }))} style={{ width: 90 }} />
          <input className="adm-input" placeholder="Description" value={newPolicy.description}
            onChange={(e) => setNewPolicy((s) => ({ ...s, description: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
          <button className="adm-btn sm gold" onClick={savePolicy}>Save</button>
        </div>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h3>Dynamic Burn Thresholds</h3>
        <div className="adm-list">
        {(thresholds || []).map((t) => (
          <div key={t._id}>
            <div style={{ flex: 1 }}>
              <div>{t.activity} · supply ≥ {fmtNum(t.supplyThreshold)}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{t.burnPercentage}% burn</div>
            </div>
            <StatusBadge status={t.enabled ? 'active' : 'disabled'} />
            <button className="adm-btn sm" onClick={() => removeThreshold(t._id)}>Remove</button>
          </div>
        ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--adm-line)' }}>
          <select className="adm-select" value={newThreshold.activity} onChange={(e) => setNewThreshold((s) => ({ ...s, activity: e.target.value }))}>
            {['cash_out', 'marketplace_purchase', 'wallet_transfer'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="adm-input" type="number" placeholder="Supply threshold" value={newThreshold.supplyThreshold}
            onChange={(e) => setNewThreshold((s) => ({ ...s, supplyThreshold: Number(e.target.value) }))} style={{ width: 160 }} />
          <input className="adm-input" type="number" min={0} max={100} placeholder="Burn %" value={newThreshold.burnPercentage}
            onChange={(e) => setNewThreshold((s) => ({ ...s, burnPercentage: Number(e.target.value) }))} style={{ width: 90 }} />
          <button className="adm-btn sm gold" onClick={saveThreshold}>Save</button>
        </div>
      </div>

      <div className="adm-card">
        <h3>Ledger</h3>
        <div className="adm-list">
        {(ledger || []).length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No ledger entries yet</div>}
        {(ledger || []).map((l) => (
          <div key={l._id}>
            <div style={{ flex: 1 }}>
              <div>{l.activity}</div>
              <div style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{l.description || '—'} · {new Date(l.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ fontWeight: 600 }}>{l.direction === 'outflow' ? '−' : '+'}{fmtNum(l.amount)}</div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [channels, setChannels] = useState({ email: true, sms: false, whatsapp: false, inApp: true });
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !message.trim()) return toast('Title and message are required', false);
    setSending(true);
    const res = await adminApi.broadcastNotification({ title, message, type, channels });
    setSending(false);
    if (res.ok) {
      toast(`Broadcast sent to ${res.data?.recipientCount || 0} recipients`);
      setTitle(''); setMessage('');
    } else {
      toast(res.error || 'Failed to send broadcast', false);
    }
  };

  return (
    <div className="adm-card" style={{ maxWidth: 600 }}>
      <h3>Broadcast notification</h3>
      <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 16 }}>
        Send a notification to all users. Choose which channels to use.
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Title</label>
        <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="System update, maintenance notice, etc." />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Message</label>
        <textarea className="adm-textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Detailed message…" rows={4} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Type</label>
        <select className="adm-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="alert">Alert</option>
          <option value="success">Success</option>
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Channels</label>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} />
            Email
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={channels.sms} onChange={(e) => setChannels({ ...channels, sms: e.target.checked })} />
            SMS
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={channels.whatsapp} onChange={(e) => setChannels({ ...channels, whatsapp: e.target.checked })} />
            WhatsApp
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={channels.inApp} onChange={(e) => setChannels({ ...channels, inApp: e.target.checked })} />
            In-app
          </label>
        </div>
      </div>
      <button className="adm-btn gold" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send broadcast'}</button>
    </div>
  );
}

function EmergencyTab() {
  const [maint, setMaint] = useState<MaintenanceState | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.getMaintenance().then((res) => {
      if (res.ok && res.data) {
        setMaint(res.data);
        setReason(res.data.reason || '');
      } else {
        setError(res.error || 'Failed to load maintenance state');
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleGlobal = async (checked: boolean) => {
    setSaving('global');
    const res = await adminApi.setMaintenance({ global: checked, reason });
    setSaving(null);
    if (res.ok && res.data) setMaint(res.data);
    else toast(res.error || 'Failed to update', false);
  };

  const toggleScope = async (scope: string, paused: boolean) => {
    setSaving(scope);
    const res = await adminApi.setMaintenance({ scope, paused, reason });
    setSaving(null);
    if (res.ok && res.data) setMaint(res.data);
    else toast(res.error || 'Failed to update', false);
  };

  if (error) return <ErrorCard message={error} />;
  if (!maint) return <div style={{ padding: 20 }}>Loading…</div>;

  const scopes = ['send', 'withdraw', 'buy', 'payment', 'marketplace', 'staking', 'vault', 'key-vault', 'badge', 'dex'];

  return (
    <div>
      {maint.global && (
        <div style={{
          background: 'rgba(255, 122, 112, 0.12)',
          border: '1px solid var(--adm-bad)',
          borderRadius: 12,
          padding: '14px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--adm-bad)', marginBottom: 2 }}>
              SYSTEM LOCKED — All user access is blocked
            </div>
            <div style={{ fontSize: 13, color: 'var(--adm-text)' }}>
              {reason || 'No reason provided'}
              {maint.updatedBy && <span style={{ color: 'var(--adm-muted)' }}> — {maint.updatedBy}</span>}
            </div>
          </div>
          <button
            className="adm-btn"
            disabled={saving === 'global'}
            onClick={() => toggleGlobal(false)}
            style={{ background: 'var(--adm-bad)', color: '#1a0505', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {saving === 'global' ? 'Unlocking…' : 'Unlock system'}
          </button>
        </div>
      )}

      <div className="adm-card" style={maint.global ? { borderColor: 'var(--adm-bad)' } : undefined}>
        <h3>Global system lock</h3>
        <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginBottom: 12 }}>
          Pausing the entire system blocks all routes for every user (enforced server-side) and shows a banner app-wide.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label className="adm-switch">
            <input type="checkbox" checked={maint.global} disabled={saving === 'global'} onChange={(e) => toggleGlobal(e.target.checked)} />
            <span className="track" />
            <span className="knob" />
          </label>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Global pause</span>
          {maint.global ? <StatusBadge status="active" /> : <span style={{ fontSize: 12, color: 'var(--adm-ok)' }}>System operational</span>}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Reason (shown to users)</label>
          <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Scheduled maintenance, security incident, etc." />
        </div>
        {maint.updatedBy && <div style={{ fontSize: 12, color: 'var(--adm-muted)', marginTop: 8 }}>Last changed by {maint.updatedBy}{maint.updatedAt ? ' at ' + new Date(maint.updatedAt).toLocaleString() : ''}</div>}
      </div>

      <div className="adm-card">
        <h3>Per-scope emergency controls</h3>
        <p className="adm-muted">Each switch needs dual authorization. Switch role to approve as a second admin.</p>
        <div className="adm-tw">
          <table>
            <thead><tr><th>Control</th><th>Scope</th><th>Status</th><th /> </tr></thead>
            <tbody>
              {scopes.map((scope) => {
                const paused = !!maint.scopes[scope];
                return (
                  <tr key={scope}>
                    <td>{scope}</td>
                    <td>{scope}</td>
                    <td><StatusBadge status={paused ? 'paused' : 'normal'} /></td>
                    <td className="act">
                      {paused ? (
                        <button className="adm-btn sm grn" disabled={saving === scope} onClick={() => toggleScope(scope, false)}>Resume</button>
                      ) : (
                        <button className="adm-btn sm red" disabled={saving === scope} onClick={() => toggleScope(scope, true)}>Pause</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
      {error && <ErrorCard message={error} />}
      <div className="adm-card">
        {logs?.length === 0 && <div style={{ color: 'var(--adm-muted)', padding: 20, textAlign: 'center' }}>No audit entries yet</div>}
        <div className="adm-tw">
          <table>
            <thead><tr><th>Action</th><th>Actor</th><th>Outcome</th><th>Time</th></tr></thead>
            <tbody>
              {(logs || []).map((l) => (
                <tr key={l._id}>
                  <td>{l.action}</td>
                  <td>{l.actor}</td>
                  <td><StatusBadge status={l.outcome} /></td>
                  <td>{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
