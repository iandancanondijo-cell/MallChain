import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, GroupedBarChart, MultiLineChart, LineChart } from '../../components/ui';
import { minesApi, type EarningsSummary } from '../../services/minesApi';

/**
 * Earnings — GET /api/mines/earnings/summary.
 *
 * This panel used to sum every credit in the wallet ledger and label it
 * "Your Mallpoints from validated campaigns", which counted referral bonuses,
 * admin adjustments and sign-up credits as if they were Mines rewards. The
 * summary route aggregates settled TaskSubmissions instead, so each number
 * here is a campaign reward and nothing else.
 *
 * Every figure is built by EarningCard, and every card carries its own
 * definition and its own provenance: a card that only says "12" can be read
 * as anything, and the whole point of this screen is that a participant knows
 * which money is settled, which is still with reviewers and which never moved.
 *
 * The charts answer the other question — what crossed your window against
 * what you actually did. Both series come from server records
 * (campaign_impressions against task_submissions), drawn on one shared scale
 * so the gap is the measurement rather than an artefact of rescaling.
 */

const SHOWN_COLOR = 'var(--cyan)';
const DONE_COLOR = 'var(--gold)';
const PAID_COLOR = 'var(--green)';

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface EarningCardProps {
  title: string;
  value: string;
  unit?: string;
  /** What the figure counts, written so the card means something on its own. */
  definition: string;
  /** Which record it came from — or why the server has not given one. */
  source: string;
  tone?: 'default' | 'warn' | 'bad';
}

