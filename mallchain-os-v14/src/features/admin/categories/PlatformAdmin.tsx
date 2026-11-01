/**
 * PlatformAdmin — the super-admin "Platform" window (#/admin?cat=platform).
 *
 * Gives the super admin one live surface for everything that used to be
 * orphaned or dead-coded:
 *   • emergency maintenance mode (global + per-scope) — /api/admin/maintenance
 *   • broadcast announcements     — /api/admin/notifications/broadcast
 *   • audit log viewer            — /api/admin/audit
 *   • reconciliation items + run  — /api/admin/reconciliation/*
 *   • role & category management  — /api/admin/users/:id/role, /:id/category
 *   • badge design upload         — /api/admin/badges/design
 *   • cross-category KPI overview — /api/admin/dashboard (superadmin-only,
 *     which is exactly who this window is gated to)
 *
 * Ported from the retired features/admin/Admin.tsx (maintenance + broadcast
 * logic) — that component was unreachable UI; the endpoints it called were
 * real. Every section here shows live data or an explicit error banner.
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/adminApi';
import type {
  AdminDashboardStats,
  AdminUser,
  AuditLogEntry,
  BadgeDesignRecord,
  IntegrityStatus,
  IntegrityVerifyResult,
  MaintenanceState,
  ReconciliationItem,
} from '../../../services/adminApi';
import { fmtNum, Modal, toast } from '../../../components/ui';
import { store } from '../../../store/store';
import { AdminErrorBanner, collectErrors, displayPii } from '../adminShared';

const MAINTENANCE_SCOPES = ['send', 'withdraw', 'buy', 'payment', 'marketplace', 'staking', 'vault', 'key-vault', 'badge', 'dex'];

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function PlatformAdmin() {
  const me = store.state.user;
  if (me.role !== 'superadmin') {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>Super admin only</h2>
        <p style={{ color: 'var(--txt-3)' }}>
          The Platform window controls emergency pauses, broadcasts and role
          assignment — it's restricted to the superadmin account.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div className="sec-title">
        <h2>Platform Control</h2>
        <span className="sub">system-wide operations — maintenance, broadcasts, audit trail, reconciliation, roles, badges</span>
        <span className="chip gold" style={{ marginLeft: 'auto' }}>superadmin</span>
      </div>
      <OverviewSection />
      <MaintenanceSection />
      <BroadcastSection />
      <ReconciliationSection />
      <AuditSection />
      <IntegritySection />
      <RolesSection />
      <BadgeDesignSection />
    </div>
  );
}

// ---------------------------------------------------------------- overview --

function OverviewSection() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

  const load = async () => {
    const r = await adminApi.getDashboard();
    if (r.ok && r.data) setStats(r.data.stats);
    setErrors(collectErrors([['platform dashboard stats', r]]));
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <AdminErrorBanner errors={errors} />
      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Users</div>
          <div className="card-value">{stats ? fmtNum(stats.users.total) : '—'}</div>
          <div className="card-sub">{stats ? `${stats.users.admins} admins · ${stats.users.banned} banned` : 'live from /dashboard'}</div>
        </div>
        <div className="card">
          <div className="card-label">Pending validator apps</div>
          <div className="card-value">{stats ? stats.validators.pending : '—'}</div>
          <div className="card-sub">{stats ? `${stats.validators.active} active` : ''}</div>
        </div>
        <div className="card">
          <div className="card-label">Pending mining subs</div>
          <div className="card-value">{stats ? stats.mining.pendingSubmissions : '—'}</div>
          <div className="card-sub">{stats ? `${stats.mining.totalCampaigns} campaigns total` : ''}</div>
        </div>
        <div className="card">
          <div className="card-label">Newest account</div>
          <div className="card-value" style={{ fontSize: 15 }}>
            {stats?.recentUsers?.[0] ? stats.recentUsers[0].email : '—'}
          </div>
          <div className="card-sub">{stats?.recentUsers?.[0] ? timeAgo(stats.recentUsers[0].createdAt) : ''}</div>
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------- maintenance --

function MaintenanceSection() {
  const [maint, setMaint] = useState<MaintenanceState | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

  const load = async () => {
    const r = await adminApi.getMaintenance();
    if (r.ok && r.data) {
      setMaint(r.data);
      setReason(r.data.reason || '');
      setErrors([]);
    } else {
      setErrors(collectErrors([['maintenance state', r]]));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setGlobal = async (on: boolean) => {
    setBusy(true);
    const r = await adminApi.setMaintenance({ global: on, reason: on ? (reason.trim() || 'Scheduled maintenance') : '' });
    if (r.ok && r.data) {
      setMaint(r.data);
      setReason(r.data.reason || '');
      toast(on ? 'Maintenance mode ENABLED platform-wide' : 'Maintenance mode disabled');
    } else {
      toast(r.error || 'Failed to change maintenance mode', false);
    }
    setBusy(false);
  };

  const toggleScope = async (scope: string, on: boolean) => {
    setBusy(true);
    const r = await adminApi.setMaintenance({ scope, paused: on, reason: reason.trim() || undefined });
    if (r.ok && r.data) {
      setMaint(r.data);
      toast(`${scope} ${on ? 'paused' : 'resumed'}`);
    } else {
      toast(r.error || 'Failed to toggle scope', false);
    }
    setBusy(false);
  };

  const activeScopes = Object.entries(maint?.scopes || {}).filter(([, v]) => v);

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Maintenance mode</h2>
        <span className="sub">emergency pause for money-moving surfaces — live from the backend</span>
        <span className={`chip ${maint?.global ? 'red' : activeScopes.length ? 'gold' : 'green'}`} style={{ marginLeft: 'auto' }}>
          {maint ? (maint.global ? 'GLOBAL PAUSE' : activeScopes.length ? `${activeScopes.length} scope(s) paused` : 'running normally') : '—'}
        </span>
      </div>
      <AdminErrorBanner errors={errors} />
      {maint && (
        <>
          <div className="flag-row">
            <div className="desc">
              <div className="t">Global maintenance</div>
              <div className="m">{maint.global ? `ON — ${maint.reason || 'no reason given'}` : 'Platform running normally'}</div>
            </div>
            <label className="switch" title={busy ? 'busy' : 'toggle global maintenance'}>
              <input type="checkbox" checked={!!maint.global} disabled={busy} onChange={(e) => void setGlobal(e.target.checked)} />
              <span className="track" />
              <span className="knob" />
            </label>
          </div>
          <input
            className="input mt"
            placeholder="Reason shown to users while maintenance is on"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MAINTENANCE_SCOPES.map((scope) => (
              <button
                key={scope}
                className={`btn btn-sm ${maint.scopes?.[scope] ? 'btn-danger' : 'btn-ghost'}`}
                disabled={busy}
                onClick={() => void toggleScope(scope, !maint.scopes?.[scope])}
                title={maint.scopes?.[scope] ? `${scope} is PAUSED — click to resume` : `pause ${scope}`}
              >
                {scope}: {maint.scopes?.[scope] ? 'paused' : 'live'}
              </button>
            ))}
          </div>
          {maint.updatedAt && (
            <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
              Last changed {timeAgo(maint.updatedAt)}{maint.updatedBy ? ` by ${displayPii(maint.updatedBy)}` : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ broadcast --

function BroadcastSection() {
  const [annTitle, setAnnTitle] = useState('');
  const [annText, setAnnText] = useState('');
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<{ title: string; recipients: number; at: string } | null>(null);

  const send = async () => {
    setBusy(true);
    const r = await adminApi.broadcastNotification({
      title: annTitle.trim() || 'Mallchain announcement',
      message: annText.trim(),
      type: 'system',
      channels: { inApp, email },
    });
    setBusy(false);
    if (r.ok && r.data) {
      toast(`Announcement sent to ${fmtNum(r.data.recipientCount)} user${r.data.recipientCount === 1 ? '' : 's'}`);
      setLastSent({ title: annTitle.trim() || 'Mallchain announcement', recipients: r.data.recipientCount, at: new Date().toISOString() });
      setAnnTitle('');
      setAnnText('');
      setConfirm(false);
    } else {
      toast(r.error || 'Broadcast failed', false);
    }
  };

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Broadcast announcement</h2>
        <span className="sub">creates a real in-app notification row for every active user</span>
      </div>
      <input className="input" placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
      <textarea
        className="input mt"
        rows={3}
        placeholder="Write an announcement to broadcast…"
        value={annText}
        onChange={(e) => setAnnText(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--txt-2)' }}>
        <label><input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} /> in-app</label>
        <label><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> email (if provider configured)</label>
      </div>
      <button className="btn btn-primary mt" onClick={() => (annText.trim() ? setConfirm(true) : toast('Message is required', false))}>
        Broadcast announcement
      </button>
      {lastSent && (
        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
          Last broadcast this session: “{lastSent.title}” → {fmtNum(lastSent.recipients)} recipients at {new Date(lastSent.at).toLocaleTimeString()}
        </div>
      )}
      {confirm && (
        <Modal title="Broadcast announcement" onClose={() => setConfirm(false)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Send <b>{annTitle.trim() || 'Mallchain announcement'}</b> to every non-banned user?
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Broadcast'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// -------------------------------------------------------------- reconciliation --

function ReconciliationSection() {
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<ReconciliationItem | null>(null);
  const [resolveNote, setResolveNote] = useState('');

  const load = async () => {
    const r = await adminApi.listReconciliationItems(statusFilter || undefined);
    if (r.ok && r.data) {
      setItems(r.data.items);
      setErrors([]);
    } else {
      setErrors(collectErrors([['reconciliation items', r]]));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const run = async () => {
    setRunning(true);
    const r = await adminApi.runReconciliation();
    setRunning(false);
    if (r.ok) {
      toast('Reconciliation job finished');
      setLastRun(new Date().toISOString());
      void load();
    } else {
      toast(r.error || 'Reconciliation run failed', false);
    }
  };

  const resolve = async () => {
    if (!resolveTarget || !resolveNote.trim()) return;
    const r = await adminApi.resolveReconciliationItem(resolveTarget._id, resolveNote.trim());
    if (r.ok) {
      toast('Item marked resolved (record-keeping only)');
      setResolveTarget(null);
      setResolveNote('');
      void load();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  const openItems = items.filter((i) => i.status !== 'resolved').length;

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Reconciliation</h2>
        <span className="sub">
          {openItems} open of {items.length} shown · a scheduled job also runs this automatically — this button triggers an extra pass and lets you inspect results
        </span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void load()}>Refresh</button>
      </div>
      <AdminErrorBanner errors={errors} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" disabled={running} onClick={() => void run()}>
          {running ? 'Running…' : 'Run reconciliation now'}
        </button>
        {lastRun && <span className="tiny" style={{ color: 'var(--txt-3)' }}>last manual run {timeAgo(lastRun)}</span>}
        <select className="input" style={{ width: 'auto', marginLeft: 'auto', padding: '6px 10px', fontSize: 12 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="detected">detected</option>
          <option value="compensating">compensating</option>
          <option value="pending_manual">pending manual</option>
          <option value="resolved">resolved</option>
        </select>
      </div>
      {!items.length && (
        <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
          No reconciliation items{statusFilter ? ` with status "${statusFilter}"` : ''} — either nothing has drifted or the job hasn't run yet on this build.
        </div>
      )}
      {items.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Purchase</th><th>Wallet</th><th>MLCNS</th><th>Reason</th><th>Status</th><th>When</th><th>Action</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i._id}>
                <td className="tiny mono">{i.purchaseId?.slice(0, 14) || '—'}</td>
                <td className="tiny mono">{i.walletAddress ? `${i.walletAddress.slice(0, 10)}…` : '—'}</td>
                <td className="num">{i.mlcnsAmount}</td>
                <td className="tiny" style={{ maxWidth: 200 }}>{i.reason || '—'}</td>
                <td>
                  <span className={`chip ${i.status === 'resolved' ? 'green' : i.status === 'pending_manual' ? 'red' : 'gold'}`}>{i.status}</span>
                </td>
                <td className="tiny">{timeAgo(i.createdAt)}</td>
                <td>
                  {i.status !== 'resolved' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setResolveTarget(i); setResolveNote(''); }}>Resolve</button>
                  ) : (
                    <span className="tiny" title={i.resolutionNote}>by {i.resolvedBy ? String(i.resolvedBy).slice(-6) : '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {resolveTarget && (
        <Modal title="Resolve reconciliation item" onClose={() => setResolveTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Record-keeping only — this does NOT move funds. Document how item{' '}
            <b className="mono">{resolveTarget.purchaseId?.slice(0, 16) || resolveTarget._id}</b> was settled out-of-band.
          </p>
          <textarea className="input" rows={3} placeholder="Resolution note (required)…" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setResolveTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void resolve()}>Mark resolved</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- audit log --

function AuditSection() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);

  const load = async (p = page) => {
    const r = await adminApi.getAuditLog({
      limit: 50,
      page: p,
      action: actionFilter.trim() || undefined,
      actor: actorFilter.trim() || undefined,
    });
    if (r.ok && r.data) {
      setLogs(r.data.logs);
      setTotal(r.data.total);
      setPage(p);
      setErrors([]);
    } else {
      setErrors(collectErrors([['audit log', r]]));
    }
  };

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Audit log</h2>
        <span className="sub">{fmtNum(total)} entries · every admin action is recorded here</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void load(0)}>Refresh</button>
      </div>
      <AdminErrorBanner errors={errors} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input" placeholder="Filter by action (e.g. kyc_review)" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
        <input className="input" placeholder="Filter by actor email" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => void load(0)}>Apply</button>
      </div>
      {!logs.length && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No matching audit entries.</div>}
      {logs.map((l) => (
        <div key={l._id} className="list-row">
          <div className="grow">
            <div className="t mono">{l.action}</div>
            <div className="m tiny">
              actor: {l.actor} · outcome: {String(l.outcome || 'success')}
            </div>
            {l.details != null && (
              <div className="tiny mono" style={{ color: 'var(--txt-3)', wordBreak: 'break-all' }}>
                {typeof l.details === 'string' ? l.details : JSON.stringify(l.details).slice(0, 220)}
              </div>
            )}
          </div>
          <span className="tiny" style={{ color: 'var(--txt-3)' }}>{timeAgo(l.createdAt)}</span>
        </div>
      ))}
      {total > logs.length && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => void load(page - 1)}>← Newer</button>
          <span className="tiny" style={{ alignSelf: 'center', color: 'var(--txt-3)' }}>page {page + 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={(page + 1) * 50 >= total} onClick={() => void load(page + 1)}>Older →</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------- role & category mgmt --

function RolesSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const me = store.state.user;

  const load = async (q?: string) => {
    const r = await adminApi.listUsers(q ? { search: q } : undefined);
    if (r.ok && r.data) {
      setUsers(r.data.users.filter((u) => u._id !== me.id));
      setErrors([]);
    } else {
      setErrors(collectErrors([['user list (roles)', r]]));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setRole = async (u: AdminUser, role: 'user' | 'admin' | 'superadmin') => {
    setBusy(u._id);
    const r = await adminApi.setUserRole(u._id, role);
    setBusy(null);
    if (r.ok) {
      toast(`${u.email} → ${role}`);
      void load(search);
    } else {
      toast(r.error || 'Failed to change role', false);
    }
  };

  const setCategory = async (u: AdminUser, adminCategory: string) => {
    setBusy(u._id);
    const r = await adminApi.reassignCategory(u._id, adminCategory);
    setBusy(null);
    if (r.ok) {
      toast(`${u.email} → ${adminCategory} window`);
      void load(search);
    } else {
      toast(r.error || 'Failed to reassign category', false);
    }
  };

  const cats = ['users', 'blockchain', 'validator', 'kyc', 'mining', 'treasury', 'marketplace', 'mlpts', 'reports'];

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Roles &amp; category assignment</h2>
        <span className="sub">promote/demote admins and move them between category windows</span>
      </div>
      <AdminErrorBanner errors={errors} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search by email or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(search); }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => void load(search)}>Search</button>
      </div>
      <table className="tbl">
        <thead>
          <tr><th>User</th><th>Role</th><th>Category window</th><th>Status</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>
                <b>{u.username || u.email}</b>
                <div className="tiny">{u.email}</div>
              </td>
              <td>
                <select
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
                  value={u.role}
                  disabled={busy === u._id || u.role === 'superadmin'}
                  onChange={(e) => void setRole(u, e.target.value as 'user' | 'admin' | 'superadmin')}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                  <option value="superadmin" disabled>superadmin</option>
                </select>
              </td>
              <td>
                {u.role === 'admin' ? (
                  <select
                    className="input"
                    style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
                    value={u.adminCategory || ''}
                    disabled={busy === u._id}
                    onChange={(e) => void setCategory(u, e.target.value)}
                  >
                    <option value="" disabled>assign…</option>
                    {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <span className="tiny" style={{ color: 'var(--txt-3)' }}>—</span>
                )}
              </td>
              <td>{u.banned ? <span className="chip red">banned</span> : <span className="chip green">active</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny mt" style={{ color: 'var(--txt-3)' }}>
        Use “Create category admin” in the <a href="#/admin?cat=users">Users window</a> to provision a new scoped admin account.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- badge design --

function BadgeDesignSection() {
  const [design, setDesign] = useState<BadgeDesignRecord | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [busy, setBusy] = useState(false);
  const [imgKey, setImgKey] = useState(Date.now());

  const load = async () => {
    const r = await adminApi.getBadgeDesign();
    if (r.ok && r.data) {
      setDesign(r.data.design);
      setErrors([]);
    } else {
      setErrors(collectErrors([['badge design', r]]));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    const r = await adminApi.uploadBadgeDesign(file);
    setBusy(false);
    if (r.ok && r.data) {
      toast('Badge design updated — new badge is live for next issuances');
      setDesign(r.data.design);
      setImgKey(Date.now());
    } else {
      toast(r.error || 'Upload failed', false);
    }
  };

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Badge design</h2>
        <span className="sub">the image minted onto on-chain badges for the current month</span>
      </div>
      <AdminErrorBanner errors={errors} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {design ? (
          <img
            src={`${adminApi.badgeDesignImageUrl()}&orig=${encodeURIComponent(String(design.imageUrl))}`}
            alt="Active badge design"
            style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 12, background: 'rgba(255,255,255,0.05)', padding: 6 }}
            key={imgKey}
          />
        ) : (
          <div className="tiny" style={{ color: 'var(--txt-3)' }}>No badge design uploaded yet — issuances fall back to the built-in motif.</div>
        )}
        <div>
          {design && (
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              {design.month}/{design.year} · uploaded {timeAgo(design.createdAt)} · {design.active ? 'active' : 'inactive'}
            </div>
          )}
          <label className="btn btn-ghost btn-sm mt" style={{ cursor: busy ? 'wait' : 'pointer', display: 'inline-block' }}>
            {busy ? 'Uploading…' : 'Upload new design (PNG/JPG)'}
            <input
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- integrity --

function IntegritySection() {
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [verify, setVerify] = useState<IntegrityVerifyResult | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof collectErrors>>([]);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    const r = await adminApi.getIntegrityStatus();
    if (r.ok && r.data) {
      setStatus(r.data);
      setErrors([]);
    } else {
      setErrors(collectErrors([['integrity status', r]]));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runVerify = async () => {
    setVerifying(true);
    const r = await adminApi.runIntegrityVerify();
    setVerifying(false);
    if (r.ok && r.data) {
      setVerify(r.data);
      toast(r.data.valid ? 'Integrity check PASSED — chain recomputes clean from genesis' : 'Integrity check FAILED — see divergence details', r.data.valid);
    } else {
      toast(r.error || 'Verification failed to run', false);
    }
  };

  const ok = verify ? verify.valid : status?.chain.valid;
  const divergence = verify?.firstDivergence || status?.chain.firstDivergence || null;
  const anchorIssue = verify?.anchorChain?.broken ? verify.anchorChain : null;

  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>Chain integrity</h2>
        <span className="sub">tamper-evident audit ledger — hash-chained, on-chain anchored</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void load()}>Refresh</button>
      </div>
      <AdminErrorBanner errors={errors} />

      {status && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="t mono">{status.chain.length} entries</div>
            <div className="m tiny">head seq #{status.chain.headSeq}</div>
          </div>
          <div style={{ maxWidth: 320 }}>
            <div className="t tiny mono" style={{ wordBreak: 'break-all' }}>{status.chain.headHash || '—'}</div>
            <div className="m tiny">head hash</div>
          </div>
          <div>
            <div className="t tiny">
              {status.anchors.lastConfirmedAt
                ? `last anchored ${new Date(status.anchors.lastConfirmedAt).toISOString().slice(0, 10)}`
                : status.anchors.last
                  ? `anchor pending/failed (${status.anchors.last.status}, ${status.anchors.last.date})`
                  : 'never anchored'}
            </div>
            <div className="m tiny">on-chain witness {status.anchors.total} recorded</div>
          </div>
          <span className={`chip ${status.mode === 'anchored' ? 'gold' : ''}`} style={{ color: status.mode === 'anchored' ? undefined : 'var(--error)' }}>
            {status.mode === 'anchored' ? 'anchored' : 'unanchored-mode'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={verifying} onClick={() => void runVerify()}>
          {verifying ? 'Recomputing from genesis…' : 'Run verification'}
        </button>
        {ok != null && (
          <span className="chip" style={{ color: ok ? 'var(--success)' : 'var(--error)' }}>
            {ok ? 'PASS — chain recomputes clean' : 'FAIL — tampering evidence found'}
          </span>
        )}
      </div>

      {(divergence || anchorIssue || (verify && verify.anchorMismatch)) && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--error)' }}>
          <div className="t" style={{ color: 'var(--error)' }}>First divergence</div>
          {divergence && (
            <div className="tiny mono" style={{ wordBreak: 'break-all' }}>seq {divergence.seq}: {divergence.reason}</div>
          )}
          {anchorIssue && (
            <div className="tiny mono" style={{ wordBreak: 'break-all' }}>anchor chain: {String(anchorIssue.reason)}{anchorIssue.seq != null ? ` (head seq ${anchorIssue.seq})` : ''}</div>
          )}
          {verify && verify.anchorMismatch && (
            <div className="tiny" style={{ color: 'var(--error)' }}>
              An on-chain anchor no longer matches this database — the public chain contradicts local data.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 16, background: 'rgba(255,255,255,0.03)' }}>
        <div className="t" style={{ marginBottom: 8 }}>What this proves — and what it can't</div>
        <div className="tiny" style={{ color: 'var(--txt-3)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Proves:</strong> every privileged action (KYC/AML decisions, bans, role changes, treasury
            ops, withdrawals, broadcasts, badge issuances, conversions) is written into an append-only hash
            chain — each entry commits to all before it, so editing, deleting or reordering any historical
            entry breaks every hash after it. Verification above recomputes the whole chain from genesis and
            shows the exact first divergence. Daily head hashes are published on the Mallchain as real
            transactions, so even rewriting the <em>entire</em> database into a different
            "self-consistent" chain is contradicted by the public on-chain witness — the anchors themselves
            are hash-chained and HMAC-signed for the gap before the first confirmed broadcast.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Cannot prevent:</strong> while backend and database run on one machine under one
            operator, no software can <em>stop</em> that operator from altering data — anyone with root and
            mongosh can edit storage below the application. This system makes tampering <strong>detectable
            and forensic</strong>, not impossible: the evidence outlives the edit and lives publicly on the
            chain. Missing an ANCHOR_HMAC_SECRET or any confirmed anchor degrades to
            "unanchored-mode" — internal consistency only.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Roadmap to real prevention:</strong> a multi-validator set with this audit head anchored
            by independent operators (external witnessing the witnessing), plus DB-level write-path
            separation (separate audit writer with its own credentials). Until then, treat
            "chain length unchanged but head moved without an anchor" as the red flag it is.
          </p>
        </div>
      </div>
    </div>
  );
}
