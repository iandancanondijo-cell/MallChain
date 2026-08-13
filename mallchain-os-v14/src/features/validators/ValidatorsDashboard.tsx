import { useState } from 'react';
import { store, type Submission } from '../../store/store';
import { useStoreVersion, fmtNum, StatusChip, BarChart, toast } from '../../components/ui';

/** Validator Dashboard — queue cards from the shared submissions store,
 *  Today's Work summary, weekly charts, compact calculator projection strip. */
export default function ValidatorsDashboard({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const [reviewing, setReviewing] = useState<Submission | null>(null);

  const queue = st.mines.submissions.filter((s) => s.status === 'voting');

  const resetDaily = () => {
    V.daily = { reviewed: Math.round(V.daily.reviewed * 0.4), approved: Math.round(V.daily.approved * 0.4), rejected: Math.round(V.daily.rejected * 0.4), matched: Math.round(V.daily.matched * 0.4), incorrect: Math.round(V.daily.incorrect * 0.4), reward: Math.round(V.daily.reward * 0.4 * 10) / 10 };
    store.commit();
    toast('Today\'s work re-seeded from review volume');
  };

  const calc = V.calculator;
  const stripGross = calc.inputs.reviews * calc.inputs.days * (calc.inputs.cons / 100) * 0.8;
  const stripNet = stripGross * (calc.result.mult || 1);

  const { weekly } = V;

  return (
    <div>
      <div className="view-head">
        <h1>Validator Dashboard</h1>
        <span className="sub">The trust layer of the mining ecosystem</span>
        <span className="chip gold">You: {V.reputation.rank || 'Unranked'}</span>
      </div>

      {/* compact calculator projection strip */}
      <div className="card mb" style={{ borderColor: 'rgba(243,186,47,.35)' }}>
        <div className="row">
          <span style={{ fontSize: 20 }}>🧮</span>
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>Projected monthly earnings {fmtNum(stripNet)} MALL</div>
            <div className="tiny">{calc.inputs.reviews}×{calc.inputs.days} days · gross {fmtNum(stripGross)} → net {fmtNum(stripNet)}{calc.result.tier >= 2 ? ` · ${calc.result.tier >= 4 ? 'Stake slash 25%' : calc.result.mult < 1 ? 'Reduced rewards (0.5×)' : ''}` : ''}</div>
          </div>
          <button className="btn btn-ghost gold btn-sm" onClick={() => navigate('/validators/calculator')}>Open calculator →</button>
        </div>
      </div>

      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Reviewed today</div><div className="num">{V.daily.reviewed}</div></div>
        <div className="card"><div className="lbl">Approved</div><div className="num" style={{ color: 'var(--green-2)' }}>{V.daily.approved}</div></div>
        <div className="card"><div className="lbl">Rejected</div><div className="num" style={{ color: 'var(--red-2)' }}>{V.daily.rejected}</div></div>
        <div className="card"><div className="lbl">Consensus matches</div><div className="num" style={{ color: 'var(--gold)' }}>{V.daily.matched}</div></div>
        <div className="card"><div className="lbl">Incorrect votes</div><div className="num">{V.daily.incorrect}</div></div>
        <div className="card"><div className="lbl">Today's reward</div><div className="num" style={{ color: 'var(--green-2)' }}>+{V.daily.reward} <small>MALL</small></div></div>
      </div>

      <div className="sec-title">
        <h2>Review queue</h2><span className="sub">blind reviews from the shared submissions store</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={resetDaily}>↻ Reset today's work</button>
      </div>
      <div className="card">
        {queue.length === 0 && (
          <div className="empty-state"><div className="es-ico">📭</div><div className="es-t">Queue empty</div><div className="es-m">You are not a validator yet — or all submissions are validated. Become a validator to start reviewing.</div><button className="btn btn-primary" onClick={() => navigate('/validators')}>Become a Validator</button></div>
        )}
        {queue.map((s) => {
          const c = st.mines.campaigns.find((x) => x.id === s.campaign);
          return (
            <div key={s.id} className="mc-queue-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Submission {s.id} <span className="muted" style={{ fontWeight: 400 }}>· {c?.name || s.plat} · {s.wallet}</span></div>
                <div className="mc-votes">
                  {Array.from({ length: Math.min(s.need, 18) }, (_, i) => (
                    <span key={i} className={i < s.human ? 'v-yes' : 'v-need'}>{i < s.human ? '✓' : '·'}</span>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setReviewing(s)}>Review</button>
            </div>
          );
        })}
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <div className="sec-title"><h2>Weekly reviews</h2></div>
          {weekly.length === 0 ? <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>No weekly data yet — start reviewing.</div> : <BarChart data={weekly.map((w) => w.reviewed)} labels={weekly.map((w) => w.w)} height={140} />}
        </div>
        <div className="card">
          <div className="sec-title"><h2>Weekly rewards (MALL)</h2></div>
          {weekly.length === 0 ? <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>No reward data yet.</div> : <BarChart data={weekly.map((w) => w.reward)} labels={weekly.map((w) => w.w)} height={140} color="var(--green)" />}
        </div>
      </div>

      {reviewing && <BlindReviewModal s={reviewing} onClose={() => setReviewing(null)} onDone={() => setReviewing(null)} />}
    </div>
  );
}

/** Blind review — proof panel + 8-item checklist + auto duplicate flag +
 *  integrity warning + consensus simulation (80% threshold, votes tick in). */
function BlindReviewModal({ s, onClose, onDone }: { s: Submission; onClose: () => void; onDone: () => void }) {
  const st = store.state;
  const V = st.validators;
  const [checks, setChecks] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false });
  const [dupFlag, setDupFlag] = useState(s.reason === 'Duplicate submission');
  const [verdict, setVerdict] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('Duplicate submission');
  const [phase, setPhase] = useState<'review' | 'consensus' | 'result'>('review');
  const [votes, setVotes] = useState<number[]>([1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1]);
  const [busy, setBusy] = useState(false);

  const CHECKLIST = [
    'Screenshot shows the correct campaign account',
    'Proof matches the required platform',
    'Timestamp is recent (within campaign window)',
    'No signs of image manipulation',
    'Participant identity matches submission wallet',
    'Engagement count matches campaign rules',
    'No duplicate of another submission',
    'Content is not AI-generated / stock',
  ];

  const checkedCount = Object.values(checks).filter(Boolean).length;

  const submit = (v: 'approve' | 'reject') => {
    setVerdict(v);
    setPhase('consensus');
    setBusy(true);
    // simulate votes ticking in — 15 validators, 80% threshold
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      setVotes((prev) => prev.map((v, j) => (j < i ? v : Math.random() < (v === 1 ? 0.5 : 0.3) ? 1 : 0)));
      if (i >= 15) {
        clearInterval(tick);
        finalize(v);
      }
    }, 220);
  };

  const finalize = (v: 'approve' | 'reject') => {
    setBusy(false);
    setPhase('result');
    const agreeCount = votes.filter((x) => (v === 'approve' ? x === 1 : x === 0)).length;
    const matched = agreeCount / 15 >= 0.8;
    // update the submission
    const sub = st.mines.submissions.find((x) => x.id === s.id);
    if (sub) {
      sub.human = v === 'approve' ? 15 : 0;
      sub.status = matched ? (v === 'approve' ? 'approved' : 'rejected') : 'voting';
    }
    V.daily.reviewed += 1;
    if (matched) {
      V.daily.matched += 1;
      V.daily.reward += 0.8;
      store.applyTx({ type: 'validator-reward', amount: 0.8, asset: 'MALL', kind: 'credit', note: `Matched review ${s.id}`, notifTitle: 'Consensus matched — +0.8 MALL', notifKind: 'validators', activityText: `Matched consensus on ${s.id} — +0.8 MALL` });
      toast('Consensus matched — +0.8 MALL');
    } else {
      V.daily.incorrect += 1;
      V.reputation.incorrect += 1;
      V.reputation.accuracy = Math.max(0, Math.round(((V.reputation.correct) / Math.max(1, V.reputation.correct + V.reputation.incorrect)) * 100));
      V.strikes = Math.min(5, Math.floor(V.reputation.incorrect / 5));
      store.applyTx({ type: 'validator-penalty', amount: 0.2, asset: 'MLPTS', kind: 'debit', note: `Wrong-vote penalty ${s.id}`, notifTitle: 'Wrong vote — −0.2 reputation', notifKind: 'validators', activityText: `Missed consensus on ${s.id} — reputation penalty` });
      toast('Missed consensus — reputation penalty applied', false);
    }
    store.commit();
  };

  if (phase === 'result') {
    const agreeCount = votes.filter((x) => (verdict === 'approve' ? x === 1 : x === 0)).length;
    const matched = agreeCount / 15 >= 0.8;
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal">
          <div className="modal-head"><h2>Consensus result</h2><span className="modal-close" onClick={onClose}>✕</span></div>
          <div style={{ textAlign: 'center', padding: 12 }}>
            <div style={{ fontSize: 44 }}>{matched ? '🎯' : '⚠️'}</div>
            <h2 style={{ margin: '8px 0' }}>{agreeCount}/15 validators agreed — {Math.round((agreeCount / 15) * 100)}% (threshold 80%)</h2>
            <div className="bar" style={{ maxWidth: 300, margin: '0 auto' }}><i style={{ width: `${(agreeCount / 15) * 100}%`, background: matched ? 'var(--green)' : 'var(--red)' }} /></div>
            <p className="muted mt">{matched ? (verdict === 'approve' ? 'Submission approved — participant will be credited.' : 'Submission rejected — appealable once.') : 'Consensus not reached — submission returns to the queue.'}</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={onDone}>Done</button></div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'consensus') {
    const yes = votes.filter((v) => v === 1).length;
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-head"><h2>Consensus in progress</h2></div>
          <div style={{ textAlign: 'center', padding: 12 }}>
            <div className="mc-votes" style={{ justifyContent: 'center', maxWidth: 340, margin: '0 auto' }}>
              {votes.map((v, i) => <span key={i} className={v === 1 ? 'v-yes' : 'v-need'}>{v === 1 ? '✓' : '·'}</span>)}
            </div>
            <div className="mt" style={{ fontWeight: 800, fontSize: 18 }}>{yes}/15 approve — need 12 (80%)</div>
            <div className="muted">Your vote: {verdict === 'approve' ? 'Approve' : 'Reject'} · others ticking in…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="modal-head">
          <h2>Blind review — {s.id}</h2>
          <span className="chip red" style={{ marginLeft: 'auto', marginRight: 10 }}>🔒 Other votes hidden</span>
          <span className="modal-close" onClick={onClose}>✕</span>
        </div>
        <div className="grid-2">
          <div>
            <div className="field"><label>Campaign</label><div style={{ fontSize: 13, color: 'var(--txt-2)' }}>{st.mines.campaigns.find((c) => c.id === s.campaign)?.name || s.plat}</div></div>
            <div className="field"><label>Rules</label><div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>{st.mines.campaigns.find((c) => c.id === s.campaign)?.desc || 'Follow the campaign instructions.'}</div></div>
            <div className="field"><label>Proof</label>
              <div style={{ border: '2px dashed var(--line-2)', borderRadius: 12, padding: 26, textAlign: 'center', background: 'var(--bg-2)' }}>
                <div style={{ fontSize: 40 }}>🖼</div>
                <div className="muted" style={{ fontSize: 12 }}>screenshot-proof-{s.id}.png</div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toast('Zoom 150%')}>🔍 Zoom</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toast('Rotated 90°')}>↻ Rotate</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toast('Fullscreen mode')}>⛶ Fullscreen</button>
                </div>
              </div>
            </div>
            {dupFlag && <div className="global-banner warn" style={{ borderRadius: 10, marginTop: 4 }}>⚠ Integrity warning: this proof was auto-flagged as a potential duplicate of submission #44{s.id.slice(-3)}.</div>}
            <div className="field mt"><label>Checklist — {checkedCount}/8</label>
              {CHECKLIST.map((c, i) => (
                <label key={i} className="check" style={{ marginBottom: 4 }}>
                  <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks({ ...checks, [i]: e.target.checked })} /> {c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="field"><label>AI verification</label><span className="chip gold">AI {s.ai}% match</span></div>
            <div className="field"><label>Your verdict</label>
              <div className="row">
                <button className="btn btn-ghost" style={{ color: 'var(--green-2)', borderColor: 'rgba(34,197,94,.4)' }} onClick={() => submit('approve')}>✓ Approve</button>
                <button className="btn btn-ghost" style={{ color: 'var(--red-2)', borderColor: 'rgba(239,68,68,.4)' }} onClick={() => { setDupFlag(true); submit('reject'); }}>✕ Reject</button>
              </div>
            </div>
            <div className="field"><label>Reject reason (if rejecting)</label>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Duplicate submission</option><option>Proof does not match rules</option><option>Manipulated / edited screenshot</option><option>Wrong platform</option><option>Outdated timestamp</option>
              </select>
            </div>
            <div className="tiny">Reviews are blind — you cannot see other validators' votes until you submit yours. 15 validators review each submission; 80% must agree.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
