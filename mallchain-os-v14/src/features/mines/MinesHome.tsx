import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { minesApi, type MinesProfile, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';

/** Mines Command Center — real profile + campaign + submission counts (backend/src/routes/mines.js). */
export default function MinesHome({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();

  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [submissions, setSubmissions] = useState<MinesSubmission[] | null>(null);
  const [reviewQueueCount, setReviewQueueCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedModules, setFailedModules] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFailedModules([]);
    const [profileResult, campaignsResult, submissionsResult, queueResult] = await Promise.all([
      minesApi.getProfile(),
      minesApi.listActiveCampaigns(),
      minesApi.mySubmissions(),
      minesApi.getQueue(),
    ]);

    const failures: string[] = [];
    if (profileResult.ok && profileResult.data) {
      setProfile(profileResult.data);
    } else {
      failures.push('Profile');
    }
    if (campaignsResult.ok && campaignsResult.data) {
      setCampaigns(campaignsResult.data);
    } else {
      failures.push('Campaigns');
    }
    if (submissionsResult.ok && submissionsResult.data) {
      setSubmissions(submissionsResult.data);
    } else {
      failures.push('Submissions');
    }
    if (queueResult.ok && queueResult.data) {
      setReviewQueueCount(queueResult.data.length);
    } else {
      failures.push('Review Queue');
    }

    if (failures.length > 0) {
      const firstError =
        profileResult.error ||
        campaignsResult.error ||
        submissionsResult.error ||
        queueResult.error;
      setFailedModules(failures);
      setError(
        failures.length === 4
          ? `Mines service unavailable — ${firstError || 'backend not reachable'}`
          : `Some Mines data could not load (${failures.join(', ')}). ${firstError || ''}`
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingSubmissions =
    submissions === null ? null : submissions.filter((s) => !['auto_approved', 'rejected'].includes(s.status)).length;

  const cards: Array<{
    label: string;
    icon: string;
    value: string | number | null | undefined;
    sub: string;
    path: string;
    degraded: boolean;
  }> = [
    {
      label: 'Active Campaigns',
      icon: '🎯',
      value: failedModules.includes('Campaigns') ? 'N/A' : campaigns?.length ?? '—',
      sub: failedModules.includes('Campaigns') ? 'data unavailable' : 'live',
      path: '/mines/discover',
      degraded: failedModules.includes('Campaigns'),
    },
    {
      label: 'My Pending Submissions',
      icon: '⏳',
      value: failedModules.includes('Submissions') ? 'N/A' : pendingSubmissions ?? '—',
      sub: failedModules.includes('Submissions') ? 'data unavailable' : 'awaiting review',
      path: '/mines/participation',
      degraded: failedModules.includes('Submissions'),
    },
    {
      label: 'Mallpoints Balance',
      icon: '💰',
      value: failedModules.includes('Profile') ? 'N/A' : profile ? fmtNum(profile.mlpts_balance) : '—',
      sub: failedModules.includes('Profile') ? 'data unavailable' : 'MLPTS',
      path: '/mines/earnings',
      degraded: failedModules.includes('Profile'),
    },
    {
      label: 'Reviewer Queue',
      icon: '🛂',
      value: failedModules.includes('Review Queue') ? 'N/A' : reviewQueueCount ?? '—',
      sub: failedModules.includes('Review Queue') ? 'data unavailable' : 'assigned to you',
      path: '/mines/validator-queue',
      degraded: failedModules.includes('Review Queue'),
    },
  ];

  return (
    <div>
      <div className="mc-hero">
        <h1>Mines Command Center</h1>
        <p>
          <b>Users are not miners.</b> Users are <b className="gold">Campaign Participants</b> — completing real marketing
          tasks for Mallpoints. <b className="gold">Proof Reviewers</b> are the trust layer that randomly votes on
          whether each participant genuinely completed a campaign.
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/mines/discover')}>🧭 Discover Campaigns</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/participation')}>My Submissions</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/analytics')}>Performance</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/earnings')}>Rewards</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="sec-title">
        <h2>Your Mines snapshot</h2>
        <span className="sub">
          {loading ? 'loading…' : failedModules.length > 0 ? `${failedModules.length} module(s) unavailable — partial data` : 'live from your account'}
        </span>
      </div>
      <div className="mc-stats-grid">
        {cards.map((c) => (
          <div
            key={c.label}
            className="card card-hover"
            style={{
              cursor: 'pointer',
              opacity: c.degraded ? 0.65 : 1,
              borderColor: c.degraded ? 'var(--line-2)' : undefined,
            }}
            onClick={() => navigate(c.path)}
          >
            <div className="lbl" style={{ color: c.degraded ? 'var(--txt-3)' : undefined }}>
              {c.icon} {c.label}
              {c.degraded && <span title="This module's data could not be loaded from the backend" aria-label="degraded"> ⚠</span>}
            </div>
            <div className="num" style={{ color: c.degraded ? 'var(--txt-3)' : undefined }}>
              {c.value} <small>{c.sub}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Recent submissions</h2></div>
        {failedModules.includes('Submissions') ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 22, textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>Submissions data unavailable</div>
            <div className="tiny" style={{ marginTop: 4 }}>
              The backend submissions endpoint is not reachable right now.
            </div>
          </div>
        ) : submissions?.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 22 }}>No submissions yet — join a campaign to get started.</div>
        ) : (
          (submissions || []).slice(0, 6).map((s) => (
            <div key={s._id} className="list-row">
              <div className="grow">
                <div className="t">{s.title || `Submission ${s._id}`}</div>
                <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{s.status}</div>
              </div>
              {s.status === 'auto_approved' && <b className="green">+{s.reward_amount} MLPTS</b>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
