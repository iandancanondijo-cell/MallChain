import { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import type { AdminDashboardStats, AdminUser, ChainBlock, ChainStatus, MaintenanceState } from '../../services/adminApi';
import { fmtNum, Modal, toast } from '../../components/ui';
import { store } from '../../store/store';

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Admin Control Center — every figure comes from the live backend (/api/admin/*).
 *  Maintenance and broadcasts require superadmin (enforced server-side). */
export default function Admin() {
  const me = store.state.user;
  const isSuper = me.role === 'superadmin';

  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [blocks, setBlocks] = useState<ChainBlock[]>([]);
  const [maint, setMaint] = useState<MaintenanceState | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annText, setAnnText] = useState('');
  const [confirmAnn, setConfirmAnn] = useState(false);
  const [maintReason, setMaintReason] = useState('');

  const load = async (q?: string) => {
    setLoading(true);
    const [d, c, b, m, u] = await Promise.all([
      adminApi.getDashboard(),
      adminApi.getChainStatus(),
      adminApi.getChainBlocks(8),
      adminApi.getMaintenance(),
      adminApi.listUsers(q ? { search: q } : undefined),
    ]);
    if (d.ok && d.data) setStats(d.data.stats);
    if (c.ok && c.data) setChain(c.data.status);
    if (b.ok && b.data) setBlocks(b.data.blocks);
    if (m.ok && m.data) { setMaint(m.data); setMaintReason(m.data.reason || ''); }
    if (u.ok && u.data) { setUsers(u.data.users); setUsersTotal(u.data.total); }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const setMaintenance = async (on: boolean) => {
    const r = await adminApi.setMaintenance({ global: on, reason: on ? (maintReason.trim() || 'Scheduled maintenance') : '' });
    if (r.ok && r.data) {
      setMaint(r.data);
      setMaintReason(r.data.reason || '');
      toast(on ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
    } else {
      toast(r.error || 'Failed to change maintenance mode', false);
    }
  };

  const broadcast = async () => {
    if (!annText.trim()) { toast('Announcement message is required', false); return; }
    const r = await adminApi.broadcastNotification({
      title: annTitle.trim() || 'Mallchain announcement',
      message: annText.trim(),
      channels: { inApp: true },
    });
    if (r.ok && r.data) {
      toast(`Announcement sent to ${fmtNum(r.data.recipientCount)} user${r.data.recipientCount === 1 ? '' : 's'}`);
      setAnnTitle('');
      setAnnText('');
      setConfirmAnn(false);
    } else {
      toast(r.error || 'Broadcast failed', false);
    }
  };

  const ban = async () => {
    if (!banTarget) return;
    const r = await adminApi.banUser(banTarget._id, true, banReason.trim() || undefined);
    if (r.ok) {
      toast(`${banTarget.email} banned`);
      setBanTarget(null);
      setBanReason('');
      void load(search);
    } else {
      toast(r.error || 'Ban failed', false);
    }
  };

  const unban = async (u: AdminUser) => {
    const r = await adminApi.banUser(u._id, false);
    if (r.ok) { toast(`${u.email} unbanned`); void load(search); }
    else toast(r.error || 'Unban failed', false);
  };

  const canBan = (u: AdminUser) => u._id !== me.id && u.role !== 'superadmin';

  return (
    <div>
      <div className="view-head">
        <h1><img src="/favicon.svg" alt="" width={26} height={26} style={{ verticalAlign: '-7px', marginRight: 10 }} />Admin Control Center</h1>
        <span className="sub">live network oversight — every figure comes from the backend</span>
      </div>

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Network status</div>
          <div className={'card-value' + (chain && !chain.syncing ? ' up' : '')}>
            {chain ? (chain.syncing ? 'Syncing' : 'Healthy') : '—'}
          </div>
          <div className="card-sub">
            {chain
              ? `${fmtNum(chain.blockHeight)} blocks · ${chain.peerCount} peers · ${chain.chainId}`
              : loading ? 'loading.........' : 'Chain status unavailable'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Total wallets</div>
          <div className="card-value">{stats ? fmtNum(stats.users.total) : '—'}</div>
          <div className="card-sub">{stats ? `${stats.users.admins} admins · ${stats.users.banned} banned` : loading ? 'loading.........' : 'User stats unavailable'}</div>
        </div>
        <div className="card">
          <div className="card-label">Pending reviews</div>
          <div className="card-value" style={{ color: 'var(--gold)' }}>
            {stats ? fmtNum(stats.validators.pending + stats.mining.pendingSubmissions) : '—'}
          </div>
          <div className="card-sub">{stats ? `${stats.validators.pending} validator apps · ${stats.mining.pendingSubmissions} mining submissions` : '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">Mining campaigns</div>
          <div className="card-value">{stats ? fmtNum(stats.mining.totalCampaigns) : '—'}</div>
          <div className="card-sub">{stats ? 'registered on the platform' : '—'}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Maintenance mode</h2><span className="sub">real backend-wide pause</span></div>
          {maint ? (
            <>
              <div className="flag-row">
                <div className="desc">
                  <div className="t">Global maintenance</div>
                  <div className="m">{maint.global ? `ON — ${maint.reason || 'no reason given'}` : 'Platform running normally'}</div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={!!maint.global} disabled={!isSuper} onChange={(e) => void setMaintenance(e.target.checked)} />
                  <span className="track" />
                  <span className="knob" />
                </label>
              </div>
              {isSuper ? (
                <input className="input mt" placeholder="Reason shown to users while maintenance is on" value={maintReason} onChange={(e) => setMaintReason(e.target.value)} />
              ) : (
                <div className="tiny" style={{ color: 'var(--txt-3)' }}>Only super admins can change maintenance mode.</div>
              )}
              {maint.updatedAt && (
                <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
                  Last changed {timeAgo(maint.updatedAt)}{maint.updatedBy ? ` by ${maint.updatedBy}` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="empty" style={{ color: 'var(--txt-3)', padding: 16 }}>{loading ? 'loading.........' : 'Maintenance state unavailable.'}</div>
          )}
        </div>

        <div className="card">
          <div className="sec-title"><h2>Announcements</h2><span className="sub">delivered as real in-app notifications</span></div>
          {isSuper ? (
            <>
              <input className="input" placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
              <textarea className="input mt" rows={3} placeholder="Write an announcement to broadcast…" value={annText} onChange={(e) => setAnnText(e.target.value)} />
              <button className="btn btn-primary btn-block mt" onClick={() => setConfirmAnn(true)}>Broadcast announcement</button>
            </>
          ) : (
            <div className="empty" style={{ color: 'var(--txt-3)', padding: 16 }}>Only super admins can broadcast announcements.</div>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>Users</h2><span className="sub">{fmtNum(usersTotal)} accounts · live from the database</span></div>
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
          <thead><tr><th>User</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td><b>{u.username || u.email}</b><div className="tiny">{u.email}</div></td>
                <td>{u.role}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                <td>{u.banned ? <span className="chip red">Banned</span> : <span className="chip green">Active</span>}</td>
                <td>
                  {u.banned ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => void unban(u)}>Unban</button>
                  ) : canBan(u) ? (
                    <button className="btn btn-danger btn-sm" onClick={() => { setBanTarget(u); setBanReason(''); }}>Ban</button>
                  ) : (
                    <span className="tiny" style={{ color: 'var(--txt-3)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No users match this search.</div>}
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>Transactions monitor</h2><span className="sub">latest blocks from the chain</span></div>
        {blocks.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>{loading ? 'loading.........' : 'No block data available.'}</div>}
        {blocks.map((b) => (
          <div key={b.height} className="list-row">
            <div className="grow">
              <div className="t mono">#{fmtNum(b.height)} — {b.txCount} txs</div>
              <div className="m tiny mono">{b.hash.slice(0, 18)}… · {b.proposer}</div>
            </div>
            <span className="chip green">finalized</span>
            <span className="tiny" style={{ color: 'var(--txt-3)', marginLeft: 8 }}>{timeAgo(b.time)}</span>
          </div>
        ))}
      </div>

      {banTarget && (
        <Modal title="Ban user" onClose={() => setBanTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Ban <b>{banTarget.email}</b>? They will be signed out and blocked from signing back in.
          </p>
          <textarea className="input" rows={2} placeholder="Reason (stored on the account)…" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setBanTarget(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => void ban()}>Confirm ban</button>
          </div>
        </Modal>
      )}

      {confirmAnn && (
        <Modal title="Broadcast announcement" onClose={() => setConfirmAnn(false)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Send <b>{annTitle.trim() || 'Mallchain announcement'}</b> as an in-app notification to every user?
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmAnn(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void broadcast()}>Broadcast</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
