import { store } from '../../store/store';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';

/** Mines analytics — 6 performance charts. */
export default function MinesAnalytics() {
  useStoreVersion();
  const st = store.state;
  const week = st.mines.earnings.map((e) => e.v);
  const daily = [3, 5, 2, 6, 4, 7, 3];
  const platforms = st.mines.campaigns.reduce<Record<string, number>>((a, c) => { a[c.platform] = (a[c.platform] || 0) + 1; return a; }, {});
  const plKeys = Object.keys(platforms);
  const plVals = plKeys.map((k) => platforms[k]);
  const approved = st.mines.submissions.filter((s) => s.status === 'approved').length;
  const rejected = st.mines.submissions.filter((s) => s.status === 'rejected').length;
  const acc = approved + rejected ? (approved / (approved + rejected)) * 100 : 99.1;

  return (
    <div>
      <div className="view-head"><h1>Your Mining Performance</h1><span className="sub">Lifetime stats as a Campaign Participant</span></div>
      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Lifetime MLPTS</div><div className="num">{fmtNum(st.mines.earnings.reduce((a, e) => a + e.v, 0))}</div></div>
        <div className="card"><div className="lbl">Campaigns joined</div><div className="num">{st.mines.participations.length}</div></div>
        <div className="card"><div className="lbl">Approval rate</div><div className="num">{acc.toFixed(1)}<small>%</small></div></div>
        <div className="card"><div className="lbl">Avg reward/task</div><div className="num">{fmtNum(st.mines.participations.reduce((a, p) => a + p.reward, 0) / Math.max(st.mines.participations.length, 1))}<small>MLPTS</small></div></div>
      </div>
      <div className="grid-2">
        <div className="card"><div className="sec-title"><h2>Weekly earnings</h2></div><BarChart data={week} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} height={150} /></div>
        <div className="card"><div className="sec-title"><h2>Daily participation</h2></div><BarChart data={daily} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} height={150} color="var(--cyan)" /></div>
        <div className="card"><div className="sec-title"><h2>Platform distribution</h2></div><BarChart data={plVals} labels={plKeys} height={150} color="var(--purple)" /></div>
        <div className="card"><div className="sec-title"><h2>Reward history</h2></div><BarChart data={week} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} height={150} color="var(--green)" /></div>
        <div className="card"><div className="sec-title"><h2>Validator approval</h2></div><BarChart data={[acc, 100 - acc]} labels={['Approved', 'Rejected']} height={150} color="var(--gold)" /></div>
        <div className="card"><div className="sec-title"><h2>Completion speed</h2></div><BarChart data={[30, 45, 25, 60, 40, 50, 35]} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} height={150} color="var(--red)" /></div>
      </div>
    </div>
  );
}
