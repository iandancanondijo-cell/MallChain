import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { minesApi, type AssignedTask, type ReviewerProfile } from '../../services/minesApi';

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
      toast(`Vote recorded — ${result.data?.status || 'thanks for reviewing'}`);
      load();
    } else {
      toast(result.error || 'Vote failed', false);
    }
  };

  const eligible = profile?.stakeStatus === 'active';

  return (
    <div>
      <div className="view-head">
        <h1>Proof Reviewer Queue</h1>
        <span className="sub">Randomly assigned submissions — vote is weighted by your reputation</span>
        <span className="chip gold">{tasks?.length ?? 0} assigned</span>
      </div>

      {profile && (
        <div className="mc-stats-grid" style={{ marginBottom: 16 }}>
          <div className="card"><div className="lbl">Stake status</div><div className="num" style={{ fontSize: 14 }}>{profile.stakeStatus}</div></div>
          <div className="card"><div className="lbl">Staked</div><div className="num">{fmtNum(profile.stakedAmount)} MLPTS</div></div>
          <div className="card"><div className="lbl">Reputation</div><div className="num">{profile.mining_reputation}</div></div>
          <div className="card"><div className="lbl">Earnings</div><div className="num">{fmtNum(profile.total_earnings)} MLPTS</div></div>
        </div>
      )}

      {!eligible && (
        <div className="card mb" style={{ borderColor: 'rgba(243,186,47,.35)' }}>
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

      <div className="card">
        {loading && !tasks && <div className="tiny">Loading…</div>}
        {tasks?.length === 0 && (
          <div className="empty-state"><div className="es-ico">🛂</div><div className="es-t">Queue empty — nothing assigned to you right now</div><div className="es-m">New submissions are randomly assigned to eligible reviewers as they arrive.</div></div>
        )}
        {(tasks || []).map((t) => (
          <div key={t._id} className="mc-queue-row">
            <div style={{ flex: 1 }}>
              <div className="t" style={{ fontWeight: 700, fontSize: 13 }}>{t.title || `Submission ${t._id}`}</div>
              <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)', marginTop: 2 }}>{t.description}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
                <span className="chip">Votes: <b>{t.votes_yes + t.votes_no} / {t.votes_required}</b></span>
                {t.voting_deadline && <span className="chip">Deadline: {new Date(t.voting_deadline).toLocaleString()}</span>}
                {t.proof_url && <a className="chip" href={t.proof_url} target="_blank" rel="noreferrer">View proof ↗</a>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {t.has_voted ? (
                <span className="mc-badge b-approved">voted {t.my_vote}</span>
              ) : (
                <div className="row">
                  <button className="btn btn-primary btn-sm" disabled={votingId === t._id} onClick={() => castVote(t._id, 'yes')}>✓ Approve</button>
                  <button className="btn btn-ghost btn-sm" disabled={votingId === t._id} onClick={() => castVote(t._id, 'no')}>✕ Reject</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
