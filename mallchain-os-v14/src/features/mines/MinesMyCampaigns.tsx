import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, StatusChip } from '../../components/ui';
import { minesApi, type MinesCampaign, type MinesProfile } from '../../services/minesApi';

/**
 * My Campaigns — real campaigns you created (backend/src/routes/mines.js:
 * GET /campaigns/creator/:creatorId). Creating a campaign is admin-gated on
 * the backend (POST /campaigns requires requireAdmin), so this page is
 * read-only; new campaigns are set up from the Admin panel.
 */
export default function MinesMyCampaigns() {
  useStoreVersion();

  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const profileResult = await minesApi.getProfile();
    if (!profileResult.ok || !profileResult.data) {
      setError(profileResult.error || 'Failed to load your profile');
      setLoading(false);
      return;
    }
    setProfile(profileResult.data);
    const campaignsResult = await minesApi.myCampaigns(profileResult.data.id);
    if (campaignsResult.ok && campaignsResult.data) {
      setCampaigns(campaignsResult.data);
    } else {
      setError(campaignsResult.error || 'Failed to load your campaigns');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="view-head">
        <h1>My Campaigns</h1>
        <span className="sub">Campaigns created under your account</span>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {!loading && campaigns?.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📣</div>
          <div className="es-t">You haven't created any campaigns</div>
          <div className="es-m">Campaign creation is managed by admins — reach out via Admin → Mining Campaigns to launch one under {profile?.email || 'your account'}.</div>
        </div>
      )}

      {(campaigns || []).map((c) => (
        <div key={c._id} className="card mb">
          <div className="row">
            <div className="grow"><b>{c.title}</b> <StatusChip status={c.status} /></div>
            <span className="chip">{fmtNum(c.rate_per_task)} MLPTS/task · budget {fmtNum(c.budget_remaining)}</span>
          </div>
          {c.description && <div className="tiny mt" style={{ color: 'var(--txt-2)' }}>{c.description}</div>}
          <div className="tiny mt">{c.completions_count} completions so far</div>
        </div>
      ))}
    </div>
  );
}
