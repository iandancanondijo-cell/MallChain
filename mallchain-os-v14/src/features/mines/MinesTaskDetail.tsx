import { useCallback, useEffect, useState } from 'react';
import { Modal, StatusChip, fmtNum, toast } from '../../components/ui';
import { minesApi, type CampaignTaskDetail as TaskDetail } from '../../services/minesApi';
import { blockedLinkTitle, resolveContentLink, resolveProofLink, type ContentLink } from '../../services/proofLink';
import { submissionChip, submissionLabel } from './submissionStatus';
import { PlatformIcon } from './platformIcons';

/**
 * The task, in full, before it costs anything to look at it.
 *
 * Discover shows cards; this shows what a participant actually has to decide
 * with — who published the task and when, what it pays, how much of the
 * budget is left, what the owner asked for, and how many attempts this
 * account still has. The decision matters because the task address is
 * single-use: POST /api/mines/campaigns/:id/open spends one open per attempt
 * and hands the address back exactly once, so a participant who opens without
 * uploading a screenshot has spent an attempt for nothing. Reward only ever
 * moves when reviewers approve the proof (routes/mines.js settle path), and
 * the panel says so in every state rather than implying the link pays.
 */
export default function MinesTaskDetailModal({
  campaignId,
  onClose,
  onChanged,
}: {
  campaignId: string;
  onClose: () => void;
  /** Called after anything the server recorded — an open or a submission. */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  /** The address released by this mount, on top of any slot already pending. */
  const [justOpened, setJustOpened] = useState<OpenTicket | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const load = useCallback(async () => {
    const res = await minesApi.campaignTask(campaignId);
    if (res.ok && res.data) {
      setDetail(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error || 'Failed to load this task');
    }
    return res;
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  const spendOpen = async () => {
    setOpening(true);
    setOpenNotice(null);
    const res = await minesApi.openCampaignLink(campaignId);
    if (!res.ok) {
      // Whatever the reason — no opens left, a slot already pending, the
      // creator got banned, the rate limit — the counts in this panel are now
      // wrong, so re-read them instead of arguing with a stale number.
      setOpening(false);
      setOpenNotice(res.error || 'This task link could not be opened.');
      await refresh();
      toast(res.error || 'This task link could not be opened.', false);
      return;
    }
    const safe = resolveContentLink(res.data?.content_link);
    if (safe.kind !== 'external') {
      // The backend only issues a slot for an http(s) address, so this means a
      // response we cannot trust. Do not open anything; do not lose the slot.
      setOpening(false);
      setOpenNotice('The task address came back in a form that cannot be opened safely. Your attempt has not been lost — tell support.');
      await refresh();
      return;
    }
    setJustOpened({ link: safe, slot: res.data?.slot ?? detail?.me.openings_used ?? 1 });
    // noopener: the task page is someone else's site and must not hold a
    // handle on this window. A blocked popup is not retried — the slot is
    // already spent — it is shown below as a link the participant can use.
    const win = window.open(safe.href, '_blank', 'noopener,noreferrer');
    setPopupBlocked(!win);
    setOpening(false);
    await refresh();
    toast(`Opened for attempt ${res.data?.slot ?? ''} — upload your screenshot. This link will not open twice.`);
  };

  if (loadError && !detail) {
    return (
      <Modal title="Task" onClose={onClose} wide>
        <div className="mc-proof-error" role="alert">⚠ {loadError}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={load}>Try again</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  if (!detail) {
    return (
      <Modal title="Task" onClose={onClose} wide>
        <div className="mc-task-loading"><span className="spin" /> Loading the task…</div>
      </Modal>
    );
  }

  return (
    <Modal title={detail.task.title || 'Task'} onClose={onClose} wide>
      <TaskSteps detail={detail} />
      <TaskFacts detail={detail} />
      <TaskBrief detail={detail} />
      <OpenSlot
        detail={detail}
        opening={opening}
        notice={openNotice}
        released={justOpened}
        popupBlocked={popupBlocked}
        onOpen={spendOpen}
      />
      <ProofStep detail={detail} released={justOpened} onDone={refresh} onClose={onClose} />
      <MyAttempts detail={detail} />
    </Modal>
  );
}

/**
 * The four stages, driven only by what the server has recorded. Nothing here
 * marks a step done because a button was clicked: an open is done when a
 * CampaignOpen row exists, proof is done when a submission references it, and
 * the pay-out is done when the submission is settled.
 */
function TaskSteps({ detail }: { detail: TaskDetail }) {
  const opened = detail.me.openings_used > 0 || detail.me.pending_open !== null;
  const submitted = detail.me.submissions.length > 0;
  const paid = detail.me.submissions.some((s) => s.status === 'approved' || s.status === 'auto_approved');
  const steps = [
    { label: 'Open the task', hint: 'one attempt, one link' },
    { label: 'Upload screenshot', hint: 'before the next attempt' },
    { label: 'Reviewers check it', hint: 'a panel votes on your proof' },
    { label: `${fmtNum(detail.reward.rate_per_task)} MLPTS`, hint: detail.reward.paid_when },
  ];
  const done = [opened, submitted, paid, paid];
  const active = done.findIndex((d) => !d);
  return (
    <ol className="mc-task-steps">
      {steps.map((s, i) => (
        <li key={s.label} className={done[i] ? 'done' : i === active ? 'now' : ''}>
          <span className="dot">{done[i] ? '✓' : i + 1}</span>
          <span className="lbl">{s.label}</span>
          <span className="hint">{s.hint}</span>
        </li>
      ))}
    </ol>
  );
}

function TaskFacts({ detail }: { detail: TaskDetail }) {
  const { task, owner, reward, budget, rules, me } = detail;
  const spent = budget.funded !== null ? Math.max(0, budget.funded - budget.remaining) : null;
  return (
    <div className="mc-task-facts">
      <div className="f rate">
        <b className="gold">{fmtNum(reward.rate_per_task)}</b>
        <span>{reward.currency} per approved proof · cap {fmtNum(reward.daily_cap_mlpts)}/day</span>
      </div>
      <div className="f">
        <b>{owner.display_name ? `@${owner.display_name}` : 'Unknown owner'}</b>
        <span>Published {task.created_at ? formatDate(task.created_at) : 'date not recorded'}{owner.banned ? ' · owner banned' : ''}</span>
      </div>
      <div className="f">
        <b>{fmtNum(budget.remaining)}</b>
        <span>{budget.funded !== null ? `${fmtNum(budget.funded)} budgeted · ${fmtNum(spent || 0)} spent` : 'budget remaining'} · {budget.completions} paid completions</span>
      </div>
      <div className="f">
        <b>{me.openings_left}/{rules.max_completions_per_user}</b>
        <span>open{rules.max_completions_per_user === 1 ? '' : 's'} left for you{rules.cooldown_seconds > 0 ? ` · ${cooldownLabel(rules.cooldown_seconds)} between attempts` : ''}</span>
      </div>
      <div className="f">
        <StatusChip status={task.status} />
        <span>{task.platform_label || 'No platform'}{task.activity_label ? ` · ${humanize(task.activity_label)}` : ''}{task.updated_at ? ` · updated ${formatDate(task.updated_at)}` : ''}</span>
      </div>
    </div>
  );
}

/** What the owner actually asked for — the bar the reviewers hold the screenshot against. */
function TaskBrief({ detail }: { detail: TaskDetail }) {
  const { task } = detail;
  return (
    <div className="mc-task-brief">
      {task.description && <p className="desc">{task.description}</p>}
      {task.directive ? (
        <div className="directive">
          <b>What the owner wants</b>
          <p>{task.directive}</p>
        </div>
      ) : (
        <div className="directive directive--thin">
          No directive was published, so reviewers can only check that you opened the task and captured proof.
        </div>
      )}
      {task.platform && (
        <div className="plat">{task.platform ? <PlatformIcon platform={task.platform} /> : null} <span>{task.platform_label}</span>{task.activity_label ? <span className="muted"> · {humanize(task.activity_label)}</span> : null}</div>
      )}
    </div>
  );
}

/**
 * The open this browser window paid for: the address, plus which attempt it
 * was. Held next to the link so the panel can say "attempt 2" truthfully in the
 * moment right after the click, before the refetched counts arrive.
 */
type OpenTicket = { link: ContentLink; slot: number };

function externalOf(link: ContentLink): Extract<ContentLink, { kind: 'external' }> | null {
  return link.kind === 'external' ? link : null;
}

/**
 * The single-use open. The address itself is only ever known to the
 * participant after POST /campaigns/:id/open has spent a slot — so this is the
 * only control that can reach the task, and it says what it costs.
 */
function OpenSlot({
  detail,
  opening,
  notice,
  released,
  popupBlocked,
  onOpen,
}: {
  detail: TaskDetail;
  opening: boolean;
  notice: string | null;
  released: OpenTicket | null;
  popupBlocked: boolean;
  onOpen: () => void;
}) {
  const pending = detail.me.pending_open;
  const live = (released ? externalOf(released.link) : null) ?? externalOf(resolveContentLink(pending?.content_link));
  const slot = pending?.slot ?? released?.slot ?? null;
  // No View button while an open is live in this window, even if the counts
  // have not caught up yet: a second click can only ever be refused, and a
  // refusal on the page that promises "one open" reads like the rule broke.
  const canOpen = detail.link.openable && detail.me.openings_left > 0 && !pending && !released;

  return (
    <div className={`mc-task-open${live ? ' spent' : ''}`}>
      <div className="hd">
        <b>Task link</b>
        <span className="tiny muted">{detail.link.openable ? `Opens once · ${live ? 'spent' : `${detail.me.openings_left} left`}` : 'No address published'}</span>
      </div>

      {!detail.link.openable && (
        <div className="note">
          This campaign published no openable task address{detail.link.host ? ` (its link points at ${detail.link.host}, which is not enough to check your proof against)` : ''}.
          You can still submit proof, but reviewers will have nothing to compare it to.
        </div>
      )}

      {canOpen && (
        <>
          <button className="btn btn-primary mc-task-view" onClick={onOpen} disabled={opening}>
            {opening ? <><span className="spin" /> Opening…</> : <>👁 View “{detail.task.title || 'this task'}” <span aria-hidden>↗</span></>}
          </button>
          <div className="warn">
            This is the real thing: clicking opens the task <b>once</b> and spends attempt {detail.me.openings_used + 1} of{' '}
            {detail.me.allowance}. Finish the activity, then upload the screenshot below. Leave it without proof and that attempt earns nothing —
            the link will not be issued to you again.
          </div>
        </>
      )}

      {live && (
        <>
          <div className="spent-line">
            ⏳ You opened attempt {slot}
            {pending?.opened_at ? ` on ${formatDateTime(pending.opened_at)}` : ''} and have not submitted proof for it yet.
          </div>
          <a className="mc-link-open" href={live.href} target="_blank" rel="noopener noreferrer nofollow">
            🔗 The task you already opened · {live.label} <span aria-hidden>↗</span>
          </a>
          <div className="note">
            Your open is not lost — this address stays here so a blocked popup or a reload cannot destroy the only attempt you have.
            It does not buy a second one. Upload the screenshot to finish it, or accept that this attempt earns nothing.
          </div>
        </>
      )}

      {!canOpen && !live && detail.link.openable && (
        <div className="note">
          All {detail.me.allowance} link open{detail.me.allowance === 1 ? '' : 's'} for this campaign are spent on your account.
          A task opened without proof cannot be reopened — that is the whole cost of the rule.
        </div>
      )}

      {popupBlocked && live && (
        <div className="note note--warn">
          Your browser blocked the new tab. Use the link above — it is the open you already paid for.
        </div>
      )}

      {notice && <div className="mc-proof-error" role="alert">⚠ {notice}</div>}
    </div>
  );
}

/**
 * Proof. For a campaign with a task link this is a screenshot and nothing
 * else: the backend refuses a typed URL as proof once it has issued a link,
 * because a URL you typed proves nothing about what you did after opening it.
 */
function ProofStep({
  detail,
  released,
  onDone,
  onClose,
}: {
  detail: TaskDetail;
  released: OpenTicket | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [proofRef, setProofRef] = useState('');
  const [proofName, setProofName] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkRequired = detail.link.openable;
  const hasOpen = Boolean(detail.me.pending_open) || Boolean(released);
  const proof = proofRef || (linkRequired ? '' : proofUrl.trim());

  const onPickFile = async (file: File | null) => {
    setError(null);
    if (!file) { setProofRef(''); setProofName(''); return; }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only PNG or JPG screenshots are accepted.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That screenshot is larger than the 8 MB limit — crop or re-save it at a lower quality.');
      return;
    }
    setUploading(true);
    const result = await minesApi.uploadProof(file);
    setUploading(false);
    if (result.ok && result.data?.documentRef) {
      setProofRef(result.data.documentRef);
      setProofName(file.name);
    } else {
      setError(result.error || 'Upload failed — try again.');
    }
  };

  const submit = async () => {
    if (!proof) {
      setError(linkRequired ? 'Attach the screenshot you uploaded — proof of a linked task cannot be a typed link.' : 'Attach a screenshot or paste the link to your post first.');
      return;
    }
    setBusy(true);
    const result = await minesApi.submitTask({
      campaign_id: detail.task.id,
      title: detail.task.title,
      description,
      proof_url: proof,
    });
    setBusy(false);
    if (result.ok) {
      const queued = result.data?.assignment_status;
      toast(queued === 'assigned' || queued === 'voting'
        ? `Submitted — sent to reviewers · ${fmtNum(detail.reward.rate_per_task)} MLPTS if they approve`
        : `Submitted — queued for review · ${fmtNum(detail.reward.rate_per_task)} MLPTS if approved`);
      await onDone();
      onClose();
    } else {
      setError(result.error || 'Submission failed.');
      // A refusal that came from the open bookkeeping (409) means this panel's
      // counts are wrong, not that the screenshot is bad.
      if (result.code === 409 || /open/i.test(result.error || '')) await onDone();
      toast(result.error || 'Submission failed', false);
    }
  };

  // A campaign that never published a link keeps the old escape hatch;
  // otherwise the screenshot is the whole submission.
  const screenshotOnly = linkRequired;

  return (
    <div className={`mc-task-proof${linkRequired && !hasOpen ? ' locked' : ''}`}>
      <div className="hd"><b>Proof</b><span className="tiny muted">{screenshotOnly ? 'screenshot only' : 'screenshot or post link'}</span></div>

      {linkRequired && !hasOpen ? (
        <div className="note">
          Nothing to submit yet — open the task above first. Proof uploaded before the open cannot be checked against anything,
          and the backend will refuse it.
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`proof-file-${detail.task.id}`}>Screenshot of you doing it</label>
            <div className="mc-proof-upload">
              <label className="btn btn-ghost btn-sm mc-proof-pick" htmlFor={`proof-file-${detail.task.id}`}>
                {uploading ? <><span className="spin" /> Uploading…</> : proofName ? 'Choose another file' : '📎 Upload PNG or JPG'}
              </label>
              <input id={`proof-file-${detail.task.id}`} type="file" accept="image/png,image/jpeg" className="mc-proof-input"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
              {proofRef && <span className="mc-badge b-approved">Uploaded{proofName ? ` · ${proofName}` : ''}</span>}
              {proofRef && (
                <button type="button" className="mc-proof-clear" onClick={() => { setProofRef(''); setProofName(''); }}>Remove</button>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Checked against your own account and confirmed to exist on the server before any reviewer sees it.{screenshotOnly ? ' For a task with a link, this is the only proof that counts.' : ''}
            </div>
          </div>

          {!screenshotOnly && (
            <div className="field">
              <label htmlFor="mc-task-proof-url">…or link to your post</label>
              <input id="mc-task-proof-url" className="input" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https:// — the post, comment or profile showing you did it" inputMode="url" />
            </div>
          )}

          <div className="field">
            <label>What did you do</label>
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Say what you did in the task, in your own words" />
          </div>

          {error && <div className="mc-proof-error" role="alert">⚠ {error}</div>}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Not now</button>
            <button className="btn btn-primary" disabled={busy || uploading || !proof} onClick={submit}>
              {busy && <span className="spin" />} Submit for review
            </button>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {fmtNum(detail.reward.rate_per_task)} MLPTS are credited only when reviewers approve — never when the link opens or the screenshot uploads.
          </div>
        </>
      )}
    </div>
  );
}

function MyAttempts({ detail }: { detail: TaskDetail }) {
  if (detail.me.submissions.length === 0) return null;
  return (
    <div className="mc-task-attempts">
      <div className="hd"><b>Your attempts on this task</b><span className="tiny muted">{detail.me.rewarded_submissions} rewarded</span></div>
      {detail.me.submissions.map((s) => {
        const proof = resolveProofLink(s.proof_url);
        return (
          <div key={s.id} className="att">
            <span className={`mc-badge ${submissionChip(s)}`}>{submissionLabel(s)}</span>
            <span className="when">{formatDateTime(s.created_at)}</span>
            <span className="amt">{fmtNum(s.reward_amount || 0)} {s.currency}</span>
            {proof.kind !== 'none' && (
              <a className="att-proof" href={proof.href} target="_blank" rel="noopener noreferrer nofollow">{proof.kind === 'upload' ? '🖼 screenshot' : '🔗 proof'}</a>
            )}
            {proof.kind === 'none' && proof.display && (
              <span className="att-proof mc-link-row--blocked" title={blockedLinkTitle(proof)}>{proof.display}</span>
            )}
            {s.rejection_note && <span className="why" title={s.rejection_note}>Rejected: {s.rejection_note}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** `complete_campaign` is a config key, not a sentence — the panel prints words. */
function humanize(value: string): string {
  return (value || '').replace(/_/g, ' ').trim();
}

function formatDate(iso: string): string {  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date not recorded';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date not recorded';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function cooldownLabel(seconds: number): string {
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}
