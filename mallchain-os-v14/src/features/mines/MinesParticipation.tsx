import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, StatusChip, fmtNum } from '../../components/ui';
import { minesApi, type MinesSubmission, type PendingOpen } from '../../services/minesApi';
import { resolveContentLink, resolveProofLink } from '../../services/proofLink';
import MinesTaskDetailModal from './MinesTaskDetail';
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

/**
 * Participation — everything this account has already met: link opens still
 * waiting for their screenshot (GET /opens/pending) and the submissions that
 * follow them (GET /submissions/me), including the ones sitting with
 * reviewers. Discover deliberately does not show any of it; a task crosses
 * this screen once, and from then on this is where its outcome is awaited.
 */
export default function MinesParticipation({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();

  const [submissions, setSubmissions] = useState<MinesSubmission[] | null>(null);
  const [opens, setOpens] = useState<PendingOpen[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [result, opensResult] = await Promise.all([
      minesApi.mySubmissions(),
      minesApi.pendingOpens(),
    ]);
    if (result.ok && result.data) {
      setSubmissions(result.data);
    } else {
      setError(result.error || 'Failed to load your submissions');
    }
    // A failed opens list is shown as its own row rather than hiding the
    // section: an empty "nothing outstanding" would be the wrong reassurance
    // when an attempt may still be waiting for its screenshot.
    if (opensResult.ok && opensResult.data) setOpens(opensResult.data);
    else setError(opensResult.error || 'Failed to load your open tasks');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">My Participation</h1><span className="sub">{opens.length} waiting on a screenshot · {submissions?.length ?? 0} submissions</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {opens.length > 0 && (
        <div className="card card-glow bg-gradient-card mb" style={{ borderColor: 'var(--amber)' }}>
          <div className="sec-title"><h2>Awaiting your screenshot</h2></div>
          <div className="tiny" style={{ color: 'var(--txt-2)' }}>
            You opened these and the attempt is already spent. Finish them here —
            the task is gone from Discover, and an open with no screenshot earns nothing.
          </div>
          {opens.map((o) => {
            const link = resolveContentLink(o.content_link);
            return (
              <div key={o.open_id} className="row" style={{ alignItems: 'flex-start', gap: 10, marginTop: 12 }}>
                <div className="grow">
                  <b>{o.title || `Task ${o.campaign_id}`}</b>
                  <div className="tiny" style={{ color: 'var(--txt-3)' }}>
                    opened {o.opened_at ? new Date(o.opened_at).toLocaleString() : 'earlier'} · attempt {o.slot}
                    {o.rate_per_task != null && <> · pays {fmtNum(o.rate_per_task)} MLPTS when reviewers approve</>}
                    {o.campaign_status !== 'active' && <> · campaign is {o.campaign_status}</>}
                  </div>
                  {link.kind === 'external' ? (
                    <a className="mc-link-open" href={link.href} target="_blank" rel="noopener noreferrer nofollow">
                      🔗 The task you opened{link.label ? ` · ${link.label}` : ''} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <div className="tiny" style={{ color: 'var(--txt-3)' }}>The address for this task is no longer openable — the screenshot still counts.</div>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setOpenTaskId(o.campaign_id)}>Finish the proof →</button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && opens.length === 0 && submissions?.length === 0 && (
        <div className="empty-state"><div className="es-ico">🎯</div><div className="es-t">Nothing outstanding</div><div className="es-m">No open task waiting on a screenshot and no submission waiting on a verdict. Discover campaigns and start earning Mallpoints.</div>
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
              ⚠ {s.rejection_note || 'Not approved by reviewers'} — that attempt is closed. A submitted task does not return to Discover, and no MLPTS moved.
            </div>
          )}
        </div>
        );
      })}

      {openTaskId && (
        <MinesTaskDetailModal
          campaignId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
