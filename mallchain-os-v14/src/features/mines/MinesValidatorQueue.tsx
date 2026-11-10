import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { minesApi, type AssignedTask, type ReviewerProfile, type ReviewerQueueSummary } from '../../services/minesApi';
import { blockedLinkTitle, resolveContentLink, resolveProofLink } from '../../services/proofLink';

/**
 * Proof Reviewer queue — real content-review game: submissions are randomly
 * assigned to 6 staked reviewers, votes are reputation-weighted, and the
 * submitter is rewarded once the weighted threshold resolves. See
 * backend/src/services/minesReviewService.js.
 *
 * The queue list is only the slice of the network's work that
 * /my-assigned handed this account, so on its own it cannot tell "nothing
 * needs reviewing" from "nobody has claimed this yet" — and the second case is
 * the one where a stake actually changes anything. GET
 * /api/task-assignment/reviewer/queue-summary counts the submissions
 * themselves, and its numbers drive the cards above the list.
 */
export default function MinesValidatorQueue() {
  useStoreVersion();

  const [profile, setProfile] = useState<ReviewerProfile | null>(null);
  const [tasks, setTasks] = useState<AssignedTask[] | null>(null);
  const [queue, setQueue] = useState<ReviewerQueueSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profileResult, queueResult, summaryResult] = await Promise.all([
      minesApi.getReviewerProfile(),
      minesApi.getQueue(),
      minesApi.reviewerQueueSummary(),
    ]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    if (queueResult.ok && queueResult.data) {
      setTasks(queueResult.data);
    } else if (!queueResult.ok) {
      setError(queueResult.error || 'Failed to load your review queue');
    }
    setQueue(summaryResult.ok && summaryResult.data ? summaryResult.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const castVote = async (taskId: string, vote: 'yes' | 'no') => {
    setVotingId(taskId);
    const result = await minesApi.vote(taskId, vote);
    setVotingId(null);
    if (result.ok) {
      // `status` is the submission's assignment_status after this vote —
      // 'voting' means the other reviewers still need to cast theirs, and
      // nothing has been paid yet. Say that instead of implying the task is done.
      const settled = result.data?.status === 'approved' || result.data?.status === 'auto_approved' || result.data?.status === 'rejected';
      toast(result.data?.status === 'rejected'
        ? 'Vote recorded — this submission was rejected'
        : settled
          ? 'Vote recorded — the review reached its decision'
          : 'Vote recorded — waiting on the other reviewers');
      load();
    } else {
      toast(result.error || 'Vote failed', false);
    }
  };

  const eligible = profile?.stakeStatus === 'active';
  // Both halves are needed (see services/validatorEligibility.js): a reviewer
  // who is staked but has no approved application is refused by the vote
  // route, so their buttons have to say which half is missing rather than
  // pointing at a stake they already hold.
  const approvalMissing = profile?.review_eligible === false && eligible;
  const canVote = eligible && !approvalMissing;

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Proof Reviewer Queue</h1>
        <span className="sub">Randomly assigned submissions — vote is weighted by your reputation</span>
        <span className="chip gold">{tasks?.length ?? 0} assigned to you</span>
        {queue && queue.awaiting_assignment > 0 && (
          <span className="chip">{fmtNum(queue.awaiting_assignment)} nobody has claimed</span>
        )}
      </div>

      {profile && (
        <div className="earn-grid stagger" style={{ marginBottom: 16 }}>
          <div className="card earn-card">
            <div className="lbl">Tasks awaiting verification</div>
            <div className="num">{fmtNum(queue?.awaiting_verification ?? 0)}</div>
            <div className="def">
              {queue
                ? queue.awaiting_assignment > 0
                  ? `${fmtNum(queue.awaiting_assignment)} of them no reviewer has claimed yet, so nobody is looking. ${fmtNum(queue.settled_last_24h)} decided in the last 24 hours.`
                  : `Every one is with a reviewer. ${fmtNum(queue.settled_last_24h)} decided in the last 24 hours.`
                : 'This server does not report the queue behind your assignments.'}
            </div>
            <div className="src">
              {queue?.oldest_waiting_since
                ? `task_submissions · oldest waiting since ${new Date(queue.oldest_waiting_since).toLocaleDateString()}`
                : 'task_submissions · non-terminal'}
            </div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Waiting on your vote</div>
            <div className="num">{fmtNum(queue?.waiting_for_my_vote ?? 0)}</div>
            <div className="def">
              {fmtNum(queue?.assigned_to_me ?? 0)} submission{queue?.assigned_to_me === 1 ? '' : 's'} carry your validator id; the rest of them are already voted. Only a vote from an active stake counts toward a decision.
            </div>
            <div className="src">task_submissions · assigned_validators</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Stake status</div>
            <div className="num" style={{ fontSize: 16 }}>{profile.stakeStatus || 'unstaked'}</div>
            <div className="def">
              {profile.stakeStatus === 'active'
                ? profile.validator_allowed === false
                  ? 'Staked, but no approved validator application covers this account, so nothing is assigned to you.'
                  : profile.validator_allowed === null || profile.validator_allowed === undefined
                    ? 'Stake half met. Whether an admin has approved a validator application for this account was not reported.'
                    : 'Both halves met — approved application plus active bond — so random assignment can reach you.'
                : `Nothing is assigned to an unstaked reviewer. The minimum is ${fmtNum(profile.minRequiredStake)} MLPTS.`}
            </div>
            <div className="src">mines_reviewers · stakeStatus + validator_applications · status</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Staked</div>
            <div className="num">{fmtNum(profile.stakedAmount)} <span className="unit" style={{ fontSize: 11 }}>MLPTS</span></div>
            <div className="def">Locked while you review and returned when you unstake; a bad streak of missed votes is what puts it at risk.</div>
            <div className="src">mines_reviewers · stakedAmount</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Reputation</div>
            <div className="num">{profile.mining_reputation}</div>
            <div className="def">The weight your vote carries when a panel resolves a submission — not a score you can spend.</div>
            <div className="src">mines_reviewers · mining_reputation</div>
          </div>
          <div className="card earn-card">
            <div className="lbl">Review earnings</div>
            <div className="num">{fmtNum(profile.total_earnings)} <span className="unit" style={{ fontSize: 11 }}>MLPTS</span></div>
            <div className="def">Paid for deciding other people&rsquo;s submissions, separately from anything you earned as a participant.</div>
            <div className="src">mines_reviewers · total_earnings</div>
          </div>
        </div>
      )}

      {!eligible && (
        <div className="card card-glow bg-gradient-card mb" style={{ borderColor: 'rgba(var(--section-accent-rgb),.35)' }}>
          <div className="t" style={{ fontWeight: 700 }}>You need an active reviewer stake to be assigned submissions</div>
          <div className="m" style={{ color: 'var(--txt-2)', marginTop: 4 }}>
            Minimum stake: {profile ? fmtNum(profile.minRequiredStake) : '—'} MLPTS.{' '}
            <a href="#/mines/reviewer/stake">Stake now →</a>
          </div>
        </div>
      )}

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="card card-glow bg-gradient-card">
        {loading && !tasks && <div className="tiny">Loading…</div>}
        {tasks?.length === 0 && (
          <div className="empty-state">
            <div className="es-ico">🛂</div>
            <div className="es-t">Queue empty — nothing assigned to you right now</div>
            <div className="es-m">
              {queue && queue.awaiting_verification > 0
                ? `${fmtNum(queue.awaiting_verification)} submission${queue.awaiting_verification === 1 ? '' : 's'} still await a decision network-wide; assignment is random among eligible reviewers.`
                : 'New submissions are randomly assigned to eligible reviewers as they arrive.'}
            </div>
          </div>
        )}
        {(tasks || []).map((t) => {
          const proof = resolveProofLink(t.proof_url);
          const taskLink = resolveContentLink(t.campaign_content_link);
          return (
            <div key={t._id} className="mc-queue-row">
              <div style={{ flex: 1 }}>
                <div className="t" style={{ fontWeight: 700, fontSize: 13 }}>{t.title || `Submission ${t._id}`}</div>
                {t.campaign_title && (
                  <div className="m" style={{ fontSize: 11.5, marginTop: 2 }}>
                    Campaign: <b>{t.campaign_title}</b>
                    {t.campaign_rate_per_task != null && <> · pays {fmtNum(t.campaign_rate_per_task)} MLPTS</>}
                    {t.campaign_status && t.campaign_status !== 'active' && <span className="mc-badge b-rejected"> campaign {t.campaign_status}</span>}
                  </div>
                )}
                {taskLink.kind === 'external' ? (
                  <div style={{ marginTop: 4 }}>
                    <a className="mc-link-open" href={taskLink.href} target="_blank" rel="noopener noreferrer nofollow">🔗 Task link · {taskLink.label} <span aria-hidden>↗</span></a>
                  </div>
                ) : taskLink.display ? (
                  /* The creator published something that is not an address a
                     reviewer can check against. Shown as inert text. */
                  <div style={{ marginTop: 4 }}>
                    <span className="mc-link-row mc-link-row--blocked" title={blockedLinkTitle(taskLink)}>🔗 {taskLink.display}</span>
                  </div>
                ) : null}
                <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)', marginTop: 4 }}>{t.description}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
                  <span className="chip">Votes: <b>{t.votes_yes + t.votes_no} / {t.votes_required}</b></span>
                  {t.voting_deadline && <span className="chip">Deadline: {new Date(t.voting_deadline).toLocaleString()}</span>}
                  {/* proof_url is participant-submitted text. It used to go straight into
                      href, so a stored `javascript:` payload executed with the reviewing
                      account's own session. resolveProofLink() only hands out an href for
                      http(s) or a ref it recognises as an uploaded screenshot. */}
                  {proof.kind !== 'none' ? (
                    <a className="chip" href={proof.href} target="_blank" rel="noopener noreferrer nofollow">
                      {proof.kind === 'upload' ? '🖼 View screenshot proof' : '🔗 View proof'} ↗
                    </a>
                  ) : (
                    <span className="chip mc-proof-unusable" title={proof.reason}>
                      {t.proof_url ? '⛔ Proof link blocked' : '⚠ No proof attached'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {t.has_voted ? (
                  <span className="mc-badge b-approved">voted {t.my_vote}</span>
                ) : (
                  <div className="row">
                    {/* The server refuses a vote unless both halves are in
                        place, so an enabled button here would only produce a
                        refusal. */}
                    <button className="btn btn-primary btn-sm" disabled={votingId === t._id || !canVote} onClick={() => castVote(t._id, 'yes')}>✓ Approve</button>
                    <button className="btn btn-ghost btn-sm" disabled={votingId === t._id || !canVote} onClick={() => castVote(t._id, 'no')}>✕ Reject</button>
                    {!canVote && (
                      <span className="tiny" style={{ color: 'var(--txt-3)' }}>
                        {approvalMissing
                          ? <>Validator approval required — <a href="#/validators/apply">apply</a></>
                          : <>Stake required — <a href="#/mines/reviewer/stake">Stake now</a></>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
