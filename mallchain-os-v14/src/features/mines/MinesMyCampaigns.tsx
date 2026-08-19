import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStoreVersion, fmtNum, StatusChip, toast } from '../../components/ui';
import { minesApi, type MinesCampaign, type MinesProfile, type RewardRatesTable } from '../../services/minesApi';
import { PlatformIcon, PLATFORM_ICONS } from './platformIcons';

/**
 * My Campaigns — bring a content link + description, pick a platform/
 * activity, set a Mallpoints budget, and the reward per completion is
 * computed server-side as Base Reward x Campaign Multiplier (see
 * backend/src/services/rewardEngineService.js). Budget is escrowed from the
 * creator's own Mallpoints balance at creation time (backend/src/routes/
 * mines.js: POST /campaigns/create), and participants only get paid once a
 * reviewer-vote approves their submission — see MinesDiscover.tsx.
 */
export default function MinesMyCampaigns() {
  useStoreVersion();

  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [rates, setRates] = useState<RewardRatesTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profileResult, ratesResult] = await Promise.all([minesApi.getProfile(), minesApi.getRewardRates()]);
    if (!profileResult.ok || !profileResult.data) {
      setError(profileResult.error || 'Failed to load your profile');
      setLoading(false);
      return;
    }
    setProfile(profileResult.data);
    if (ratesResult.ok && ratesResult.data) setRates(ratesResult.data);
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
        <span className="sub">Bring a content link, set your budget, and let the network circulate it</span>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {rates && profile && (
        <CreateCampaignForm rates={rates} balance={profile.mlpts_balance} onCreated={load} />
      )}

      {!loading && campaigns?.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📣</div>
          <div className="es-t">You haven't created any campaigns yet</div>
          <div className="es-m">Use the form above to launch your first one.</div>
        </div>
      )}

      {(campaigns || []).map((c) => (
        <div key={c._id} className="card mb">
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            {c.platform && <PlatformIcon platform={c.platform} />}
            <div className="grow"><b>{c.title}</b> <StatusChip status={c.status} /></div>
            <span className="chip">{fmtNum(c.rate_per_task)} MLPTS/task · budget {fmtNum(c.budget_remaining)}</span>
          </div>
          {c.description && <div className="tiny mt" style={{ color: 'var(--txt-2)' }}>{c.description}</div>}
          {c.directive && <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>Directive: {c.directive}</div>}
          <div className="tiny mt">{c.completions_count} completions so far</div>
        </div>
      ))}
    </div>
  );
}

function CreateCampaignForm({
  rates,
  balance,
  onCreated,
}: {
  rates: RewardRatesTable;
  balance: number;
  onCreated: () => void;
}) {
  const platformKeys = useMemo(
    () => Object.keys(rates.platforms).filter((k) => PLATFORM_ICONS[k]),
    [rates]
  );
  const [platform, setPlatform] = useState(platformKeys[0] || '');
  const [activity, setActivity] = useState('');
  const [contentLink, setContentLink] = useState('');
  const [description, setDescription] = useState('');
  const [directive, setDirective] = useState('');
  const [multiplier, setMultiplier] = useState(1);
  const [budget, setBudget] = useState('50');
  const [busy, setBusy] = useState(false);

  const activities = platform ? Object.keys(rates.platforms[platform]?.activities || {}) : [];

  useEffect(() => {
    if (activities.length && !activities.includes(activity)) setActivity(activities[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const activityDef = platform && activity ? rates.platforms[platform]?.activities[activity] : null;
  const baseRate = activityDef ? (activityDef.rate ?? ((activityDef.min! + activityDef.max!) / 2)) : 0;
  const clampedMultiplier = Math.min(rates.maxMultiplier, Math.max(rates.minMultiplier, multiplier || 1));
  const previewRate = Math.round(baseRate * clampedMultiplier * 10000) / 10000;
  const budgetNum = parseFloat(budget) || 0;
  const maxCompletions = previewRate > 0 ? Math.floor(budgetNum / previewRate) : 0;

  const submit = async () => {
    if (!platform || !activity) {
      toast('Choose a platform and activity', false);
      return;
    }
    if (!contentLink.trim()) {
      toast('Add a content link', false);
      return;
    }
    if (budgetNum <= 0) {
      toast('Enter a Mallpoints budget', false);
      return;
    }
    if (budgetNum > balance) {
      toast(`Budget exceeds your Mallpoints balance (${fmtNum(balance)})`, false);
      return;
    }

    setBusy(true);
    const res = await minesApi.createCampaign({
      platform,
      activity_type: activity,
      content_link: contentLink.trim(),
      description: description.trim() || undefined,
      directive: directive.trim() || undefined,
      multiplier: clampedMultiplier,
      budget_mlpts: budgetNum,
    });
    setBusy(false);

    if (res.ok) {
      toast(`Campaign live — ${previewRate} MLPTS per completion`);
      setContentLink('');
      setDescription('');
      setDirective('');
      setBudget('50');
      onCreated();
    } else {
      toast(res.error || 'Failed to create campaign', false);
    }
  };

  return (
    <div className="card mb" style={{ maxWidth: 560 }}>
      <div className="field">
        <label>Platform</label>
        <div className="filter-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {platformKeys.map((k) => (
            <button
              key={k}
              type="button"
              className={`btn btn-sm ${platform === k ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPlatform(k)}
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PlatformIcon platform={k} size={14} /> {rates.platforms[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Activity</label>
        <select className="input" value={activity} onChange={(e) => setActivity(e.target.value)} disabled={busy}>
          {activities.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Content link</label>
        <input
          className="input"
          value={contentLink}
          onChange={(e) => setContentLink(e.target.value)}
          placeholder="https://…"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this campaign about?"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label>Directive (instructions for participants)</label>
        <textarea
          className="input"
          rows={2}
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="Exactly what should someone do? e.g. Follow the page and comment 'done'"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label>Multiplier ({rates.minMultiplier}x – {rates.maxMultiplier}x)</label>
        <input
          className="input"
          type="number"
          min={rates.minMultiplier}
          max={rates.maxMultiplier}
          step="0.1"
          value={multiplier}
          onChange={(e) => setMultiplier(parseFloat(e.target.value))}
          disabled={busy}
        />
        <div className="hint">Base rate {fmtNum(baseRate)} MLPTS × {clampedMultiplier}x = <b className="gold">{fmtNum(previewRate)} MLPTS</b> per completion</div>
      </div>

      <div className="field">
        <label>Total Mallpoints budget</label>
        <input className="input" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={busy} />
        <div className="hint">
          Your balance: {fmtNum(balance)} MLPTS · funds ~{maxCompletions} completion{maxCompletions === 1 ? '' : 's'} at this rate
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
        {busy && <span className="spin" />} Launch campaign
      </button>
    </div>
  );
}
