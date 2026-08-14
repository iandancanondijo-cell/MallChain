import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, Modal, toast } from '../../components/ui';
import { minesApi, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';

/** Discover — real active campaigns (backend/src/routes/mines.js: GET /campaigns/active) + submit proof. */
export default function MinesDiscover({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const [q, setQ] = useState('');
  const [campaigns, setCampaigns] = useState<MinesCampaign[] | null>(null);
  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitFor, setSubmitFor] = useState<MinesCampaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [campaignsResult, submissionsResult] = await Promise.all([
      minesApi.listActiveCampaigns(),
      minesApi.mySubmissions(),
    ]);
    if (campaignsResult.ok && campaignsResult.data) setCampaigns(campaignsResult.data);
    else setError(campaignsResult.error || 'Failed to load campaigns');
    if (submissionsResult.ok && submissionsResult.data) setSubmissions(submissionsResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const list = (campaigns || []).filter((c) => !q || (c.title + (c.description || '')).toLowerCase().includes(q.toLowerCase()));

  const submissionFor = (campaignId: string) =>
    submissions.filter((s) => s.campaign_id === campaignId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

  return (
    <div>
      <div className="view-head">
        <h1>Discover Campaigns</h1>
        <span className="sub">{list.length} active campaigns</span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mines/validator-queue')}>🛂 Reviewer queue</button>
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
        <div className="empty-state"><div className="es-ico">🧭</div><div className="es-t">No active campaigns right now</div><div className="es-m">Check back soon — new campaigns appear here as they go live.</div></div>
      )}

      <div className="c-grid">
        {list.map((c) => {
          const mySub = submissionFor(c._id);
          return (
            <div key={c._id} className="c-card">
              <div className="c-banner">
                <span className="pl-ico">🎯</span>
                <div><div className="nm">{c.title}</div></div>
                <div className="rv">{c.rate_per_task}<small>MLPTS</small></div>
              </div>
              <div className="c-body">
                <div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>{c.description}</div>
                <div className="c-meta">
                  <span><b>{c.completions_count}</b> completions</span>
                  <span>budget <b>{c.budget_remaining}</b></span>
                </div>
              </div>
              <div className="c-foot">
                {mySub && !['rejected'].includes(mySub.status) ? (
                  <span className="mc-badge b-pending">{mySub.status}</span>
                ) : (
                  <button className="btn btn-primary" onClick={() => setSubmitFor(c)}>{mySub ? 'Resubmit' : 'Participate'}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {submitFor && (
        <SubmitProofModal
          campaign={submitFor}
          onClose={() => setSubmitFor(null)}
          onSubmitted={() => {
            setSubmitFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SubmitProofModal({ campaign, onClose, onSubmitted }: { campaign: MinesCampaign; onClose: () => void; onSubmitted: () => void }) {
  const [description, setDescription] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const result = await minesApi.submitTask({
      campaign_id: campaign._id,
      title: campaign.title,
      description,
      proof_url: proofUrl || undefined,
    });
    setBusy(false);
    if (result.ok) {
      toast(`Submitted — ${campaign.rate_per_task} MLPTS pending reviewer consensus`);
      onSubmitted();
    } else {
      toast(result.error || 'Submission failed', false);
    }
  };

  return (
    <Modal title={`Participate — ${campaign.title}`} onClose={onClose}>
      <div className="field"><label>Reward</label><b className="gold">{campaign.rate_per_task} MLPTS</b> <span className="muted">· paid after reviewer consensus</span></div>
      <div className="field"><label>What did you do</label><textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe how you completed this campaign" /></div>
      <div className="field"><label>Proof URL</label><input className="input" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Link to screenshot / post" /></div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy && <span className="spin" />} Submit for review</button>
      </div>
    </Modal>
  );
}
