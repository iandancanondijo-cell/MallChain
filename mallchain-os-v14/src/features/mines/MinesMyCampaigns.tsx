import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, StatusChip, toast } from '../../components/ui';
import { minesApi, type MinesCampaign, type MinesProfile, type RewardRatesTable } from '../../services/minesApi';
import { PlatformIcon, PlatformBadge, PLATFORM_BRAND } from './platformIcons';

/**
 * My Campaigns — bring a content link + description, pick a platform/
 * activity, set a Mallpoints budget, and the reward per completion is
 * computed server-side as Base Reward x Campaign Multiplier (see
 * backend/src/services/rewardEngineService.js). Budget is escrowed from the
 * creator's own Mallpoints balance at creation time (backend/src/routes/
 * mines.js: POST /campaigns/create), and participants only get paid once a
 * reviewer-vote approves their submission — see MinesDiscover.tsx.
 *
 * Creation is a 2-step flow: pick a platform first (real brand marks, one
 * tap), then fill in the campaign's details against that platform's real
 * activity rates — rather than one long form with every field, including
 * platform, in a single flat list.
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
        <CreateCampaignWizard rates={rates} balance={profile.mlpts_balance} onCreated={load} />
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

const PLATFORM_ORDER = [
  'tiktok', 'instagram', 'youtube', 'whatsapp', 'telegram', 'facebook', 'threads', 'x',
  'snapchat', 'reddit', 'discord', 'linkedin', 'pinterest', 'twitch', 'spotify', 'medium',
];

function CreateCampaignWizard({
  rates,
  balance,
  onCreated,
}: {
  rates: RewardRatesTable;
  balance: number;
  onCreated: () => void;
}) {
  const platformKeys = PLATFORM_ORDER.filter((k) => rates.platforms[k] && PLATFORM_BRAND[k]);
  const [platform, setPlatform] = useState<string | null>(null);

  // Step 1: platform picker.
  if (!platform) {
    return (
      <div className="card mb">
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: 'var(--txt-3)', textTransform: 'uppercase', marginBottom: 12 }}>Step 1 · Choose a platform</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          {platformKeys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPlatform(k)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 8px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                cursor: 'pointer',
                color: 'var(--txt)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <PlatformBadge platform={k} size={44} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{rates.platforms[k].label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <CampaignDetailsStep
      platform={platform}
      rates={rates}
      balance={balance}
      onBack={() => setPlatform(null)}
      onCreated={() => {
        setPlatform(null);
        onCreated();
      }}
    />
  );
}

function CampaignDetailsStep({
  platform,
  rates,
  balance,
  onBack,
  onCreated,
}: {
  platform: string;
  rates: RewardRatesTable;
  balance: number;
  onBack: () => void;
  onCreated: () => void;
}) {
  const activities = Object.keys(rates.platforms[platform]?.activities || {});
  const [activity, setActivity] = useState(activities[0] || '');
  const [contentLink, setContentLink] = useState('');
  const [description, setDescription] = useState('');
  const [directive, setDirective] = useState('');
  const [multiplier, setMultiplier] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [budget, setBudget] = useState('50');
  const [busy, setBusy] = useState(false);

  const brand = PLATFORM_BRAND[platform];
  const activityDef = activity ? rates.platforms[platform]?.activities[activity] : null;
  const baseRate = activityDef ? (activityDef.rate ?? ((activityDef.min! + activityDef.max!) / 2)) : 0;
  const clampedMultiplier = Math.min(rates.maxMultiplier, Math.max(rates.minMultiplier, multiplier || 1));
  const previewRate = Math.round(baseRate * clampedMultiplier * 10000) / 10000;
  const budgetNum = parseFloat(budget) || 0;
  const maxCompletions = previewRate > 0 ? Math.floor(budgetNum / previewRate) : 0;

  const submit = async () => {
    if (!activity) {
      toast('Choose an activity', false);
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
      onCreated();
    } else {
      toast(res.error || 'Failed to create campaign', false);
    }
  };

  return (
    <div className="grid-2 mb">
      <div className="card">
        <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <PlatformBadge platform={platform} size={36} />
          <div className="grow">
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Step 2 · Campaign details</div>
            <div style={{ fontWeight: 700 }}>{brand?.label}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} disabled={busy}>
            ← Change platform
          </button>
        </div>

        <div className="field">
          <label>What should count as a completion?</label>
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
          <label>Mallpoints you'd like to spend</label>
          <input className="input" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={busy} />
          <div className="hint">Your balance: {fmtNum(balance)} MLPTS</div>
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy} style={{ marginTop: 8 }}>
          {busy && <span className="spin" />} Launch campaign
        </button>
      </div>

      <div>
        <div className="card mb">
          <div className="sec-title"><h2>Outcome</h2></div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            <span className="gold">{fmtNum(previewRate)}</span> <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-3)' }}>MLPTS / completion</span>
          </div>
          <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
            Funds ~<b style={{ color: 'var(--txt)' }}>{maxCompletions}</b> completion{maxCompletions === 1 ? '' : 's'} from a {fmtNum(budgetNum)} MLPTS budget
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12, padding: '2px 0' }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '− Hide' : '+ Adjust'} reward boost
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 8 }}>
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
              <div className="hint">
                Boost multiplier ({rates.minMultiplier}x – {rates.maxMultiplier}x) · base rate {fmtNum(baseRate)} MLPTS × {clampedMultiplier}x
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="sec-title"><h2>What participants will see</h2></div>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PlatformBadge platform={platform} size={28} />
            <b>{brand?.label}</b>
            <span className="chip gold" style={{ marginLeft: 'auto' }}>{fmtNum(previewRate)} MLPTS</span>
          </div>
          <div className="tiny" style={{ color: 'var(--txt-2)' }}>{description.trim() || 'Your campaign description will appear here.'}</div>
          {directive.trim() && <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>Directive: {directive.trim()}</div>}
          {contentLink.trim() && (
            <div className="tiny mt" style={{ color: 'var(--cyan)', wordBreak: 'break-all' }}>{contentLink.trim()}</div>
          )}
        </div>
      </div>
    </div>
  );
}
