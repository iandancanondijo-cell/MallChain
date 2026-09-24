import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { minesApi, type MinesProfile, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';
import { Compass, Clock, Wallet, ShieldCheck, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';

/** Mines Command Center — discovery/rewards glassmorphism layout with real profile + campaign + submission data. */
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
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    else failures.push('Profile');
    if (campaignsResult.ok && campaignsResult.data) setCampaigns(campaignsResult.data);
    else failures.push('Campaigns');
    if (submissionsResult.ok && submissionsResult.data) setSubmissions(submissionsResult.data);
    else failures.push('Submissions');
    if (queueResult.ok && queueResult.data) setReviewQueueCount(queueResult.data.length);
    else failures.push('Review Queue');

    if (failures.length > 0) {
      const firstError = profileResult.error || campaignsResult.error || submissionsResult.error || queueResult.error;
      setFailedModules(failures);
      setError(
        failures.length === 4
          ? `Mines service unavailable — ${firstError || 'backend not reachable'}`
          : `Some Mines data could not load (${failures.join(', ')}). ${firstError || ''}`
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingSubmissions =
    submissions === null ? null : submissions.filter((s) => !['auto_approved', 'rejected'].includes(s.status)).length;

  const cards: Array<{
    label: string;
    icon: React.ReactNode;
    value: string | number | null | undefined;
    sub: string;
    path: string;
    degraded: boolean;
    color: string;
  }> = [
    {
      label: 'Active Campaigns',
      icon: <Compass size={20} />,
      value: failedModules.includes('Campaigns') ? 'N/A' : campaigns?.length ?? '—',
      sub: failedModules.includes('Campaigns') ? 'data unavailable' : 'live',
      path: '/mines/discover',
      degraded: failedModules.includes('Campaigns'),
      color: 'rgba(var(--section-accent-rgb),0.12)',
    },
    {
      label: 'My Pending Submissions',
      icon: <Clock size={20} />,
      value: failedModules.includes('Submissions') ? 'N/A' : pendingSubmissions ?? '—',
      sub: failedModules.includes('Submissions') ? 'data unavailable' : 'awaiting review',
      path: '/mines/participation',
      degraded: failedModules.includes('Submissions'),
      color: 'rgba(251,191,36,0.12)',
    },
    {
      label: 'Mallpoints Balance',
      icon: <Wallet size={20} />,
      value: failedModules.includes('Profile') ? 'N/A' : profile ? fmtNum(profile.mlpts_balance) : '—',
      sub: failedModules.includes('Profile') ? 'data unavailable' : 'MLPTS',
      path: '/mines/earnings',
      degraded: failedModules.includes('Profile'),
      color: 'rgba(34,197,94,0.12)',
    },
    {
      label: 'Reviewer Queue',
      icon: <ShieldCheck size={20} />,
      value: failedModules.includes('Review Queue') ? 'N/A' : reviewQueueCount ?? '—',
      sub: failedModules.includes('Review Queue') ? 'data unavailable' : 'assigned to you',
      path: '/mines/validator-queue',
      degraded: failedModules.includes('Review Queue'),
      color: 'rgba(var(--section-accent-rgb),0.08)',
    },
  ];

  return (
    <div>
      <div className="mc-hero">
        <h1>Mines Command Center</h1>
        <p>
          <b>Users are not miners.</b> Users are <b style={{ color: 'rgb(var(--section-accent-rgb))' }}>Campaign Participants</b> — completing real marketing
          tasks for Mallpoints. <b style={{ color: 'rgb(var(--section-accent-rgb))' }}>Proof Reviewers</b> are the trust layer that randomly votes on
          whether each participant genuinely completed a campaign.
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/mines/discover')}><Compass size={14} /> Discover Campaigns</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/participation')}>My Submissions</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/analytics')}>Performance</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/earnings')}><Sparkles size={14} /> Rewards</button>
        </div>
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
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
              display: 'flex', alignItems: 'center', gap: 14, padding: 16,
            }}
            onClick={() => navigate(c.path)}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: c.color,
              color: c.degraded ? 'var(--txt-3)' : 'rgb(var(--section-accent-rgb))',
              flexShrink: 0,
            }}>
              {c.degraded ? <AlertTriangle size={20} /> : c.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lbl" style={{ color: c.degraded ? 'var(--txt-3)' : undefined, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                {c.label}
              </div>
              <div className="num" style={{ color: c.degraded ? 'var(--txt-3)' : undefined, fontSize: 20, fontWeight: 800, marginTop: 3 }}>
                {c.value} <small style={{ fontSize: 10.5, color: 'var(--green-2)', fontWeight: 700 }}>{c.sub}</small>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: 'var(--txt-3)', flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title"><h2>Recent submissions</h2></div>
        {failedModules.includes('Submissions') ? (
          <div className="empty-state" style={{ padding: 22 }}>
            <div className="es-ico"><AlertTriangle size={28} /></div>
            <div className="es-t">Submissions data unavailable</div>
            <div className="es-m">The backend submissions endpoint is not reachable right now.</div>
          </div>
        ) : submissions?.length === 0 ? (
          <div className="wallet-empty-inline">No submissions yet — join a campaign to get started.</div>
        ) : (
          (submissions || []).slice(0, 6).map((s) => (
            <div key={s._id} className="list-row">
              <div className="grow">
                <div className="t">{s.title || `Submission ${s._id}`}</div>
                <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{s.status}</div>
              </div>
              {s.status === 'auto_approved' && (
                <span style={{ color: 'var(--green-2)', fontWeight: 700, fontSize: 13 }}>+{s.reward_amount} MLPTS</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