function EarningCard({ title, value, unit, definition, source, tone = 'default' }: EarningCardProps) {
  const color = tone === 'bad' ? 'var(--red-2)' : tone === 'warn' ? 'var(--gold)' : undefined;
  return (
    <div className="card card-hover earn-card">
      <div className="lbl">{title}</div>
      <div className="num" style={color ? { color } : undefined}>
        {value}
        {unit ? <small> {unit}</small> : null}
      </div>
      <div className="def">{definition}</div>
      <div className="src">{source}</div>
    </div>
  );
}

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

  const activity = summary?.activity ?? [];
  const measured = activity.length > 0;
  const labels = activity.map((d) => dayLabel(d.date));
  const totalOf = (key: 'shown' | 'opened' | 'done' | 'paid_count' | 'paid_mlpts') =>
    activity.reduce((sum, row) => sum + (row[key] || 0), 0);
  const shownWeek = totalOf('shown');
  const openedWeek = totalOf('opened');
  const doneWeek = totalOf('done');
  const paidCountWeek = totalOf('paid_count');
  const paidWeek = Math.round(totalOf('paid_mlpts') * 1000) / 1000;
  // A percentage with no denominator is not zero, it is unknown — and a
  // screen that draws 0% for "nothing was shown to you" blames the user for
  // an opportunity they were never given.
  //
  // The window can also hold more proofs than recorded offers, because
  // submissions existed before the feed started logging what it served. A
  // ratio over 100% is not effort, it is two counters that started at
  // different times, and dividing them would print an absurd number and blame
  // the reader for a gap the server created.
  const ratioComputable = shownWeek > 0 && doneWeek <= shownWeek;
  const conversion = ratioComputable ? `${Math.round((doneWeek / shownWeek) * 100)}%` : '—';

  const shownSeries = { name: 'Appeared on your window', color: SHOWN_COLOR, data: activity.map((d) => d.shown) };
  const doneSeries = { name: 'You did', color: DONE_COLOR, data: activity.map((d) => d.done) };
  const paidDaily = activity.map((d) => Math.round(d.paid_mlpts * 1000) / 1000);

  const notMeasured = (
    <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>
      This server does not report what appeared on your Discover feed, so there is nothing to plot
      against the tasks you did. The reward figures above are unaffected.
    </div>
  );

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Earnings</h1>
        <span className="sub">
          {loading ? 'loading your settled rewards…' : 'Mallpoints paid from campaigns you completed'}
        </span>
      </div>

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
          <div className="earn-grid stagger">
            <EarningCard
              title="Earned from campaigns"
              value={fmtNum(summary.approvedMlpts)}
              unit="MLPTS"
              definition="Everything reviewers have approved you, since your first completed task."
              source="task_submissions · reward_amount on approved rows"
            />
            <EarningCard
              title="Paid in the last 7 days"
              value={fmtNum(summary.thisWeekMlpts)}
              unit="MLPTS"
              definition="Approvals that settled inside the same week the charts below draw."
              source="task_submissions · completed_at, 7 UTC days"
            />
            <EarningCard
              title="Approved tasks"
              value={String(summary.approvedCount)}
              unit="tasks"
              definition="Submissions a reviewer panel said yes to. These are the only ones that paid."
              source="task_submissions · status approved / auto_approved"
            />
            <EarningCard
              title="Refused tasks"
              value={String(summary.rejectedCount)}
              unit="tasks"
              definition="Proof the panel rejected. The attempt is closed and no Mallpoints moved on it."
              source="task_submissions · status rejected"
              tone="bad"
            />
            <EarningCard
              title="With reviewers now"
              value={String(summary.pendingCount)}
              unit="tasks"
              definition={summary.pendingCount
                ? `Waiting on a vote — worth up to ${fmtNum(summary.pendingMlptsAtStake)} MLPTS if the panel approves them.`
                : 'Nothing of yours is sitting with reviewers right now.'}
              source="task_submissions · unsettled, priced at the campaign's committed rate"
              tone="warn"
            />
            <EarningCard
              title="Average per approved task"
              value={fmtNum(summary.avgRewardMlpts)}
              unit="MLPTS"
              definition="Campaign earnings divided by approved tasks — the rate you are actually getting, not the advertised one."
              source="derived · approvedMlpts ÷ approvedCount"
            />
            <EarningCard
              title="Mallpoints balance"
              value={fmtNum(summary.balanceMlpts)}
              unit="MLPTS"
              definition="What the wallet holds now, from every source — campaigns, referrals, purchases — not only tasks."
              source="users.mlpts_balance"
            />
            <EarningCard
              title="On your window this week"
              value={measured ? String(shownWeek) : '—'}
              unit={measured ? 'tasks' : undefined}
              definition="Distinct campaigns Discover actually showed you in the last 7 days. Each one was a task you could have taken."
              source={measured
                ? `campaign_impressions · ${summary.impressions_since ? `counted since ${dayLabel(summary.impressions_since)}` : 'nothing served since counting began'}`
                : 'not measured by this server'}
            />
            <EarningCard
              title="You did this week"
              value={measured ? String(doneWeek) : '—'}
              unit={measured ? 'proofs' : undefined}
              definition={measured
                ? `Submissions you sent — ${openedWeek} task link${openedWeek === 1 ? '' : 's'} opened along the way. Only a submitted screenshot can be paid.`
                : 'Submissions you sent in the last 7 days.'}
              source="task_submissions · created_at, 7 UTC days"
            />
            <EarningCard
              title="Screen to action"
              value={measured ? conversion : '—'}
              definition={ratioComputable
                ? `Of ${shownWeek} task${shownWeek === 1 ? '' : 's'} that appeared, you completed ${doneWeek}. The rest were offered and left undone.`
                : shownWeek > 0
                  ? `More proofs (${doneWeek}) than recorded offers (${shownWeek}) in this window — the offer counter began after these submissions were already in, so the ratio cannot be computed yet.`
                  : 'No task has been shown to you inside the measured window, so there is nothing to divide by.'}
              source="derived · done ÷ shown"
            />
          </div>

          {summary.pendingCampaignsUnresolved > 0 && (
            <div className="card mb" style={{ borderColor: 'rgba(245,166,35,.3)' }}>
              <div className="tiny" style={{ color: 'var(--txt-2)' }}>
                ⚠ {summary.pendingCampaignsUnresolved} of your open submissions reference a campaign that no longer
                exists, so their value is not counted in the pending figure above.
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="card card-glow bg-gradient-card">
              <div className="sec-title">
                <h2>Tasks shown against tasks done</h2>
                <span className="sub">bars · last 7 days · one scale</span>
              </div>
              {measured ? (
                <>
                  <GroupedBarChart series={[shownSeries, doneSeries]} labels={labels} height={180} />
                  <div className="tiny" style={{ color: 'var(--txt-3)', padding: '10px 0 0' }}>
                    {shownWeek} appeared on your window · {doneWeek} you did · {fmtNum(paidWeek)} MLPTS paid across{' '}
                    {paidCountWeek} approved task{paidCountWeek === 1 ? '' : 's'}.
                  </div>
                </>
              ) : notMeasured}
            </div>

            <div className="card card-glow bg-gradient-card">
              <div className="sec-title">
                <h2>The same week as a trend</h2>
                <span className="sub">lines · whether the gap is closing</span>
              </div>
              {measured ? (
                <>
                  <MultiLineChart series={[shownSeries, doneSeries]} labels={labels} height={180} />
                  <div className="tiny" style={{ color: 'var(--txt-3)', padding: '10px 0 0' }}>
                    {shownWeek === 0
                      ? 'Nothing has been recorded on your window inside this window yet, so there is no gap to read.'
                      : doneWeek > shownWeek
                        ? `${doneWeek - shownWeek} more proof${doneWeek - shownWeek === 1 ? '' : 's'} than recorded offer${doneWeek - shownWeek === 1 ? '' : 's'} — the offer counter started later than this history, so the two lines overlap only from ${summary.impressions_since ? dayLabel(summary.impressions_since) : 'the first counted day'}.`
                        : doneWeek === shownWeek
                          ? 'You did every task that was shown to you this week.'
                          : `${shownWeek - doneWeek} task${shownWeek - doneWeek === 1 ? '' : 's'} appeared and went undone.`}
                  </div>
                </>
              ) : notMeasured}
            </div>
          </div>

          {measured && (
            <div className="card card-glow bg-gradient-card">
              <div className="sec-title">
                <h2>Reward paid per day</h2>
                <span className="sub">MLPTS approved · same 7 days as the comparison above</span>
              </div>
              <LineChart
                data={paidDaily}
                labels={labels}
                height={150}
                color={PAID_COLOR}
                formatValue={(v) => `${fmtNum(v)} MLPTS`}
              />
              <div className="tiny" style={{ color: 'var(--txt-3)', padding: '10px 0 0' }}>
                A flat day means nothing was approved that day, not that nothing was offered — the comparison above
                is where the offers show.{' '}
                {summary.impressions_since
                  ? `Counting what appears on your window began ${dayLabel(summary.impressions_since)}; days before that were never measured, so they are not drawn as empty.`
                  : 'Nothing has been served to this account since impression counting began, so the two series have no shared history yet.'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
