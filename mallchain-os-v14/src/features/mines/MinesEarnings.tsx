import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';
import { minesApi, type EarningsSummary } from '../../services/minesApi';

/**
 * Earnings — GET /api/mines/earnings/summary.
 *
 * This panel used to sum every credit in the wallet ledger and label it
 * "Your Mallpoints from validated campaigns", which counted referral bonuses,
 * admin adjustments and sign-up credits as if they were Mines rewards. The
 * summary route aggregates settled TaskSubmissions instead, so each number
 * here is a campaign reward and nothing else.
 */
export default function MinesEarnings() {
  useStoreVersion();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await minesApi.getEarningsSummary();
    if (result.ok && result.data) {
      setSummary(result.data);
    } else {
      setError(result.error || 'Failed to load earnings');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The route already buckets by calendar day; label them for the chart
  // rather than re-deriving from a mixed-purpose ledger.
  const labels = (summary?.daily || []).map((d) =>
    new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const data = (summary?.daily || []).map((d) => d.mlpts);

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Earnings</h1><span className="sub">Mallpoints paid from campaigns you completed</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {!loading && !summary && (
        <div className="empty-state"><div className="es-ico">💰</div><div className="es-t">Earnings unavailable</div><div className="es-m">Your campaign rewards could not be read. Use Retry above.</div></div>
      )}

      {summary && (
        <>
          <div className="mc-stats-grid stagger">
            <div className="card card-hover"><div className="lbl">Earned from campaigns</div><div className="num">{fmtNum(summary.approvedMlpts)} <small>MLPTS</small></div></div>
            <div className="card card-hover"><div className="lbl">This week</div><div className="num">{fmtNum(summary.thisWeekMlpts)} <small>MLPTS</small></div></div>
            <div className="card card-hover"><div className="lbl">Approved submissions</div><div className="num">{summary.approvedCount} <small>tasks</small></div></div>
            <div className="card card-hover"><div className="lbl">Rejected</div><div className="num" style={{ color: 'var(--red-2)' }}>{summary.rejectedCount} <small>tasks</small></div></div>
          </div>

          <div className="mc-stats-grid stagger">
            <div className="card card-hover">
              <div className="lbl">Average per task</div>
              <div className="num">{fmtNum(summary.avgRewardMlpts)} <small>MLPTS</small></div>
            </div>
            <div className="card card-hover">
              <div className="lbl">Awaiting review</div>
              <div className="num">{summary.pendingCount} <small>tasks</small></div>
              <div className="hint">Worth up to {fmtNum(summary.pendingMlptsAtStake)} MLPTS if approved</div>
            </div>
            <div className="card card-hover">
              <div className="lbl">Mallpoints balance</div>
              <div className="num">{fmtNum(summary.balanceMlpts)} <small>MLPTS</small></div>
              <div className="hint">Includes rewards from every source, not only campaigns</div>
            </div>
            <div className="card card-hover">
              <div className="lbl">Tasks completed</div>
              <div className="num">{summary.tasksCompleted} <small>total</small></div>
            </div>
          </div>

          {summary.pendingCampaignsUnresolved > 0 && (
            <div className="card mb" style={{ borderColor: 'rgba(245,166,35,.3)' }}>
              <div className="tiny" style={{ color: 'var(--txt-2)' }}>
                ⚠ {summary.pendingCampaignsUnresolved} of your open submissions reference a campaign that no longer exists, so their value is not counted in the pending figure.
              </div>
            </div>
          )}

          <div className="card card-glow bg-gradient-card">
            <div className="sec-title"><h2>Rewards paid, last 7 days</h2></div>
            {data.length === 0 ? (
              <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>No campaign rewards paid this week — join a campaign to start earning Mallpoints.</div>
            ) : (
              <BarChart data={data} labels={labels} height={180} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
