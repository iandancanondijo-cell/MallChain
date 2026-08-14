import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, StatusChip, Modal, toast } from '../../components/ui';
import {
  adminApi,
  type CurrentUser,
  type AdminDashboardStats,
  type AdminUser,
  type AdminValidatorApplication,
  type AdminCampaign,
  type AdminSubmission,
  type AuditLogEntry,
} from '../../services/adminApi';

type Tab = 'dashboard' | 'users' | 'validators' | 'mining' | 'audit' | 'local';

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
        <button className={tab === 'validators' ? 'on' : ''} onClick={() => setTab('validators')}>Validator Applications</button>
        <button className={tab === 'mining' ? 'on' : ''} onClick={() => setTab('mining')}>Mining</button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit Log</button>
        <button className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')}>Local Banners</button>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab isSuperAdmin={isSuperAdmin} />}
      {tab === 'validators' && <ValidatorApplicationsTab />}
      {tab === 'mining' && <MiningTab meId={me.id} />}
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
                  {isSuperAdmin ? (
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
