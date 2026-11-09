import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, BarChart } from '../../components/ui';
import { minesApi, type EarningsSummary, type MinesSubmission } from '../../services/minesApi';

/**
 * Analytics — GET /api/mines/earnings/summary plus the submission list.
 *
 * The "Lifetime MLPTS" and "Avg reward/task" figures used to be computed by
 * summing every wallet credit, while the denominator came only from approved
 * submissions — so a referral bonus inflated the average, and any reward paid
 * before the ledger's 100-row window silently dropped out. Both now come from
 * the same settled-submission aggregation, and the window it covers is stated.
 */
export default function MinesAnalytics() {
  useStoreVersion();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [summaryResult, subResult] = await Promise.all([minesApi.getEarningsSummary(), minesApi.mySubmissions(200)]);
    if (summaryResult.ok && summaryResult.data) setSummary(summaryResult.data);
    else setError(summaryResult.error || 'Failed to load analytics');
    if (subResult.ok && subResult.data) setSubmissions(subResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approved = summary?.approvedCount ?? 0;
  const rejected = summary?.rejectedCount ?? 0;
  const decided = approved + rejected;
  const acc = decided ? (approved / decided) * 100 : 0;

  const labels = (summary?.daily || []).map((d) =>
    new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const data = (summary?.daily || []).map((d) => d.mlpts);

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">Your Mining Performance</h1><span className="sub">Lifetime stats as a Campaign Participant</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {loading && !summary && <div className="tiny">Loading…</div>}

      {summary && (
        <div className="mc-stats-grid stagger">
          <div className="card card-hover"><div className="lbl">Campaign MLPTS earned</div><div className="num">{fmtNum(summary.approvedMlpts)}</div></div>
          <div className="card card-hover"><div className="lbl">Submissions</div><div className="num">{approved + rejected + summary.pendingCount}</div></div>
          <div className="card card-hover"><div className="lbl">Approval rate</div><div className="num">{decided ? acc.toFixed(1) : '—'}{decided ? <small>%</small> : null}</div></div>
          <div className="card card-hover"><div className="lbl">Avg reward/task</div><div className="num">{fmtNum(summary.avgRewardMlpts)}<small>MLPTS</small></div></div>
        </div>
      )}

      {!loading && summary && decided === 0 && (
        <div className="card mb"><div className="tiny" style={{ color: 'var(--txt-3)' }}>Approval rate and average reward need at least one decided submission — you have {summary.pendingCount} still with reviewers.</div></div>
      )}

      <div className="grid-2">
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title"><h2>Rewards paid, last 7 days</h2></div>
          {data.length === 0 ? <div className="tiny" style={{ padding: 16 }}>No campaign rewards were paid this week.</div> : <BarChart data={data} labels={labels} height={150} />}
        </div>
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title"><h2>Reviewer outcome</h2></div>
          {decided === 0 ? <div className="tiny" style={{ padding: 16 }}>No reviewed submissions yet</div> : <BarChart data={[acc, 100 - acc]} labels={['Approved %', 'Rejected %']} height={150} color="var(--gold)" />}
          {decided > 0 && <div className="tiny" style={{ padding: '0 16px 12px', color: 'var(--txt-3)' }}>From {decided} decided submission{decided === 1 ? '' : 's'}{submissions.length > decided ? `, ${submissions.length - decided} still open` : ''}.</div>}
        </div>
      </div>
    </div>
  );
}
