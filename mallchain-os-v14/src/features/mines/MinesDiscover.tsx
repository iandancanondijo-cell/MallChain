import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, Modal, toast } from '../../components/ui';
import { minesApi, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';
import { blockedLinkTitle, resolveContentLink } from '../../services/proofLink';
import { submissionChip, submissionLabel, submissionState } from './submissionStatus';
import { PlatformIcon } from './platformIcons';

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
        <h1 className="text-gradient">Discover Campaigns</h1>
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

      <div className="c-grid stagger">
        {list.map((c) => {
          const mySub = submissionFor(c._id);
          const link = resolveContentLink(c.content_link);
          // The campaign document carries its own per-user allowance, so the
          // button can appear exactly when POST /submissions would still accept
          // one — previously any live submission hid it, which locked a
          // multi-completion campaign after the first go.
          const claimed = submissions.filter((s) => s.campaign_id === c._id && s.status !== 'rejected').length;
          const allowance = c.max_completions_per_user || 1;
          const canSubmitAgain = claimed < allowance;
          return (
            <div key={c._id} className="c-card card-glow bg-gradient-card card-hover">
              <div className="c-banner">
                <span className="pl-ico">{c.platform ? <PlatformIcon platform={c.platform} /> : '🎯'}</span>
                <div><div className="nm">{c.title}</div></div>
                <div className="rv">{c.rate_per_task}<small>MLPTS</small></div>
              </div>
              <div className="c-body">
                <div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>{c.description}</div>
                {c.directive && (
                  <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}><b>Do this:</b> {c.directive}</div>
                )}
                <CampaignLinkRow link={link} />
                <div className="c-meta">
                  <span><b>{c.completions_count}</b> completions</span>
                  <span>budget <b>{c.budget_remaining}</b></span>
                </div>
              </div>
              <div className="c-foot">
                {mySub && submissionState(mySub) !== 'rejected' && (
                  <span className={`mc-badge ${submissionChip(mySub)}`}>{submissionLabel(mySub)}</span>
                )}
                {canSubmitAgain ? (
                  <button className="btn btn-primary" onClick={() => setSubmitFor(c)}>
                    {claimed > 0 ? `Participate again (${claimed}/${allowance})` : 'Participate'}
                  </button>
                ) : (
                  <span className="tiny" style={{ color: 'var(--txt-3)' }}>Per-user limit reached ({allowance})</span>
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

/**
 * The task the creator published, as an opener the participant can actually
 * use. `content_link` is rendered here rather than pasted into the modal so
 * the person doing the activity sees exactly what the reviewers will check
 * against. Non-http(s) values are shown as inert text — see
 * services/proofLink.ts for why nothing gets an href without a scheme check.
 */
function CampaignLinkRow({ link }: { link: ReturnType<typeof resolveContentLink> }) {
  if (link.kind === 'none') {
    if (!link.display) return null;
    return <div className="mc-link-row mc-link-row--blocked" title={blockedLinkTitle(link)}>🔗 {link.display}</div>;
  }
  return (
    <div className="mc-link-row">
      <a className="mc-link-open" href={link.href} target="_blank" rel="noopener noreferrer nofollow">
        🔗 Open task · {link.label} <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

function SubmitProofModal({ campaign, onClose, onSubmitted }: { campaign: MinesCampaign; onClose: () => void; onSubmitted: () => void }) {
  const [description, setDescription] = useState('');
  const [proofRef, setProofRef] = useState('');
  const [proofName, setProofName] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = resolveContentLink(campaign.content_link);

  const onPickFile = async (file: File | null) => {
    setUploadError(null);
    if (!file) { setProofRef(''); setProofName(''); return; }
    // Mirrors middleware/upload.js's proof limits so an oversized or
    // wrong-type capture fails here instead of as an opaque 500 from multer.
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setUploadError('Only PNG or JPG screenshots are accepted.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('That screenshot is larger than the 8 MB limit — crop or re-save it at a lower quality.');
      return;
    }
    setUploading(true);
    const result = await minesApi.uploadProof(file);
    setUploading(false);
    if (result.ok && result.data?.documentRef) {
      setProofRef(result.data.documentRef);
      setProofName(file.name);
    } else {
      setUploadError(result.error || 'Upload failed — try again or use a link instead.');
    }
  };

  // An uploaded screenshot and a typed link are different strengths of
  // evidence; the ref wins because the backend can stat it on disk.
  const proof = proofRef || proofUrl.trim();

  const submit = async () => {
    if (!proof) {
      setUploadError('Attach a screenshot or paste the link to your post before submitting.');
      return;
    }
    setBusy(true);
    const result = await minesApi.submitTask({
      campaign_id: campaign._id,
      title: campaign.title,
      description,
      proof_url: proof,
    });
    setBusy(false);
    if (result.ok) {
      // Say what actually happened: with no staked reviewers the backend
      // falls back to admin manual review, so "pending reviewer consensus"
      // would be a promise the submission didn't make.
      const queued = result.data?.assignment_status;
      toast(queued === 'assigned' || queued === 'voting'
        ? `Submitted — sent to reviewers · ${campaign.rate_per_task} MLPTS if they approve`
        : `Submitted — queued for review · ${campaign.rate_per_task} MLPTS if approved`);
      onSubmitted();
    } else {
      toast(result.error || 'Submission failed', false);
    }
  };

  return (
    <Modal title={`Participate — ${campaign.title}`} onClose={onClose}>
      <div className="field"><label>Reward</label><b className="gold">{campaign.rate_per_task} MLPTS</b> <span className="muted">· paid after your proof is approved</span></div>

      {link.kind === 'external' && (
        <div className="field">
          <label>Task to complete</label>
          <a className="mc-link-open" href={link.href} target="_blank" rel="noopener noreferrer nofollow">🔗 Open the task · {link.label} <span aria-hidden>↗</span></a>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Do the activity in that link first, then attach proof below.</div>
        </div>
      )}
      {link.kind === 'none' && link.display && (
        <div className="field">
          <label>Task to complete</label>
          <div className="mc-link-row mc-link-row--blocked" title={blockedLinkTitle(link)}>🔗 {link.display}</div>
        </div>
      )}

      <div className="field">
        <label>What did you do</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe how you completed this campaign" />
      </div>

      <div className="field">
        <label htmlFor="proof-file">Proof screenshot</label>
        <div className="mc-proof-upload">
          <label className="btn btn-ghost btn-sm mc-proof-pick" htmlFor="proof-file">
            {uploading ? <><span className="spin" /> Uploading…</> : proofName ? 'Choose another file' : '📎 Upload PNG or JPG'}
          </label>
          <input id="proof-file" type="file" accept="image/png,image/jpeg" className="mc-proof-input"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
          {proofRef && <span className="mc-badge b-approved">Uploaded{proofName ? ` · ${proofName}` : ''}</span>}
          {proofRef && (
            <button type="button" className="mc-proof-clear" onClick={() => { setProofRef(''); setProofName(''); }}>Remove</button>
          )}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>A screenshot uploaded here is checked against your own account and verified to exist before reviewers see it.</div>
      </div>

      <div className="field">
        <label htmlFor="proof-url">…or link to your post</label>
        <input id="proof-url" className="input" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
          placeholder="https:// — the post, comment or profile showing you did it" inputMode="url" />
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Only http(s) links are accepted, and a screenshot is stronger proof than a link.</div>
      </div>

      {uploadError && <div className="mc-proof-error" role="alert">⚠ {uploadError}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || uploading || !proof} onClick={submit}>{busy && <span className="spin" />} Submit for review</button>
      </div>
    </Modal>
  );
}
