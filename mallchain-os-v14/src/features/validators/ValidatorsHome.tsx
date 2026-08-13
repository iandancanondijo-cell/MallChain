import { store } from '../../store/store';
import { useStoreVersion, fmtNum } from '../../components/ui';

/** Validators hero — Become a Validator + 13-step lifecycle + requirements. */
export default function ValidatorsHome({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;

  const steps = ['Eligibility', 'Application', 'Stake 500 MALL', 'Training', 'Approval', 'Dashboard', 'Blind Review', 'Consensus', 'Matched → Reward', 'Mismatch → Penalty', 'Reputation', 'Strikes (5-tier)', 'Profile / Leaderboard'];
  const completed = V.stakeLocked >= 500 ? 5 : V.application ? 2 : 0;

  return (
    <div>
      <div className="mc-hero" style={{ borderColor: 'rgba(243,186,47,.3)' }}>
        <h1>Become a Mallchain Validator</h1>
        <p>
          Help maintain the integrity of the Mallchain social mining network. Validators determine whether a participant
          <b> genuinely completed</b> a campaign according to its rules — not who wins. <b>Earn Mallcoins for accurate validation.</b>
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/validators/apply')}>Apply Now</button>
          <button className="btn btn-ghost" onClick={() => navigate('/validators/leaderboard')}>View Leaderboard</button>
          <button className="btn btn-ghost gold" onClick={() => navigate('/validators/calculator')}>🧮 Rewards Calculator</button>
        </div>
      </div>

      <div className="sec-title"><h2>Requirements</h2><span className="sub">all must be met before applying</span></div>
      <div className="mc-stats-grid">
        {['✓ Verified Identity — KYC Level 2', '✓ Wallet age — Older than 30 days', '✓ Reputation — Above 90', '✓ Minimum stake — 500 MALL', '✓ History — No fraud record'].map((r) => (
          <div key={r} className="card"><div className="lbl">{r}</div><div className="num" style={{ fontSize: 14 }}>met</div></div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Your lifecycle progress</h2><span className="sub">13-step validator journey</span></div>
        <div className="mc-tape"><div className="mc-tape-inner">
          {steps.map((s, i) => (
            <span key={s} className={i < completed ? 't' : 'g'}>{i < completed ? '✓' : '→'} {s}</span>
          ))}
        </div></div>
        <div className="row mt">
          <span className="chip gold">Stake locked: {fmtNum(V.stakeLocked)} MALL</span>
          <span className="chip">Training: {V.training ? (V.training.passed ? 'passed ✓' : 'failed') : 'not started'}</span>
          <span className="chip">Reputation: {V.reputation.rank || 'Unranked'} · {V.reputation.accuracy || '—'}%</span>
        </div>
      </div>
    </div>
  );
}
