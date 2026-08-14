import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, StatusChip } from '../../components/ui';
import { minesApi, type MinesSubmission } from '../../services/minesApi';

const STATUS_MAP: Record<string, string> = {
  manual_review: 'pending',
  assigned: 'pending',
  voting: 'pending',
  auto_approved: 'approved',
  rejected: 'rejected',
};

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
      <div className="view-head"><h1>My Submissions</h1><span className="sub">{submissions?.length ?? 0} submissions</span></div>

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

      {(submissions || []).map((s) => (
        <div key={s._id} className="card mb">
          <div className="row">
            <div className="grow"><b>{s.title || `Submission ${s._id}`}</b> <span className="muted">· {new Date(s.created_at).toLocaleString()}</span></div>
            <StatusChip status={STATUS_MAP[s.status] || s.status} />
            {s.status === 'auto_approved' && <b className="gold">+{s.reward_amount} MLPTS</b>}
          </div>
          {s.description && <div className="tiny" style={{ marginTop: 4, color: 'var(--txt-2)' }}>{s.description}</div>}
          {s.status === 'rejected' && (
            <div style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 6 }}>
              ⚠ {s.rejection_note || 'Not approved by reviewers'}{' '}
              {s.campaign_id && <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/discover')}>Resubmit from Discover →</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
