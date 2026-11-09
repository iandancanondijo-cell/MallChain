import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, StatusChip } from '../../components/ui';
import { minesApi, type MinesSubmission } from '../../services/minesApi';
import { resolveProofLink } from '../../services/proofLink';
import { submissionChipToken, submissionState } from './submissionStatus';

/** What the reviewer is actually looking at, opened only if it is safe to open. */
function ProofRow({ value }: { value?: string }) {
  const proof = resolveProofLink(value);
  if (proof.kind === 'none') {
    return (
      <div className="tiny mt" style={{ color: proof.display ? 'var(--red-2)' : 'var(--txt-3)' }}>
        {proof.display ? `⛔ Proof is not an uploaded screenshot or http(s) link: ${proof.display}` : '⚠ No proof was attached to this submission.'}
      </div>
    );
  }
  return (
    <div className="tiny mt">
      <a className="mc-link-open" href={proof.href} target="_blank" rel="noopener noreferrer nofollow">
        {proof.kind === 'upload' ? `🖼 Your screenshot${proof.label ? ` · ${proof.label}` : ''}` : `🔗 Your proof link · ${proof.label}`} <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

/** My Submissions — real GET /api/mines/submissions/me (backend/src/routes/mines.js). */
export default function MinesParticipation({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();

  const [submissions, setSubmissions] = useState<MinesSubmission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await minesApi.mySubmissions();
    if (result.ok && result.data) {
      setSubmissions(result.data);
    } else {
      setError(result.error || 'Failed to load your submissions');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">My Submissions</h1><span className="sub">{submissions?.length ?? 0} submissions</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {!loading && submissions?.length === 0 && (
        <div className="empty-state"><div className="es-ico">🎯</div><div className="es-t">No submissions yet</div><div className="es-m">Discover campaigns and start earning Mallpoints.</div>
          <button className="btn btn-primary" onClick={() => navigate('/mines/discover')}>Discover campaigns →</button>
        </div>
      )}

      {(submissions || []).map((s) => {
        const state = submissionState(s);
        return (
        <div key={s._id} className="card card-glow bg-gradient-card mb">
          <div className="row">
            <div className="grow"><b>{s.title || `Submission ${s._id}`}</b> <span className="muted">· {new Date(s.created_at).toLocaleString()}</span></div>
            <StatusChip status={submissionChipToken(s)} />
            {state === 'paid' && <b className="gold">+{s.reward_amount} {s.reward_currency || 'MLPTS'}</b>}
          </div>
          {s.description && <div className="tiny" style={{ marginTop: 4, color: 'var(--txt-2)' }}>{s.description}</div>}
          <ProofRow value={s.proof_url} />
          {/* 'assigned'/'voting' means named reviewers hold the proof; anything
              else means it is sitting in an admin queue. Saying "pending
              reviewer consensus" for both told a participant their proof was
              being voted on when nothing of the sort had happened. */}
          {(state === 'reviewing' || state === 'queued') && (
            <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
              {state === 'reviewing'
                ? 'With your proof reviewers — nothing is paid until they approve it.'
                : 'Queued for review — nothing is paid until it is approved.'}
            </div>
          )}
          {state === 'rejected' && (
            <div style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 6 }}>
              ⚠ {s.rejection_note || 'Not approved by reviewers'}{' '}
              {s.campaign_id && <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/discover')}>Resubmit from Discover →</button>}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
