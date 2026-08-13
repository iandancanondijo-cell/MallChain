import { store } from '../../store/store';
import { useStoreVersion, fmtNum, ScoreRing } from '../../components/ui';

/** Mines leaderboard — computed from the store; own rank highlighted. */
export default function MinesLeaderboard() {
  useStoreVersion();
  const st = store.state;

  // participants ranked by earned (from submissions approved + earnings)
  const rows = st.mines.participations
    .map((p) => ({
      id: p.id,
      name: p.campaign === st.mines.participations[0]?.campaign ? st.user.name : `Participant ${p.id.slice(1, 3)}`,
      earned: p.status === 'approved' ? p.reward : 0,
      tasks: p.status === 'approved' ? 1 : 0,
      mine: true,
    }));

  // pad with seeded rivals when in demo
  const rivals = [
    { id: 'r1', name: 'Faith Njeri', earned: 3420, tasks: 47, mine: false },
    { id: 'r2', name: 'Amina Wanjiru', earned: 2980, tasks: 41, mine: false },
    { id: 'r3', name: 'Brian Mwangi', earned: 2115, tasks: 33, mine: false },
    { id: 'r4', name: 'Grace Achieng', earned: 1870, tasks: 29, mine: false },
    { id: 'r5', name: 'Samuel Kipchoge', earned: 1240, tasks: 21, mine: false },
  ];
  const all = st.settings.demoMode ? [...rivals, ...rows] : rows;
  const sorted = all.sort((a, b) => b.earned - a.earned);
  const myRank = sorted.findIndex((r) => r.mine) + 1;
  const myEarned = sorted.find((r) => r.mine)?.earned || 0;
  const maxEarned = Math.max(...sorted.map((r) => r.earned), 1);

  return (
    <div>
      <div className="view-head">
        <h1>Leaderboard</h1>
        <span className="sub">Top Campaign Participants this month</span>
        {myRank > 0 && <span className="chip gold">Your rank: #{myRank}</span>}
      </div>
      {sorted.length === 0 && (
        <div className="empty-state"><div className="es-ico">🏆</div><div className="es-t">No participants yet</div><div className="es-m">Complete campaigns to climb the leaderboard.</div></div>
      )}
      <div className="card">
        {sorted.map((r, i) => (
          <div key={r.id} className={'lb-row' + (r.mine ? ' mine' : '')}>
            <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{r.name[0]}</div>
            <div className="lb-name">
              <div className="t">{r.name} {r.mine && <span className="mc-badge b-approved">You</span>}</div>
              <div className="m">{r.tasks} tasks completed</div>
            </div>
            <div className="lb-acc"><div className="bar"><i style={{ width: `${(r.earned / maxEarned) * 100}%` }} /></div></div>
            <div className="lb-stat"><div className="t">{fmtNum(r.earned)} <span className="unit" style={{ fontSize: 10 }}>MLPTS</span></div></div>
          </div>
        ))}
      </div>
      <div className="card mt">
        <div className="sec-title"><h2>Your standing</h2></div>
        <div className="row">
          <ScoreRing pct={maxEarned ? Math.round((myEarned / maxEarned) * 100) : 0} size={84} label="Share of top earner" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>#{myRank || '—'} of {sorted.length}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>You've earned {fmtNum(myEarned)} MLPTS this month.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
