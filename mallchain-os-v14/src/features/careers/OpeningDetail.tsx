import { useEffect, useState } from 'react';
import { Modal, toast } from '../../components/ui';
import {
  careersApi, payLine, APPLICATION_STATUS_LABEL,
  EDUCATION_LABEL, EMPLOYMENT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL,
  type JobOpening,
} from '../../services/careersApi';
import type { Verification } from './useVerification';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

function Facts({ o }: { o: JobOpening }) {
  const rows: Array<[string, string]> = [
    ['Education', EDUCATION_LABEL[o.educationLevel]],
    ['Experience', o.experienceYears === 0 ? 'None required' : `${o.experienceYears} year${o.experienceYears === 1 ? '' : 's'}`],
    ['Seniority', SENIORITY_LABEL[o.seniority]],
    ['Employment', EMPLOYMENT_LABEL[o.employmentType]],
    ['Work mode', WORK_MODE_LABEL[o.workMode]],
    ['Location', o.location || 'Not stated'],
    ['Positions', String(o.positions)],
    ['Pay', payLine(o)],
  ];
  if (o.equity) rows.push(['Equity', o.equity]);
  if (o.deadline) rows.push(['Apply by', fmtDate(o.deadline) as string]);
  return (
    <div className="cr-facts">
      {rows.map(([k, v]) => (
        <div key={k} className="cr-fact">
          <div className="cr-fact-k">{k}</div>
          <div className="cr-fact-v">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="cr-section">
      <h3>{title}</h3>
      <ul className="cr-list">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </section>
  );
}

/**
 * The whole spec of one opening, and the application itself. The detail is read
 * fresh rather than taken from the board row, because the board row cannot say
 * whether this account has already applied.
 */
export function OpeningDetail({
  openingId, verification, onClose, onApplied,
}: {
  openingId: string;
  verification: Verification;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [opening, setOpening] = useState<JobOpening | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    careersApi.get(openingId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setOpening(res.data);
      else setError(res.error || 'Could not load this opening');
    });
    return () => { cancelled = true; };
  }, [openingId]);

  const apply = async () => {
    setApplyError(null);
    if (message.trim().length < 20) {
      setApplyError('Write at least 20 characters — tell the author who you are and why you fit.');
      return;
    }
    setBusy(true);
    const res = await careersApi.apply(openingId, message.trim());
    setBusy(false);
    if (!res.ok) {
      setApplyError(res.error || 'Could not send your application');
      return;
    }
    toast(`Application sent to ${res.data?.authorName || 'the author'}`);
    setMessage('');
    onApplied();
    const fresh = await careersApi.get(openingId);
    if (fresh.ok && fresh.data) setOpening(fresh.data);
  };

  const pastDeadline = !!opening?.deadline && new Date(opening.deadline).getTime() < Date.now();
  const applied = opening?.myApplication;

  return (
    <Modal title={opening ? opening.title : 'Opening'} onClose={onClose} wide>
      {error && <div className="cr-error" role="alert">{error}</div>}
      {!opening && !error && <div className="cr-loading">Loading the full specification…</div>}

      {opening && (
        <div className="cr-detail">
          <div className="cr-detail-head">
            <div className="cr-chips">
              <span className="chip">{opening.workspace}</span>
              <span className="chip">{opening.field}</span>
              <span className={'chip cr-status-' + opening.status}>{opening.status === 'open' ? 'Accepting applications' : opening.status === 'filled' ? 'Filled' : 'Closed'}</span>
            </div>
            <div className="tiny cr-byline">
              Posted by <b>{opening.authorName}</b>{opening.createdAt ? ` · ${fmtDate(opening.createdAt)}` : ''}
              {opening.applicationsCount > 0 ? ` · ${opening.applicationsCount} application${opening.applicationsCount === 1 ? '' : 's'}` : ''}
            </div>
          </div>

          <Facts o={opening} />

          <section className="cr-section">
            <h3>About the role</h3>
            <p className="cr-prose">{opening.description}</p>
          </section>

          <Bullets title="Responsibilities" items={opening.responsibilities} />
          <Bullets title="Requirements" items={opening.requirements} />

          {(opening.skills.length > 0 || opening.preferredSkills.length > 0) && (
            <section className="cr-section">
              <h3>Skills</h3>
              <div className="cr-chips">
                {opening.skills.map((s) => <span key={s} className="chip cr-skill">{s}</span>)}
                {opening.preferredSkills.map((s) => <span key={s} className="chip cr-skill cr-skill-soft" title="Nice to have">{s}</span>)}
              </div>
              {opening.preferredSkills.length > 0 && <div className="hint">Faded chips are nice to have, not required.</div>}
            </section>
          )}

          <Bullets title="Benefits" items={opening.benefits} />

          {opening.applicationInstructions && (
            <section className="cr-section">
              <h3>What to include when applying</h3>
              <p className="cr-prose">{opening.applicationInstructions}</p>
            </section>
          )}

          <section className="cr-apply">
            {opening.mine ? (
              <div className="cr-note">You posted this opening. Applications appear under My postings, and you can edit or close it there.</div>
            ) : applied ? (
              <div className="cr-applied">
                <div className="cr-applied-head">
                  <b>Your application</b>
                  <span className={'chip cr-app-' + applied.status}>{APPLICATION_STATUS_LABEL[applied.status]}</span>
                </div>
                <p className="cr-prose">{applied.message}</p>
                <div className="tiny">Sent {fmtDate(applied.createdAt)}. The author was notified when you applied.</div>
              </div>
            ) : opening.status !== 'open' ? (
              <div className="cr-note">This opening is {opening.status}, so it is no longer accepting applications.</div>
            ) : pastDeadline ? (
              <div className="cr-note">The application deadline ({fmtDate(opening.deadline)}) has passed.</div>
            ) : !verification.verified ? (
              <div className="cr-gate">
                <p>{verification.message || 'Checking your verification status…'}</p>
                <div className="row">
                  {verification.action && <a className="btn btn-primary btn-sm" href={verification.action.href}>{verification.action.label}</a>}
                  {verification.state === 'unreachable' && <button className="btn btn-ghost btn-sm" onClick={verification.refresh}>Try again</button>}
                </div>
              </div>
            ) : (
              <>
                <h3>Apply to this opening</h3>
                <p className="hint cr-apply-hint">
                  Your message goes to {opening.authorName} as a notification on their account, together with your verified handle.
                  Nothing else about your account is shared.
                </p>
                {applyError && <div className="cr-error" role="alert">{applyError}</div>}
                <textarea
                  className="input cr-apply-input"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Who you are, the experience that fits this role, and anything the author asked for above."
                  maxLength={2000}
                  disabled={busy}
                  aria-label="Your message to the author"
                />
                <div className="row cr-apply-actions">
                  <div className="tiny">{message.trim().length}/2000 · at least 20</div>
                  <button className="btn btn-primary btn-sm" onClick={apply} disabled={busy || message.trim().length < 20}>
                    {busy && <span className="spin" />} Send application
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
