import { useCallback, useEffect, useState } from 'react';
import { Modal, toast } from '../../components/ui';
import {
  careersApi, APPLICATION_STATUS_LABEL,
  type JobOpening, type MyApplication, type OpeningApplication, type ApplicationStatus,
} from '../../services/careersApi';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

/**
 * The author's inbox for one opening. Answering an application notifies the
 * applicant, so the controls are explicit about which answer is being sent.
 */
export function ApplicationInbox({ opening, onClose, onChanged }: { opening: JobOpening; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<OpeningApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await careersApi.applicationsFor(opening.id);
    if (res.ok) {
      setRows(res.data || []);
      setError(null);
    } else {
      setRows(null);
      setError(res.error || 'Could not load applications');
    }
  }, [opening.id]);

  useEffect(() => { load(); }, [load]);

  const answer = async (row: OpeningApplication, status: ApplicationStatus) => {
    setBusyId(row.id);
    const res = await careersApi.answer(row.id, status, note[row.id] || '');
    setBusyId(null);
    if (!res.ok) {
      toast(res.error || 'Could not record that answer', false);
      return;
    }
    toast(`${row.applicantName}: ${APPLICATION_STATUS_LABEL[status].toLowerCase()} — they have been notified`);
    await load();
    onChanged();
  };

  return (
    <Modal title={`Applications · ${opening.title}`} onClose={onClose} wide>
      {error && <div className="cr-error" role="alert">{error}</div>}
      {!rows && !error && <div className="cr-loading">Loading applications…</div>}
      {rows && rows.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📭</div>
          <div className="es-t">No applications yet</div>
          <div className="es-m">Nobody has applied to this opening. It stays on the board while it is open.</div>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="cr-inbox">
          <div className="tiny cr-inbox-count">{rows.length} application{rows.length === 1 ? '' : 's'} · answering one notifies the applicant</div>
          {rows.map((row) => (
            <div key={row.id} className="card cr-application">
              <div className="row">
                <div className="grow">
                  <b>{row.applicantName}</b>
                  <div className="tiny">Applied {fmtDate(row.createdAt)}{row.respondedAt ? ` · answered ${fmtDate(row.respondedAt)}` : ''}</div>
                </div>
                <span className={'chip cr-app-' + row.status}>{APPLICATION_STATUS_LABEL[row.status]}</span>
              </div>
              <p className="cr-prose cr-message">{row.message}</p>
              {row.authorNote && <div className="tiny cr-note-sent">Your note: {row.authorNote}</div>}
              {row.status !== 'withdrawn' && (
                <>
                  <input
                    className="input cr-note-input"
                    value={note[row.id] ?? row.authorNote}
                    onChange={(e) => setNote((n) => ({ ...n, [row.id]: e.target.value }))}
                    placeholder="A note to send with your answer (optional)"
                    maxLength={1000}
                    disabled={busyId === row.id}
                    aria-label={`Note to ${row.applicantName}`}
                  />
                  <div className="row cr-answer-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => answer(row, 'shortlisted')} disabled={busyId === row.id}>Shortlist</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => answer(row, 'rejected')} disabled={busyId === row.id}>Not a fit</button>
                    <button className="btn btn-primary btn-sm" onClick={() => answer(row, 'hired')} disabled={busyId === row.id}>Accept</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Everything this account has applied to, with the author's answer if there is one. */
export function MyApplications({ onOpen }: { onOpen: (openingId: string) => void }) {
  const [rows, setRows] = useState<MyApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await careersApi.myApplications();
    if (res.ok) {
      setRows(res.data || []);
      setError(null);
    } else {
      setRows(null);
      setError(res.error || 'Could not load your applications');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withdraw = async (row: MyApplication) => {
    setBusyId(row.id);
    const res = await careersApi.withdraw(row.id);
    setBusyId(null);
    if (!res.ok) {
      toast(res.error || 'Could not withdraw that application', false);
      return;
    }
    toast('Application withdrawn — the author has been told');
    load();
  };

  if (error) return <div className="cr-error" role="alert">{error}</div>;
  if (!rows) return <div className="cr-loading">Loading your applications…</div>;
  if (rows.length === 0) {
    return (
      <div className="card card-glow bg-gradient-card">
        <div className="empty-state">
          <div className="es-ico">✉️</div>
          <div className="es-t">You have not applied to anything yet</div>
          <div className="es-m">Open a role on the board and send the author a message. It appears here with their answer.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stagger">
      {rows.map((row) => (
        <div key={row.id} className="card card-glow bg-gradient-card mb cr-application">
          <div className="row">
            <div className="grow">
              <b>{row.openingTitle}</b>
              <div className="tiny">{row.workspace}{row.field ? ` · ${row.field}` : ''} · posted by {row.authorName}</div>
            </div>
            <span className={'chip cr-app-' + row.status}>{APPLICATION_STATUS_LABEL[row.status]}</span>
          </div>
          <p className="cr-prose cr-message">{row.message}</p>
          {row.authorNote && (
            <div className="cr-author-note">
              <b>{row.authorName} responded{row.respondedAt ? ` on ${fmtDate(row.respondedAt)}` : ''}:</b> {row.authorNote}
            </div>
          )}
          <div className="row cr-answer-actions">
            <div className="tiny grow">Sent {fmtDate(row.createdAt)}{row.openingStatus !== 'open' ? ` · opening is ${row.openingStatus}` : ''}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onOpen(row.openingId)}>View role</button>
            {row.status !== 'withdrawn' && row.status !== 'hired' && (
              <button className="btn btn-ghost btn-sm" onClick={() => withdraw(row)} disabled={busyId === row.id}>Withdraw</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
