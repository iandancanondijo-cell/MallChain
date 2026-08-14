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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profileResult, campaignsResult, submissionsResult, queueResult] = await Promise.all([
      minesApi.getProfile(),
      minesApi.listActiveCampaigns(),
      minesApi.mySubmissions(),
      minesApi.getQueue(),
    ]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    if (campaignsResult.ok && campaignsResult.data) setCampaigns(campaignsResult.data);
    if (submissionsResult.ok && submissionsResult.data) setSubmissions(submissionsResult.data);
    if (queueResult.ok && queueResult.data) setReviewQueueCount(queueResult.data.length);
    if (!profileResult.ok) setError(profileResult.error || 'Failed to load your Mines profile');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingSubmissions = (submissions || []).filter((s) => !['auto_approved', 'rejected'].includes(s.status)).length;

  const cards = [
    { label: 'Active Campaigns', icon: '🎯', value: campaigns?.length ?? '—', sub: 'live', path: '/mines/discover' },
    { label: 'My Pending Submissions', icon: '⏳', value: pendingSubmissions, sub: 'awaiting review', path: '/mines/participation' },
    { label: 'Mallpoints Balance', icon: '💰', value: profile ? fmtNum(profile.mlpts_balance) : '—', sub: 'MLPTS', path: '/mines/earnings' },
    { label: 'Reviewer Queue', icon: '🛂', value: reviewQueueCount ?? '—', sub: 'assigned to you', path: '/mines/validator-queue' },
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

      <div className="sec-title"><h2>Your Mines snapshot</h2><span className="sub">{loading ? 'loading…' : 'live from your account'}</span></div>
      <div className="mc-stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate(c.path)}>
            <div className="lbl">{c.icon} {c.label}</div>
            <div className="num">{c.value} <small>{c.sub}</small></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Recent submissions</h2></div>
        {submissions?.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 22 }}>No submissions yet — join a campaign to get started.</div>}
        {(submissions || []).slice(0, 6).map((s) => (
          <div key={s._id} className="list-row">
            <div className="grow">
              <div className="t">{s.title || `Submission ${s._id}`}</div>
              <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{s.status}</div>
            </div>
            {s.status === 'auto_approved' && <b className="green">+{s.reward_amount} MLPTS</b>}
          </div>
        ))}
      </div>
    </div>
  );
}
