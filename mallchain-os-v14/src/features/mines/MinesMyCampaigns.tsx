import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, StatusChip, Stepper, Modal, toast } from '../../components/ui';

/** My Campaigns — creator analytics + create campaign form. */
export default function MinesMyCampaigns() {
  useStoreVersion();
  const st = store.state;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [reward, setReward] = useState(25);
  const [budget, setBudget] = useState(5000);
  const [desc, setDesc] = useState('');

  const created = st.mines.created;
  const analytics = (cid: string) => {
    const c = st.mines.campaigns.find((x) => x.id === cid);
    const a = st.mines.campAnalytics[cid] || { views: 48210, clicks: 6942, trend: [820, 910, 760, 1040, 980, 1210, 1345] };
    const parts = st.mines.participations.filter((p) => p.campaign === cid).length;
    const subs = st.mines.submissions.filter((s) => s.campaign === cid);
    const approved = subs.filter((s) => s.status === 'approved').length;
    const rejected = subs.filter((s) => s.status === 'rejected').length;
    const ctr = (a.clicks / a.views) * 100;
    const conv = (parts / a.views) * 100;
    const spent = Math.min(c?.budget || budget, c?.spent || 0);
    const spp = parts ? spent / parts : 0;
    const comp = parts ? ((parts - subs.filter((s) => s.status === 'voting').length) / parts) * 100 : 0;
    const vacc = subs.length ? (approved / (approved + rejected)) * 100 : 99.1;
    return { views: a.views, clicks: a.clicks, ctr, conv, spp, spent, comp, vacc, trend: a.trend };
  };

  const createCampaign = () => {
    if (!name.trim() || !desc.trim()) { toast('Name and description are required', false); return; }
    const id = 'c' + Date.now().toString().slice(-4);
    st.mines.campaigns.unshift({
      id, name, creator: st.user.name, reward, platform, participants: 0, max: 5000, remaining: 5000,
      diff: 'Medium', eta: '1 minute', validators: 18, verified: true,
      desc, conf: 98, completion: 0, avgApprove: '—', rpm: 0, reputation: 4.5, trust: st.validators.reputation.trust || 80, country: 'KE',
    });
    st.mines.created.unshift({ id, name, budget, spent: 0, status: 'live' });
    st.mines.campAnalytics[id] = { views: 0, clicks: 0, trend: [0, 0, 0, 0, 0, 0, 0] };
    store.commit();
    setCreateOpen(false);
    setName(''); setDesc('');
    toast(`Campaign "${name}" is live — awaiting participants`);
  };

  return (
    <div>
      <div className="view-head">
        <h1>My Campaigns</h1>
        <span className="sub">Creator analytics</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setCreateOpen(true)}>＋ Create campaign</button>
      </div>

      {created.length === 0 && (
        <div className="empty-state"><div className="es-ico">📣</div><div className="es-t">You haven't created any campaigns</div><div className="es-m">Launch your first campaign and track views, CTR and conversion.</div><button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Create your first campaign</button></div>
      )}

      {created.length > 0 && (
        <div className="stat-grid">
          <div className="card"><div className="card-label">Total views</div><div className="card-value">{fmtNum(created.reduce((a, c) => a + analytics(c.id).views, 0))}</div><div className="card-sub">across {created.length} campaigns</div></div>
          <div className="card"><div className="card-label">Avg CTR</div><div className="card-value up">{(created.reduce((a, c) => a + analytics(c.id).ctr, 0) / created.length).toFixed(1)}%</div><div className="card-sub">clicks / views</div></div>
          <div className="card"><div className="card-label">Avg conversion</div><div className="card-value up">{(created.reduce((a, c) => a + analytics(c.id).conv, 0) / created.length).toFixed(1)}%</div><div className="card-sub">participants / views</div></div>
          <div className="card"><div className="card-label">Budget health</div><div className="card-value">{created.reduce((a, c) => a + c.spent, 0)} / {fmtNum(created.reduce((a, c) => a + c.budget, 0))} <span className="unit">USD-M</span></div><div className="card-sub">spend per participant {created.reduce((a, c) => a + analytics(c.id).spp, 0).toFixed(2)}</div></div>
        </div>
      )}

      {created.map((c) => {
        const a = analytics(c.id);
        return (
          <div key={c.id} className="card mb">
            <div className="row">
              <div className="grow"><b>{c.name}</b> <StatusChip status={c.status} /></div>
              <span className="chip">Budget {fmtNum(c.budget)} USD-M · spent {fmtNum(c.spent)}</span>
            </div>
            <div className="grid-3 mt">
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">Views</div><div className="card-value" style={{ fontSize: 17 }}>{fmtNum(a.views)}</div></div>
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">CTR</div><div className="card-value" style={{ fontSize: 17 }}>{a.ctr.toFixed(1)}%</div></div>
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">Conversion</div><div className="card-value" style={{ fontSize: 17 }}>{a.conv.toFixed(1)}%</div></div>
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">Spend / participant</div><div className="card-value" style={{ fontSize: 17 }}>{a.spp.toFixed(2)}</div></div>
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">Completion</div><div className="card-value" style={{ fontSize: 17 }}>{a.comp.toFixed(1)}%</div></div>
              <div className="card" style={{ background: 'var(--bg-2)' }}><div className="card-label">Validator accuracy</div><div className="card-value" style={{ fontSize: 17 }}>{a.vacc.toFixed(1)}%</div></div>
            </div>
            <div className="tiny mt">7-day trend: {a.trend.join(' → ')}</div>
          </div>
        );
      })}

      {createOpen && (
        <Modal title="Create campaign" onClose={() => setCreateOpen(false)}>
          <div className="field"><label>Campaign name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram Follow Campaign" /></div>
          <div className="field"><label>Platform</label>
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {['Instagram', 'TikTok', 'Telegram', 'Facebook', 'X / Twitter', 'YouTube', 'LinkedIn'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="field"><label>Reward per participant: {reward} MLPTS</label><input type="range" min={5} max={200} step={5} value={reward} onChange={(e) => setReward(+e.target.value)} style={{ width: '100%', accentColor: 'var(--gold)' }} /></div>
            <div className="field"><label>Budget: {budget} USD-M</label><input type="range" min={500} max={50000} step={500} value={budget} onChange={(e) => setBudget(+e.target.value)} style={{ width: '100%', accentColor: 'var(--gold)' }} /></div>
          </div>
          <div className="field"><label>Description / rules</label><textarea className="input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What should participants do?" /></div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={createCampaign}>Launch campaign</button></div>
        </Modal>
      )}
    </div>
  );
}
