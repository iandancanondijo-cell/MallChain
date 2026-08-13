import { store } from '../../store/store';
import { useStoreVersion, fmtNum, ScoreRing } from '../../components/ui';

/** Validator profile — reputation, strikes ladder, integrity & safeguards. */
export default function ValidatorsProfile() {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const R = V.reputation;

  const strikeTiers = [
    { tier: 1, label: 'Warning', consequence: 'Verbal warning recorded', active: V.strikes >= 1, bad: false },
    { tier: 2, label: 'Reduced rewards', consequence: 'Reward multiplier 0.5×', active: V.strikes >= 2, bad: false },
    { tier: 3, label: 'Suspension', consequence: '24h review suspension', active: V.strikes >= 3, bad: false },
    { tier: 4, label: 'Stake slash', consequence: 'Stake slashed 25% (125 MALL)', active: V.strikes >= 4, bad: true },
    { tier: 5, label: 'Permanent ban', consequence: 'Removed from validator set', active: V.strikes >= 5, bad: true },
  ];

  const guards = [
    { t: 'Random assignment', d: 'Submissions are assigned to validators randomly — no cherry-picking.' },
    { t: 'Blind review', d: 'No validator sees others\' votes until they have submitted their own.' },
    { t: 'Weighted reputation', d: 'High-accuracy validators carry more consensus weight over time.' },
    { t: 'Duplicate detection', d: 'Automatic flagging of duplicate or manipulated proofs before human review.' },
    { t: 'Appeal mechanism', d: 'Rejected participants can appeal once — a fresh validator set re-reviews.' },
  ];

  return (
    <div>
      <div className="view-head"><h1>Validator Profile</h1><span className="sub">{st.user.name}</span><span className="chip gold">{R.rank || 'Unranked'}</span></div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Reputation model</h2></div>
          <div className="row mb">
            <ScoreRing pct={R.accuracy || 0} size={92} label="accuracy" />
            <div style={{ flex: 1 }}>
              <table className="tbl">
                <tbody>
                  <tr><td className="muted">Accuracy</td><td className="num"><b>{R.accuracy || '—'}%</b></td></tr>
                  <tr><td className="muted">Total votes</td><td className="num">{R.votes || '—'}</td></tr>
                  <tr><td className="muted">Correct</td><td className="num green">{R.correct || '—'}</td></tr>
                  <tr><td className="muted">Incorrect</td><td className="num red">{R.incorrect || '—'}</td></tr>
                  <tr><td className="muted">Fraud reports</td><td className="num">{R.fraud || 0}</td></tr>
                  <tr><td className="muted">Review speed</td><td className="num">{R.speed || '—'} /5</td></tr>
                  <tr><td className="muted">Trust score</td><td className="num">{R.trust || '—'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="tiny">Accuracy = correct / (correct + incorrect). Every incorrect vote: −0.2 reputation. Every 5th incorrect vote escalates a strike tier.</div>
        </div>

        <div className="card">
          <div className="sec-title"><h2>Strike ladder</h2><span className="chip gold">Tier {V.strikes} active</span></div>
          {strikeTiers.map((s) => (
            <div key={s.tier} className="list-row" style={{ opacity: s.active ? 1 : 0.55 }}>
              <span className="mc-badge" style={{ background: s.bad ? 'rgba(239,68,68,.15)' : 'rgba(243,186,47,.15)', color: s.bad ? 'var(--red-2)' : 'var(--gold)' }}>T{s.tier}</span>
              <div className="grow"><div className="t">{s.label}</div><div className="m">{s.consequence}</div></div>
              {s.active && <span className="chip red">active</span>}
            </div>
          ))}
          <div className="tiny mt">Strikes reset quarterly with sustained ≥90% accuracy. At tier 4, 25% of your 500 MALL stake (125 MALL) is slashed once.</div>
        </div>
      </div>

      <div className="card mt">
        <div className="sec-title"><h2>Integrity & anti-collusion safeguards</h2><span className="sub">how the trust layer stays honest</span></div>
        {guards.map((g) => (
          <div key={g.t} className="list-row"><span className="chip green">✓</span><div className="grow"><div className="t">{g.t}</div><div className="m">{g.d}</div></div></div>
        ))}
      </div>
    </div>
  );
}
