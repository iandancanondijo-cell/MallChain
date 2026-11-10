import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { minesApi, type MinesProfile, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';
import { submissionLabel, submissionState } from './submissionStatus';
import { Compass, Clock, Wallet, ShieldCheck, AlertTriangle, Sparkles, ArrowRight, Camera } from 'lucide-react';

/** Mines Command Center — discovery/rewards glassmorphism layout with real profile + campaign + submission data. */
export default function MinesHome({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();

  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [earnable, setEarnable] = useState<number | null>(null);
  const [opensAwaitingProof, setOpensAwaitingProof] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<MinesSubmission[] | null>(null);
  const [reviewQueueCount, setReviewQueueCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedModules, setFailedModules] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFailedModules([]);
    const [profileResult, campaignsResult, submissionsResult, queueResult, opensResult] = await Promise.all([
      minesApi.getProfile(),
      minesApi.listAvailableCampaigns(),
      minesApi.mySubmissions(),
      minesApi.getQueue(),
      minesApi.pendingOpens(),
    ]);

    const failures: string[] = [];
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data);
    else failures.push('Profile');
    // The per-user feed, not the public list: this card counts what the
    // account can still attempt, so it has to exclude its own campaigns and
    // everything it already touched — the same screen Discover shows.
    if (campaignsResult.ok && campaignsResult.data) {
      setCampaigns(campaignsResult.data.campaigns);
      setEarnable(campaignsResult.data.available_mlpts);
    } else failures.push('Campaigns');
    if (submissionsResult.ok && submissionsResult.data) setSubmissions(submissionsResult.data);
    else failures.push('Submissions');
    if (queueResult.ok && queueResult.data) setReviewQueueCount(queueResult.data.length);
    else failures.push('Review Queue');
    if (opensResult.ok && opensResult.data) setOpensAwaitingProof(opensResult.data.length);
    else failures.push('Open Tasks');

    if (failures.length > 0) {
      const firstError = profileResult.error || campaignsResult.error || submissionsResult.error || queueResult.error || opensResult.error;
      setFailedModules(failures);
      setError(
        failures.length === 5
          ? `Mines service unavailable — ${firstError || 'backend not reachable'}`
          : `Some Mines data could not load (${failures.join(', ')}). ${firstError || ''}`
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingSubmissions =
    submissions === null ? null : submissions.filter((s) => submissionState(s) !== 'paid' && submissionState(s) !== 'rejected').length;

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
      label: 'Tasks New to You',
      icon: <Compass size={20} />,
      value: failedModules.includes('Campaigns') ? 'N/A' : campaigns?.length ?? '—',
      sub: failedModules.includes('Campaigns')
        ? 'data unavailable'
        : earnable === null ? 'live' : `${fmtNum(earnable)} MLPTS earnable`,
      path: '/mines/discover',
      degraded: failedModules.includes('Campaigns'),
      color: 'rgba(var(--section-accent-rgb),0.12)',
    },
    {
      // The attempt a link open spent and the screenshot has not yet paid for.
      // Discover drops these, so if the snapshot dropped them too the user
      // would have nowhere that reminds them the attempt is still live.
      label: 'Awaiting Your Screenshot',
      icon: <Camera size={20} />,
      value: failedModules.includes('Open Tasks') ? 'N/A' : opensAwaitingProof ?? '—',
      sub: failedModules.includes('Open Tasks') ? 'data unavailable' : 'open, unproven',
      path: '/mines/participation',
      degraded: failedModules.includes('Open Tasks'),
      color: 'rgba(251,191,36,0.12)',
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
        <h1 className="text-gradient">Mines Command Center</h1>
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
      <div className="mc-stats-grid stagger">
        {cards.map((c) => (
          <div
            key={c.label}
            className="card card-hover card-glow bg-gradient-card"
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

      <div className="card card-glow bg-gradient-card">
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
          (submissions || []).slice(0, 6).map((s) => {
            const state = submissionState(s);
            return (
            <div key={s._id} className="list-row">
              <div className="grow">
                <div className="t">{s.title || `Submission ${s._id}`}</div>
                <div className="m" style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{submissionLabel(s)}</div>
              </div>
              {state === 'paid' ? (
                <span style={{ color: 'var(--green-2)', fontWeight: 700, fontSize: 13 }}>+{fmtNum(s.reward_amount)} {s.reward_currency || 'MLPTS'}</span>
              ) : state === 'rejected' ? (
                <span style={{ color: 'var(--red-2)', fontWeight: 700, fontSize: 12 }}>no reward</span>
              ) : (
                <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>unpaid</span>
              )}
            </div>
            );
          })
        )}
      </div>

      <div className="card card-glow bg-gradient-card mt">
        <div className="sec-title"><h2>How a campaign pays</h2></div>
        <ol className="mc-flow">
          <li><b>1 · Discover</b><span>Pick an active campaign and see what it pays.</span></li>
          <li><b>2 · Open the task</b><span>The creator's published link opens in a new tab.</span></li>
          <li><b>3 · Do the activity</b><span>Follow the directive on the platform itself.</span></li>
          <li><b>4 · Upload proof</b><span>A screenshot from your account, or the link to your post.</span></li>
          <li><b>5 · Reviewers vote</b><span>Up to six staked reviewers decide, weighted by reputation. With nobody staked, an admin reviews it instead.</span></li>
          <li><b>6 · Paid</b><span>Approved rewards land in your Mallpoints balance.</span></li>
        </ol>
        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
          Nothing pays before step 6 — a submission sitting in review is not an earning yet.
        </div>
      </div>
    </div>
  );
}
