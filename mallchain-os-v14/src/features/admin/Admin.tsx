import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, Modal, StatusChip, toast } from '../../components/ui';

/** Admin Control Center — feature flags (app-wide), users freeze/flag,
 *  transactions monitor, announcements broadcast, validators/campaigns. */
export default function Admin() {
  useStoreVersion();
  const st = store.state;
  const [users] = useState([
    { name: 'Amina Wanjiru', email: 'amina@x.com', frozen: false, flagged: false },
    { name: 'Brian Mwangi', email: 'brian@x.com', frozen: false, flagged: true },
    { name: 'Grace Achieng', email: 'grace@x.com', frozen: true, flagged: false },
    { name: 'Samuel Kipchoge', email: 'sam@x.com', frozen: false, flagged: false },
  ]);
  const [annText, setAnnText] = useState('');
  const [confirmUser, setConfirmUser] = useState<string | null>(null);
  const [confirmAnn, setConfirmAnn] = useState(false);

  const setFlag = (key: string, val: boolean) => {
    st.admin.flags[key] = val;
    store.commit();
    toast(`Flag "${key}" → ${val ? 'ON' : 'OFF'} (applied app-wide)`);
  };

  const toggleFreeze = (name: string) => {
    const u = users.find((x) => x.name === name);
    if (!u) return;
    setConfirmUser(name);
  };

  const broadcast = () => {
    if (!annText.trim()) { toast('Announcement text is required', false); return; }
    st.admin.announcements.unshift({ id: 'ann' + Date.now(), text: annText.trim(), ts: Date.now() });
    store.commit();
    setAnnText('');
    setConfirmAnn(false);
    toast('Announcement broadcast — global banner shown to all users');
  };

  const FLAGS = [
    { key: 'maintenance', t: 'Maintenance mode', d: 'Shows a global warning banner and blocks new transactions app-wide' },
    { key: 'tradingFreeze', t: 'Trading freeze', d: 'Blocks swap operations in the wallet' },
    { key: 'hideMarketplace', t: 'Hide marketplace', d: 'Removes the Marketplace nav item for all users' },
  ];

  return (
    <div>
      <div className="view-head"><h1>Admin Control Center</h1><span className="sub">network oversight & moderation</span></div>

      <div className="stat-grid">
        <div className="card"><div className="card-label">Network status</div><div className="card-value up">Healthy</div><div className="card-sub">1.48M blocks · 157 validators</div></div>
        <div className="card"><div className="card-label">Total wallets</div><div className="card-value">84,203</div><div className="card-sub">+312 this week</div></div>
        <div className="card"><div className="card-label">Pending disputes</div><div className="card-value" style={{ color: 'var(--gold)' }}>3</div><div className="card-sub">2 orders · 1 validator appeal</div></div>
        <div className="card"><div className="card-label">Campaigns live</div><div className="card-value">{fmtNum(st.mines.campaigns.length)}</div><div className="card-sub">all verified</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Feature flags</h2><span className="sub">toggle behavior app-wide</span></div>
          {FLAGS.map((f) => (
            <div key={f.key} className="flag-row">
              <div className="desc"><div className="t">{f.t}</div><div className="m">{f.d}</div></div>
              <label className="switch">
                <input type="checkbox" checked={!!st.admin.flags[f.key]} onChange={(e) => setFlag(f.key, e.target.checked)} />
                <span className="track" />
                <span className="knob" />
              </label>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="sec-title"><h2>Announcements</h2><span className="sub">broadcast a dismissible global banner</span></div>
          {st.admin.announcements.length > 0 && (
            <div className="card mb" style={{ background: 'var(--bg-2)' }}>
              <b style={{ fontSize: 12.5 }}>Current banner</b>
              <div style={{ fontSize: 13, color: 'var(--txt-2)', margin: '4px 0' }}>{st.admin.announcements[0].text}</div>
              <button className="btn btn-danger btn-sm" onClick={() => { st.admin.announcements.shift(); store.commit(); }}>Dismiss</button>
            </div>
          )}
          <textarea className="input" rows={3} placeholder="Write an announcement to broadcast…" value={annText} onChange={(e) => setAnnText(e.target.value)} />
          <button className="btn btn-primary btn-block mt" onClick={() => setConfirmAnn(true)}>📢 Broadcast announcement</button>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>Users</h2><span className="sub">freeze / flag with confirm modals</span></div>
        <table className="tbl">
          <thead><tr><th>User</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.name}>
                <td><b>{u.name}</b><div className="tiny">{u.email}</div></td>
                <td>{u.frozen ? <span className="frozen-badge">❄ Frozen</span> : u.flagged ? <span className="chip red">Flagged</span> : <span className="chip green">Active</span>}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleFreeze(u.name)}>{u.frozen ? 'Unfreeze' : 'Freeze'}</button>
                  <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => { u.flagged = !u.flagged; store.commit(); toast(u.flagged ? 'User flagged' : 'Flag removed'); }}>{u.flagged ? 'Unflag' : 'Flag'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>Transactions monitor</h2><span className="sub">latest network activity</span></div>
        {st.txs.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>No transactions yet.</div>}
        {st.txs.slice(0, 6).map((t) => (
          <div key={t.id} className="list-row">
            <div className="grow"><div className="t">{t.type} {t.amount} {t.asset}</div><div className="m mono">{t.note || ''}</div></div>
            <StatusChip status={t.status} />
          </div>
        ))}
      </div>

      {confirmUser && (
        <Modal title="Confirm user action" onClose={() => setConfirmUser(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>Freeze <b>{confirmUser}</b>? Frozen users see a banner and their actions are blocked app-wide.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmUser(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => {
              const u = users.find((x) => x.name === confirmUser);
              if (u) { u.frozen = !u.frozen; store.commit(); toast(u.frozen ? `${confirmUser} frozen` : `${confirmUser} unfrozen`); }
              setConfirmUser(null);
            }}>Confirm freeze</button>
          </div>
        </Modal>
      )}

      {confirmAnn && (
        <Modal title="Broadcast announcement" onClose={() => setConfirmAnn(false)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>Broadcast <b>{annText}</b> to all users as a dismissible global banner?</p>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setConfirmAnn(false)}>Cancel</button><button className="btn btn-primary" onClick={broadcast}>Broadcast</button></div>
        </Modal>
      )}
    </div>
  );
}
