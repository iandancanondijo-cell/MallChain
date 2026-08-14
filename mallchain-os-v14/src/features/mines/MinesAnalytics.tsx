import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';
import { minesApi, type WalletTx, type MinesSubmission } from '../../services/minesApi';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
}

/** Analytics — real lifetime performance, computed from submissions + transactions (no fabricated metrics). */
export default function MinesAnalytics() {
  useStoreVersion();

  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [txResult, subResult] = await Promise.all([minesApi.getTransactions(100), minesApi.mySubmissions(100)]);
    if (txResult.ok && txResult.data) setTxs(txResult.data);
    else setError(txResult.error || 'Failed to load analytics');
    if (subResult.ok && subResult.data) setSubmissions(subResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const credits = txs.filter((t) => t.type === 'credit');
  const lifetime = credits.reduce((a, t) => a + t.amount, 0);
  const approved = submissions.filter((s) => s.status === 'auto_approved').length;
  const rejected = submissions.filter((s) => s.status === 'rejected').length;
  const acc = approved + rejected ? (approved / (approved + rejected)) * 100 : 0;
  const avgReward = approved ? lifetime / approved : 0;

  const byDay: Record<string, number> = {};
  for (const t of credits) byDay[dayKey(t.created_at)] = (byDay[dayKey(t.created_at)] || 0) + t.amount;
  const weekLabels = Object.keys(byDay);
  const weekData = weekLabels.map((k) => byDay[k]);

  return (
    <div>
      <div className="view-head"><h1>Your Mining Performance</h1><span className="sub">Lifetime stats as a Campaign Participant</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="mc-stats-grid">
        <div className="card"><div className="lbl">Lifetime MLPTS</div><div className="num">{loading ? '—' : fmtNum(lifetime)}</div></div>
        <div className="card"><div className="lbl">Submissions</div><div className="num">{submissions.length}</div></div>
        <div className="card"><div className="lbl">Approval rate</div><div className="num">{acc.toFixed(1)}<small>%</small></div></div>
        <div className="card"><div className="lbl">Avg reward/task</div><div className="num">{fmtNum(avgReward)}<small>MLPTS</small></div></div>
      </div>
      <div className="grid-2">
        <div className="card"><div className="sec-title"><h2>Earnings by day</h2></div>{weekData.length === 0 ? <div className="tiny" style={{ padding: 16 }}>No earnings yet</div> : <BarChart data={weekData} labels={weekLabels} height={150} />}</div>
        <div className="card"><div className="sec-title"><h2>Reviewer outcome</h2></div>{approved + rejected === 0 ? <div className="tiny" style={{ padding: 16 }}>No reviewed submissions yet</div> : <BarChart data={[acc, 100 - acc]} labels={['Approved %', 'Rejected %']} height={150} color="var(--gold)" />}</div>
      </div>
    </div>
  );
}
