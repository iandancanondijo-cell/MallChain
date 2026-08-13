import { useState } from 'react';
import { store, type AppState, type Campaign, type Participation } from '../../store/store';
import { useStoreVersion, ScoreRing, Modal, Stepper, StatusChip, toast } from '../../components/ui';

const PLATFORMS = ['Instagram', 'TikTok', 'Telegram', 'Facebook', 'X / Twitter', 'YouTube', 'LinkedIn'];
const PL_ICO: Record<string, string> = { Instagram: '📸', TikTok: '🎵', Telegram: '✈️', Facebook: '📘', 'X / Twitter': '🐦', YouTube: '▶️', LinkedIn: '💼' };
const COUNTRIES = ['KE', 'Global'];

function participationFor(st: AppState, cid: string): Participation | undefined {
  return st.mines.participations.find((p) => p.campaign === cid);
}

/** Discover — real filters + Campaign Intelligence + My Submission inline panel. */
export default function MinesDiscover({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const [q, setQ] = useState('');
  const [pf, setPf] = useState('');
  const [rf, setRf] = useState('');
  const [df, setDf] = useState('');
  const [vf, setVf] = useState(false);
  const [cf, setCf] = useState('');
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [participating, setParticipating] = useState<Campaign | null>(null);

  let list = st.mines.campaigns.slice();
  if (q) list = list.filter((c) => (c.name + c.creator + c.platform).toLowerCase().includes(q.toLowerCase()));
  if (pf) list = list.filter((c) => c.platform === pf);
  if (rf === '0-20') list = list.filter((c) => c.reward <= 20);
  else if (rf === '20-50') list = list.filter((c) => c.reward > 20 && c.reward <= 50);
  else if (rf === '50+') list = list.filter((c) => c.reward > 50);
  if (df) list = list.filter((c) => c.diff === df);
  if (vf) list = list.filter((c) => c.verified);
  if (cf) list = list.filter((c) => c.country === cf || c.country === 'Global');

  const join = (c: Campaign) => setParticipating(c);
  const appeal = (p: Participation) => {
    // appeal: create a resubmission → voting
    const seq = st.mines.submissions.length + 9001;
    st.mines.submissions.unshift({
      id: '#44' + seq, pid: p.id, campaign: p.campaign, wallet: st.wallet.address || '0x7A9f…D6f8',
      ai: 97, human: 0, need: 18, status: 'voting', reason: null, reward: p.reward, plat: st.mines.campaigns.find((c) => c.id === p.campaign)?.platform || '',
    });
    p.status = 'pending';
    p.steps = 5;
    p.appealAvailable = false;
    store.commit();
    toast('Appeal resubmitted — back in the validator queue');
  };

  return (
    <div>
      <div className="view-head">
        <h1>Discover Campaigns</h1>
        <span className="sub" id="mcDiscoverCount">{list.length} campaigns</span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/validator-queue')}>🛂 Validator queue</button>
      </div>

      <div className="filter-row">
        <input className="input search" placeholder="Search campaigns…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={pf} onChange={(e) => setPf(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="input" value={rf} onChange={(e) => setRf(e.target.value)}>
          <option value="">All rewards</option>
          <option value="0-20">≤ 20 MLPTS</option>
          <option value="20-50">20–50 MLPTS</option>
          <option value="50+">50+ MLPTS</option>
        </select>
        <select className="input" value={df} onChange={(e) => setDf(e.target.value)}>
          <option value="">All difficulty</option>
          <option>Easy</option><option>Medium</option><option>Hard</option>
        </select>
        <select className="input" value={cf} onChange={(e) => setCf(e.target.value)}>
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={vf} onChange={(e) => setVf(e.target.checked)} /> Verified only</label>
        <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setPf(''); setRf(''); setDf(''); setVf(false); setCf(''); }}>Reset</button>
      </div>

      {list.length === 0 && (
        <div className="empty-state"><div className="es-ico">🧭</div><div className="es-t">No campaigns match your filters</div><div className="es-m">Try clearing filters or searching for a different platform.</div></div>
      )}

      <div className="c-grid">
        {list.map((c) => {
          const joined = participationFor(store.state, c.id);
          return (
            <div key={c.id} className="c-card">
              <div className="c-banner">
                <span className="pl-ico">{PL_ICO[c.platform] || '🌐'}</span>
                <div><div className="nm">{c.name}</div><div className="cr">by {c.creator}</div></div>
                <div className="rv">{c.reward}<small>MLPTS</small></div>
              </div>
              <div className="c-body">
                <div className="c-meta">
                  <span><b>{c.participants.toLocaleString()}</b> participants</span>
                  <span><b>{c.remaining}</b> remaining</span>
                  <span className={c.diff === 'Easy' ? 'c-diff-easy' : c.diff === 'Medium' ? 'c-diff-medium' : 'c-diff-hard'}>{c.diff}</span>
                  <span>⏱ {c.eta}</span>
                  <span><b>{c.validators}</b> validators</span>
                </div>
                <div className="c-intel">
                  <ScoreRing pct={c.conf} size={46} label="Validator Confidence" />
                  <div className="chips">
                    <span className="chip"><b>{c.completion}%</b> completion</span>
                    <span className="chip"><b>{c.avgApprove}</b> avg approve</span>
                    <span className="chip"><b>{c.rpm}</b> MLPTS/min</span>
                    <span className="chip">{'★'.repeat(Math.round(c.reputation))}</span>
                    <span className="chip"><b>{c.trust}</b> creator trust</span>
                  </div>
                </div>
                {c.verified && <span className="chip green" style={{ width: 'fit-content' }}>✓ Verified creator</span>}
                {joined && <MySubmissionPanel cid={c.id} onAppeal={appeal} />}
              </div>
              <div className="c-foot">
                <button className="btn btn-ghost" onClick={() => setDetail(c)}>View Details</button>
                {joined ? (
                  joined.status === 'rejected' && joined.appealAvailable !== false ? (
                    <button className="btn btn-primary" style={{ background: 'var(--gold)', color: '#16181d' }} onClick={() => appeal(joined)}>Appeal / Resubmit</button>
                  ) : (
                    <StatusChip status={joined.status} />
                  )
                ) : (
                  <button className="btn btn-primary" onClick={() => join(c)}>Participate</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detail && <CampaignDetailModal c={detail} onClose={() => setDetail(null)} onJoin={() => { setDetail(null); setParticipating(detail); }} />}
      {participating && <ParticipationModal c={participating} onClose={() => setParticipating(null)} />}
    </div>
  );
}

function MySubmissionPanel({ cid, onAppeal }: { cid: string; onAppeal: (p: Participation) => void }) {
  const p = participationFor(store.state, cid);
  if (!p) return null;
  const stepsDone = p.status === 'pending' || p.status === 'approved' || p.status === 'rejected' ? 5 : p.steps || 0;
  const pct = Math.round((stepsDone / 5) * 100);
  return (
    <div className="mc-sub-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusChip status={p.status} />
        <span className="tiny">{stepsDone}/5 steps</span>
        {p.status === 'approved' && <span className="mc-badge b-approved" style={{ marginLeft: 'auto' }}>+{p.reward} MLPTS earned</span>}
      </div>
      <div className="mc-progress" style={{ margin: '6px 0' }}><div style={{ width: pct + '%' }} /></div>
      {p.status === 'rejected' && (
        <div style={{ fontSize: 11, color: 'var(--red-2)' }}>⚠ {p.rejectReason || 'Duplicate submission'}
          {p.appealAvailable !== false && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => onAppeal(p)}>Appeal</button>}
        </div>
      )}
    </div>
  );
}

function CampaignDetailModal({ c, onClose, onJoin }: { c: Campaign; onClose: () => void; onJoin: () => void }) {
  const joined = participationFor(store.state, c.id);
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="c-banner" style={{ borderRadius: 12, marginBottom: 12 }}>
        <span className="pl-ico">{PL_ICO[c.platform] || '🌐'}</span>
        <div><div className="nm">{c.name}</div><div className="cr">Created by {c.creator}</div></div>
        <div className="rv">{c.reward}<small>MLPTS</small></div>
      </div>
      <div className="c-meta mb">
        <span>Platform: <b>{c.platform}</b></span>
        <span>Validators: <b>{c.validators}</b></span>
        <span>Max: <b>{c.max.toLocaleString()}</b></span>
        <span>Remaining: <b>{c.remaining}</b></span>
        <span>⏱ <b>{c.eta}</b></span>
      </div>
      <div className="field"><label>Description</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{c.desc}</div></div>
      <div className="field"><label>Verification</label><div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>Automatic + Validator Review · {c.validators} Proof Validators · 80% consensus threshold</div></div>
      <div className="field"><label>Campaign Intelligence</label>
        <div className="c-intel">
          <ScoreRing pct={c.conf} size={46} />
          <div className="chips">
            <span className="chip"><b>{c.completion}%</b> completion</span>
            <span className="chip"><b>{c.avgApprove}</b> avg approve</span>
            <span className="chip"><b>{c.rpm}</b> MLPTS/min</span>
            <span className="chip"><b>{c.trust}</b> creator trust</span>
          </div>
        </div>
      </div>
      <div className="modal-actions">
        {joined ? <StatusChip status={joined.status} /> : <button className="btn btn-primary" onClick={onJoin}>Participate — earn {c.reward} MLPTS</button>}
      </div>
    </Modal>
  );
}

/** 5-step participation flow: Accept → Complete tasks → Upload proof → Submit → Await validation. */
function ParticipationModal({ c, onClose }: { c: Campaign; onClose: () => void }) {
  const st = store.state;
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const steps = ['Accept', 'Complete tasks', 'Upload proof', 'Submit', 'Await validation'];

  const submit = () => {
    setSubmitting(true);
    setErr('');
    setTimeout(() => {
      const id = 'p' + Date.now();
      st.mines.participations.unshift({ id, campaign: c.id, status: 'pending', steps: 5, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), reward: c.reward });
      st.mines.submissions.unshift({
        id: '#44' + (9001 + st.mines.submissions.length), pid: id, campaign: c.id, wallet: st.wallet.address || '0x7A9f…D6f8',
        ai: Math.round(88 + Math.random() * 11), human: 0, need: 18, status: 'voting', reason: null, reward: c.reward, plat: c.platform,
      });
      st.mines.pendCount += 1;
      store.commit();
      setSubmitting(false);
      toast(`Submitted — ${c.reward} MLPTS pending validator review`);
      onClose();
    }, 1100);
  };

  return (
    <Modal title={`Participate — ${c.name}`} onClose={onClose}>
      <Stepper steps={steps} current={step} />
      {step === 0 && (
        <>
          <div className="field"><label>Campaign rules</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{c.desc}</div></div>
          <div className="field"><label>Reward</label><b className="gold">{c.reward} MLPTS</b> <span className="muted">· paid after validator consensus</span></div>
          <div className="modal-actions"><button className="btn btn-primary" onClick={() => setStep(1)}>Accept & continue →</button></div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="field"><label>Task 1/2</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>Open {c.platform} and follow the campaign instructions.</div></div>
          <div className="field"><label>Task 2/2</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>Complete the required engagement ({c.eta} estimated).</div></div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button><button className="btn btn-primary" onClick={() => setStep(2)}>I completed the tasks →</button></div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="field"><label>Upload proof (screenshot)</label>
            <div style={{ border: '2px dashed var(--line-2)', borderRadius: 12, padding: 28, textAlign: 'center', color: 'var(--txt-3)', fontSize: 13, cursor: 'pointer' }} onClick={() => { toast('Screenshot attached'); setStep(3); }}>
              📷 Click to attach screenshot / proof of completion
            </div>
          </div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button></div>
        </>
      )}
      {step === 3 && (
        <>
          <div className="field"><label>Confirm submission</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>Your proof will be reviewed by {c.validators} Proof Validators (80% consensus).</div></div>
          {err && <div className="mc-err">{err}</div>}
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button><button className="btn btn-primary" disabled={submitting} onClick={submit}>{submitting && <span className="spin" />} Submit for Validation</button></div>
        </>
      )}
      {step === 4 && <div style={{ textAlign: 'center', padding: 16 }}><span className="stream-pulse" style={{ display: 'inline-block' }} /> Awaiting validator consensus…</div>}
    </Modal>
  );
}