import { store } from '../../store/store';
import { useStoreVersion, fmtNum } from '../../components/ui';

/** Mines Command Center — hero + today's network + 4 cards (mirrors v14). */
export default function MinesHome({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const M = st.mines;

  const pending = M.submissions.filter((s) => s.status === 'voting').length;
  const active = M.participations.filter((p) => p.status === 'inprogress' || p.status === 'pending').length;
  const today = M.earnings.length ? M.earnings[M.earnings.length - 1].v : 125;

  const cards = [
    { label: 'Active Campaigns', icon: '🎯', value: active, sub: 'Active', path: '/mines/participation' },
    { label: 'Discover Campaigns', icon: '🧭', value: M.campaigns.length, sub: 'New', path: '/mines/discover' },
    { label: 'Today\'s Rewards', icon: '💰', value: `+${fmtNum(today)}`, sub: 'MLPTS', path: '/mines/earnings' },
    { label: 'Pending Validation', icon: '🛂', value: pending || 324, sub: 'queue', path: '/mines/validator-queue' },
  ];

  return (
    <div>
      <div className="mc-hero">
        <h1>Mines Command Center</h1>
        <p>
          <b>Users are not miners.</b> Users are <b className="gold">Campaign Participants</b> — completing real marketing
          tasks for Mallpoints. <b className="gold">Validators are Proof Validators</b> — the trust layer that verifies
          each participant genuinely completed a campaign.
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/mines/discover')}>🧭 Discover Campaigns</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/participation')}>My Tasks</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/analytics')}>Performance</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/earnings')}>Rewards</button>
        </div>
      </div>

      <div className="sec-title"><h2>Today's Network</h2><span className="sub">live Mallchain mining stats</span></div>
      <div className="mc-stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(c.path)}>
            <div className="lbl">{c.icon} {c.label}</div>
            <div className="num">{c.value} <small>{c.sub}</small></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Live submission tape</h2><span className="chip green">● live</span></div>
        {M.submissions.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 22 }}>No submissions yet — join a campaign to get started.</div>}
        <div className="mc-tape"><div className="mc-tape-inner">
          {M.submissions.slice(0, 6).map((s) => {
            const c = M.campaigns.find((x) => x.id === s.campaign);
            if (s.status === 'approved') return <span key={s.id} className="t">✓ Submission {s.id} approved: +{s.reward}.00 MALL · {c?.name || s.plat}</span>;
            if (s.status === 'rejected') return <span key={s.id} className="r">⛔ Submission {s.id} rejected: {s.reason || 'Duplicate submission'}</span>;
            return <span key={s.id} className="g">⚙ Validator votes ticking — {s.id} ({s.human}/{s.need})</span>;
          })}
          {M.submissions.length === 0 && <span>No live events yet.</span>}
        </div></div>
      </div>
    </div>
  );
}
