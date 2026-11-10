import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, BarChart, GroupedBarChart, MultiLineChart } from '../../components/ui';
import { minesApi, type EarningsSummary, type MinesSubmission } from '../../services/minesApi';

/**
 * Analytics — GET /api/mines/earnings/summary plus the submission list.
 *
 * The "Lifetime MLPTS" and "Avg reward/task" figures used to be computed by
 * summing every wallet credit, while the denominator came only from approved
 * submissions — so a referral bonus inflated the average, and any reward paid
 * before the ledger's 100-row window silently dropped out. Both now come from
 * the same settled-submission aggregation, and the window it covers is stated.
 *
 * What is added here is the flow itself. A mining week has four stages — a task
 * is offered, its link is opened, a proof is sent, a panel approves it — and
 * only the last one pays, so the number that matters is not a stage but where
 * the tasks stop moving. The stages are drawn on one scale and from one window
 * (the same 7 UTC days the summary's `activity` rows cover), and a stage that
 * exceeds an earlier one is reported as a measurement gap rather than turned
 * into a rate. A server that does not record offers yet says so plainly,
 * instead of drawing a funnel with an empty top and calling the drop 100%.
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
  const paidData = (summary?.daily || []).map((d) => d.mlpts);

  const activity = summary?.activity || [];
  const dayLabels = activity.map((r) =>
    new Date(`${r.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const sum = (key: 'shown' | 'opened' | 'done' | 'paid_count') => activity.reduce((t, r) => t + (r[key] || 0), 0);
  const offered = sum('shown');
  const opened = sum('opened');
  const proofs = sum('done');
  const settled = sum('paid_count');
  // Offers are counted only from the day the server began recording them, so a
  // window that predates that has no top to its funnel.
  const offersMeasured = (summary?.impressions_since ?? null) !== null;
  const sinceLabel = summary?.impressions_since
    ? new Date(`${summary.impressions_since}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  /** The stage that loses the most tasks — or the reason there is no answer. */
  const dropOff = (() => {
    if (!offersMeasured) return 'This server does not record what it offered you, so the flow starts at the first thing you did.';
    const steps = [
      { from: 'offered', to: 'opened', lost: offered - opened, detail: `${fmtNum(offered)} offered, ${fmtNum(opened)} opened` },
      { from: 'opened', to: 'proof sent', lost: opened - proofs, detail: `${fmtNum(opened)} opened, ${fmtNum(proofs)} proofs sent` },
      { from: 'proof sent', to: 'approved', lost: proofs - settled, detail: `${fmtNum(proofs)} sent, ${fmtNum(settled)} approved` },
    ];
    if (steps.some((s) => s.lost < 0)) {
      return `More proofs than recorded offers fall in this window — the offer counter began ${sinceLabel}, later than part of this history, so these stages are not comparable yet.`;
    }
    const worst = steps.reduce((a, b) => (b.lost > a.lost ? b : a), steps[0]);
    if (worst.lost <= 0) return 'Nothing dropped out: every task that reached a stage went on to the next one.';
    return `Most tasks are lost between ${worst.from} and ${worst.to} — ${worst.detail}, a gap of ${fmtNum(worst.lost)}.`;
  })();

  const stages = [
    ...(offersMeasured ? [{ label: 'Offered', value: offered }] : []),
    { label: 'Opened', value: opened },
    { label: 'Proof sent', value: proofs },
    { label: 'Approved', value: settled },
  ];

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
        <>
          <div className="sec-title"><h2>How your tasks move</h2></div>
          <div className="earn-grid stagger">
            <div className="card earn-card">
              <div className="lbl">Offered on your window</div>
              <div className="num">{offersMeasured ? fmtNum(offered) : '—'}</div>
              <div className="def">
                {offersMeasured
                  ? 'Distinct tasks Discover put in front of you in the last 7 days. You cannot complete one it never showed you.'
                  : 'This server does not record what it showed you, so the flow below starts at your first action.'}
              </div>
              <div className="src">{offersMeasured ? `campaign_impressions · since ${sinceLabel}` : 'campaign_impressions · not recorded'}</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Links opened</div>
              <div className="num">{fmtNum(opened)}</div>
              <div className="def">An open is the attempt that buys the reward: once spent, that link cannot be opened again.</div>
              <div className="src">campaign_opens · opened_at, 7 UTC days</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Proofs sent</div>
              <div className="num">{fmtNum(proofs)}</div>
              <div className="def">Screenshots you submitted. Only these can be approved, and only an approval pays.</div>
              <div className="src">task_submissions · created_at, 7 UTC days</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Approved and paid</div>
              <div className="num">{fmtNum(settled)}</div>
              <div className="def">
                {settled
                  ? `Settled inside the same 7 days, worth ${fmtNum(summary.thisWeekMlpts)} MLPTS between them.`
                  : 'Nothing settled in this window yet. Anything you sent is still with reviewers.'}
              </div>
              <div className="src">task_submissions · completed_at, 7 UTC days</div>
            </div>
          </div>

          <div className="card card-glow bg-gradient-card mb">
            <div className="sec-title"><h2>Your flow of task completion</h2><span className="tiny">last 7 days · one scale</span></div>
            <GroupedBarChart
              series={[{ name: offersMeasured ? 'Tasks at each stage' : 'Your actions at each stage', color: 'var(--cyan)', data: stages.map((s) => s.value) }]}
              labels={stages.map((s) => s.label)}
              height={150}
            />
            <div className="tiny" style={{ padding: '10px 16px 2px', color: 'var(--txt-3)' }}>{dropOff}</div>
          </div>

          <div className="sec-title"><h2>Decided by reviewers</h2></div>
          <div className="earn-grid">
            <div className="card earn-card">
              <div className="lbl">Campaign MLPTS earned</div>
              <div className="num">{fmtNum(summary.approvedMlpts)}</div>
              <div className="def">Every reward a panel approved you, since your first completed task.</div>
              <div className="src">task_submissions · approved rows</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Submissions</div>
              <div className="num">{fmtNum(approved + rejected + summary.pendingCount)}</div>
              <div className="def">{`${approved} approved, ${rejected} refused, ${summary.pendingCount} still awaiting a vote.`}</div>
              <div className="src">task_submissions · all statuses</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Approval rate</div>
              <div className="num">{decided ? `${acc.toFixed(1)}%` : '—'}</div>
              <div className="def">
                {decided
                  ? `A panel decided ${decided} submission${decided === 1 ? '' : 's'} and approved ${approved} of them. Open submissions count neither way.`
                  : 'Needs at least one decided submission — nothing has been approved or refused yet.'}
              </div>
              <div className="src">derived · approved ÷ decided</div>
            </div>
            <div className="card earn-card">
              <div className="lbl">Avg reward per task</div>
              <div className="num">{fmtNum(summary.avgRewardMlpts)} <span className="unit" style={{ fontSize: 11 }}>MLPTS</span></div>
              <div className="def">What a panel actually paid you per approved task, not the rate a campaign advertised.</div>
              <div className="src">derived · approvedMlpts ÷ approvedCount</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card card-glow bg-gradient-card">
              <div className="sec-title"><h2>Proofs sent against rewards paid</h2><span className="tiny">lines · the review lag</span></div>
              {activity.length === 0 ? (
                <div className="tiny" style={{ padding: 16 }}>This server returns no daily activity for the window, so there is nothing to plot.</div>
              ) : (
                <MultiLineChart
                  series={[
                    { name: 'Proofs you sent', color: 'var(--gold)', data: activity.map((r) => r.done || 0) },
                    { name: 'Approved and paid by a panel', color: 'var(--green)', data: activity.map((r) => r.paid_count || 0) },
                  ]}
                  labels={dayLabels}
                  height={150}
                />
              )}
              <div className="tiny" style={{ padding: '10px 16px 2px', color: 'var(--txt-3)' }}>
                A proof only reaches the second line once a panel votes. Work sitting below it is waiting, not lost.
              </div>
            </div>
            <div className="card card-glow bg-gradient-card">
              <div className="sec-title"><h2>Reviewer outcome</h2></div>
              {decided === 0 ? <div className="tiny" style={{ padding: 16 }}>No reviewed submissions yet</div> : <BarChart data={[acc, 100 - acc]} labels={['Approved %', 'Rejected %']} height={150} color="var(--gold)" />}
              {decided > 0 && <div className="tiny" style={{ padding: '0 16px 12px', color: 'var(--txt-3)' }}>From {decided} decided submission{decided === 1 ? '' : 's'}{submissions.length > decided ? `, ${submissions.length - decided} still open` : ''}.</div>}
            </div>
          </div>

          <div className="card card-glow bg-gradient-card mt">
            <div className="sec-title"><h2>Rewards paid, last 7 days</h2><span className="tiny">the same window the flow above uses</span></div>
            {paidData.length === 0 ? <div className="tiny" style={{ padding: 16 }}>No campaign rewards were paid this week.</div> : <BarChart data={paidData} labels={labels} height={150} />}
          </div>
        </>
      )}
    </div>
  );
}
