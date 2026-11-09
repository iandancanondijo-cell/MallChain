import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, StatusChip } from '../../components/ui';
import { minesApi, type MinesSubmission } from '../../services/minesApi';
import { resolveProofLink } from '../../services/proofLink';
import { submissionChipToken, submissionState } from './submissionStatus';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * History — the campaign timeline, from GET /api/mines/submissions/me.
 *
 * This panel used to render the wallet ledger and call it "your campaign
 * timeline", so referral bonuses, admin adjustments and sign-up credits all
 * appeared as if they were Mines activity. Submissions are the only records
 * that actually describe a campaign, and each one carries its own decision.
 */
export default function MinesHistory() {
  useStoreVersion();

  const [subs, setSubs] = useState<MinesSubmission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await minesApi.mySubmissions(200);
    if (result.ok && result.data) {
      setSubs(result.data);
    } else {
      setError(result.error || 'Failed to load history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups: Array<{ day: string; items: MinesSubmission[] }> = [];
  for (const s of subs || []) {
    const key = dayKey(s.completed_at || s.created_at);
    let g = groups.find((x) => x.day === key);
    if (!g) { g = { day: key, items: [] }; groups.push(g); }
    g.items.push(s);
  }

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">History</h1><span className="sub">Your campaign timeline</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="empty-state"><div className="es-ico">🕘</div><div className="es-t">No campaign history yet</div><div className="es-m">Completed campaigns and rewards will appear here.</div></div>
      )}

      {groups.map((g) => (
        <div key={g.day} className="card card-glow bg-gradient-card mb">
          <div className="sec-title"><h2>{g.day}</h2></div>
          {g.items.map((s) => {
            const state = submissionState(s);
            const paid = state === 'paid';
            const proof = resolveProofLink(s.proof_url);
            return (
              <div key={s._id} className="list-row" style={{ flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>{paid ? '💰' : state === 'rejected' ? '🚫' : '⏳'}</span>
                <div className="grow">
                  <div className="t">{s.title || `Submission ${s._id}`}</div>
                  <div className="m">
                    {paid
                      ? `Approved${s.completed_at ? ` · ${new Date(s.completed_at).toLocaleTimeString()}` : ''}`
                      : state === 'rejected'
                        ? (s.rejection_note || 'Rejected by reviewers')
                        : state === 'reviewing' ? 'Waiting on reviewer votes' : 'Waiting to be reviewed'}
                  </div>
                  {proof.kind !== 'none' && (
                    <a className="mc-link-open" style={{ marginTop: 5 }} href={proof.href} target="_blank" rel="noopener noreferrer nofollow">
                      {proof.kind === 'upload' ? '🖼 Proof screenshot' : `🔗 ${proof.label}`} <span aria-hidden>↗</span>
                    </a>
                  )}
                </div>
                <StatusChip status={submissionChipToken(s)} />
                {paid
                  ? <b className="green">+{fmtNum(s.reward_amount)} {s.reward_currency || 'MLPTS'}</b>
                  : state === 'rejected'
                    ? <b className="red">0 MLPTS</b>
                    : <span className="muted" style={{ fontSize: 12 }}>unpaid</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
