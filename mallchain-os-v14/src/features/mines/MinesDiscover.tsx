import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { minesApi, type MinesCampaign } from '../../services/minesApi';
import MinesTaskDetailModal from './MinesTaskDetail';
import { PlatformIcon } from './platformIcons';

/**
 * Discover — the campaigns this account has not met yet (backend/src/routes/
 * mines.js: GET /campaigns/available) and what they can still pay.
 *
 * Two rules the server enforces and this screen merely reflects: your own
 * creations never appear here, and neither does anything you have opened or
 * submitted. A task crosses your path once; after that it lives in
 * Participation — as a screenshot you still owe, then as a result you await.
 * Because of that, every card here is a task with all its link opens unspent,
 * so the earnable total is the plain arithmetic of rate x allowance, capped by
 * each campaign's remaining budget.
 *
 * A card is still a summary, never the task: it carries no address and no
 * participate button. Opening the task is the decision that costs an attempt —
 * POST /campaigns/:id/open spends one link open per completion slot, and an
 * open with no screenshot earns nothing — so the card hands that decision to
 * MinesTaskDetailModal, which shows the owner, the budget, the directive and
 * how many opens this account has left first. GET /campaigns/available strips
 * `content_link` for exactly that reason: a link sitting in a cached list is
 * a task that can be done without ever telling us.
 */
export default function MinesDiscover({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const [q, setQ] = useState('');
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const feed = await minesApi.listAvailableCampaigns();
    if (feed.ok && feed.data) {
      setCampaigns(feed.data.campaigns);
      setServerTotal(feed.data.available_mlpts);
    } else setError(feed.error || 'Failed to load campaigns');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const list = (campaigns || []).filter((c) => !q || (c.title + (c.description || '')).toLowerCase().includes(q.toLowerCase()));

  /** What one card can still pay this account: every open, up to the budget. */
  const earnable = (c: MinesCampaign) => Math.min(
    (Number(c.max_completions_per_user) || 1) * (Number(c.rate_per_task) || 0),
    Number(c.budget_remaining) || 0,
  );
  // The server's figure covers the whole feed; a search narrows what is on
  // screen, so the number beside it has to narrow the same way or it is a
  // total for tasks the user is not looking at.
  const totalMlpts = q ? list.reduce((sum, c) => sum + earnable(c), 0) : (serverTotal ?? 0);

  return (
    <div>
      <div className="view-head">
        <h1 className="text-gradient">Discover Campaigns</h1>
        <span className="sub">{list.length} tasks new to you</span>
        <span className="chip gold">up to {fmtNum(totalMlpts)} MLPTS here</span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/validator-queue')}>🛂 Reviewer queue</button>
      </div>

      <div className="mc-howto">
        <b>How a task pays</b>
        <span>Open the task once</span>
        <i>→</i>
        <span>Do the activity</span>
        <i>→</i>
        <span>Upload a screenshot</span>
        <i>→</i>
        <span>Reviewers approve it</span>
        <i>→</i>
        <b className="gold">MLPTS</b>
      </div>

      <div className="filter-row">
        <input className="input search" placeholder="Search campaigns…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {!loading && list.length === 0 && !error && (
        <div className="empty-state"><div className="es-ico">🧭</div><div className="es-t">Nothing here that you have not already done</div><div className="es-m">Campaigns leave this screen once you open them — your own creations never appear at all. Tasks you have started or submitted are under <b>Participation</b>, where you upload the screenshot or wait for the reviewers.</div></div>
      )}

      <div className="c-grid stagger">
        {list.map((c) => {
          const allowance = Number(c.max_completions_per_user) || 1;
          return (
            <div key={c._id} className="c-card card-glow bg-gradient-card card-hover">
              <div className="c-banner">
                <span className="pl-ico">{c.platform ? <PlatformIcon platform={c.platform} /> : '🎯'}</span>
                <div><div className="nm">{c.title}</div></div>
                <div className="rv">{fmtNum(c.rate_per_task)}<small>MLPTS</small></div>
              </div>
              <div className="c-body">
                <div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>{c.description}</div>
                {c.directive && (
                  <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}><b>Do this:</b> {c.directive}</div>
                )}
                <div className="c-meta">
                  <span><b>{c.completions_count}</b> paid completions</span>
                  <span>budget <b>{fmtNum(c.budget_remaining)}</b> left</span>
                </div>
                {/* Only what POST /submissions and /open actually enforce, so
                    the card cannot promise a second attempt the server will
                    refuse. */}
                <div className="mc-card-terms">
                  <span>1 link open per attempt</span>
                  <span>screenshot proves it</span>
                  {allowance > 1 && <span>up to {allowance} attempts</span>}
                  <span className="gold">up to {fmtNum(earnable(c))} MLPTS</span>
                </div>
              </div>
              <div className="c-foot">
                {/* No state, no "again": the feed only lists campaigns this
                    account has never met, so the only next step is the first. */}
                <button className="btn btn-primary" onClick={() => setOpenTaskId(c._id)}>
                  View task
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
