import { store } from '../../store/store';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';

export default function MinesEarnings() {
  useStoreVersion();
  const st = store.state;
  const total = st.mines.earnings.reduce((a, e) => a + e.v, 0);
  return (
    <div>
      <div className="view-head"><h1>Earnings</h1><span className="sub">Your Mallpoints from validated campaigns</span></div>
      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Total earned</div><div className="num">{fmtNum(total)} <small>MLPTS</small></div></div>
        <div className="card"><div className="lbl">This week</div><div className="num">{fmtNum(st.mines.earnings.slice(-7).reduce((a, e) => a + e.v, 0))} <small>MLPTS</small></div></div>
        <div className="card"><div className="lbl">Approved submissions</div><div className="num">{st.mines.submissions.filter((s) => s.status === 'approved').length} <small>tasks</small></div></div>
        <div className="card"><div className="lbl">Rejected</div><div className="num" style={{ color: 'var(--red-2)' }}>{st.mines.submissions.filter((s) => s.status === 'rejected').length} <small>tasks</small></div></div>
      </div>
      <div className="card">
        <div className="sec-title"><h2>Earnings over time</h2></div>
        {st.mines.earnings.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>No earnings yet — join a campaign to start earning Mallpoints.</div>
        ) : (
          <BarChart data={st.mines.earnings.map((e) => e.v)} labels={st.mines.earnings.map((e) => e.day)} height={180} />
        )}
      </div>
    </div>
  );
}
