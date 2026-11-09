import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { minesApi, type AssignedTask, type ReviewerProfile } from '../../services/minesApi';
import { blockedLinkTitle, resolveContentLink, resolveProofLink } from '../../services/proofLink';

/**
 * Proof Reviewer queue — real content-review game: submissions are randomly
 * assigned to 6 staked reviewers, votes are reputation-weighted, and the
 * submitter is rewarded once the weighted threshold resolves. See
 * backend/src/services/minesReviewService.js.
 */
export default function MinesValidatorQueue() {
  useStoreVersion();

  const [profile, setProfile] = useState<ReviewerProfile | null>(null);
  const [tasks, setTasks] = useState<AssignedTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profileResult, queueResult] = await Promise.all([minesApi.getReviewerProfile(), minesApi.getQueue()]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    if (queueResult.ok && queueResult.data) {
      setTasks(queueResult.data);
    } else if (!queueResult.ok) {
      setError(queueResult.error || 'Failed to load your review queue');
    }
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

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Proof Reviewer Queue</h1>
        <span className="sub">Randomly assigned submissions — vote is weighted by your reputation</span>
        <span className="chip gold">{tasks?.length ?? 0} assigned</span>
      </div>

      {profile && (
        <div className="mc-stats-grid stagger" style={{ marginBottom: 16 }}>
          <div className="card card-hover"><div className="lbl">Stake status</div><div className="num" style={{ fontSize: 14 }}>{profile.stakeStatus || 'unstaked'}</div></div>
          <div className="card card-hover"><div className="lbl">Staked</div><div className="num">{fmtNum(profile.stakedAmount)} MLPTS</div></div>
          <div className="card card-hover"><div className="lbl">Reputation</div><div className="num">{profile.mining_reputation}</div></div>
          <div className="card card-hover"><div className="lbl">Earnings</div><div className="num">{fmtNum(profile.total_earnings)} MLPTS</div></div>
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
          <div className="empty-state"><div className="es-ico">🛂</div><div className="es-t">Queue empty — nothing assigned to you right now</div><div className="es-m">New submissions are randomly assigned to eligible reviewers as they arrive.</div></div>
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
                    {/* The server refuses a vote without an active stake, so an
                        enabled button here would only produce a refusal. */}
                    <button className="btn btn-primary btn-sm" disabled={votingId === t._id || !eligible} onClick={() => castVote(t._id, 'yes')}>✓ Approve</button>
                    <button className="btn btn-ghost btn-sm" disabled={votingId === t._id || !eligible} onClick={() => castVote(t._id, 'no')}>✕ Reject</button>
                    {!eligible && (
                      <span className="tiny" style={{ color: 'var(--txt-3)' }}>Stake required — <a href="#/mines/reviewer/stake">Stake now</a></span>
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
