import { useCallback, useEffect, useMemo, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import {
  careersApi, payLine, EDUCATION_LABEL, EMPLOYMENT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL,
  type BoardFilters, type BoardResult, type CareersOptions, type JobOpening, type MyApplication,
} from '../../services/careersApi';
import { useVerification } from './useVerification';
import { OpeningForm } from './OpeningForm';
import { OpeningDetail } from './OpeningDetail';
import { ApplicationInbox, MyApplications } from './Applications';
import './careers.css';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);
type Tab = 'board' | 'mine' | 'applications';

/**
 * Careers is a board of openings published by verified accounts — there is no
 * seeded list. An empty board says it is empty and offers the one action that
 * can change it.
 */
export default function Careers() {
  useStoreVersion();
  const verification = useVerification();
  const signedIn = store.state.user.authed;

  const [tab, setTab] = useState<Tab>('board');
  const [options, setOptions] = useState<CareersOptions | null>(null);
  const [filters, setFilters] = useState<BoardFilters>({ status: 'open' });
  const [search, setSearch] = useState('');
  const [board, setBoard] = useState<BoardResult | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mine, setMine] = useState<JobOpening[] | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [sent, setSent] = useState<MyApplication[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobOpening | null>(null);
  const [inbox, setInbox] = useState<JobOpening | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    careersApi.options().then((res) => { if (res.ok && res.data) setOptions(res.data); });
  }, []);

  const loadBoard = useCallback(async (f: BoardFilters, offset = 0) => {
    setLoading(true);
    const res = await careersApi.board({ ...f, offset, limit: 20 });
    setLoading(false);
    if (!res.ok || !res.data) {
      setBoard(null);
      setBoardError(res.error || 'Could not load the board');
      return;
    }
    setBoardError(null);
    setBoard((prev) => offset > 0 && prev
      ? { ...res.data!, openings: [...prev.openings, ...res.data!.openings] }
      : res.data!);
  }, []);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadBoard(filters); }, [filters, loadBoard]);

  const loadMine = useCallback(async () => {
    const [own, applications] = await Promise.all([careersApi.mine(), careersApi.myApplications()]);
    if (own.ok) {
      setMine(own.data || []);
      setMineError(null);
    } else {
      setMine(null);
      setMineError(own.error || 'Could not load your postings');
    }
    if (applications.ok) setSent(applications.data || []);
  }, []);

  useEffect(() => { if (signedIn) loadMine(); }, [signedIn, loadMine]);

  const refreshAll = useCallback(() => {
    loadBoard(filters);
    loadMine();
  }, [filters, loadBoard, loadMine]);

  const setFilter = (key: keyof BoardFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([k, v]) => k !== 'status' && v !== undefined && v !== '').length,
    [filters]
  );

  const changeStatus = async (o: JobOpening, status: 'open' | 'closed' | 'filled') => {
    setBusyId(o.id);
    const res = await careersApi.update(o.id, { status });
    setBusyId(null);
    if (!res.ok) {
      toast(res.error || 'Could not change this opening', false);
      return;
    }
    toast(status === 'open' ? 'Opening re-opened — it is back on the board' : status === 'filled' ? 'Marked as filled' : 'Opening closed');
    refreshAll();
  };

  const remove = async (o: JobOpening) => {
    if (!window.confirm(`Delete “${o.title}”? This cannot be undone.`)) return;
    setBusyId(o.id);
    const res = await careersApi.remove(o.id);
    setBusyId(null);
    if (!res.ok) {
      toast(res.error || 'Could not delete this opening', false);
      return;
    }
    toast('Opening deleted');
    refreshAll();
  };

  const received = (mine || []).reduce((n, o) => n + (o.applicationsCount || 0), 0);
  const openRoles = (mine || []).filter((o) => o.status === 'open').length;

  return (
    <div className="cr-root">
      <div className="view-head">
        <h1 className="text-gradient">Careers</h1>
        <span className="sub">open roles published by verified Mallchain accounts</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setEditing(null); setFormOpen(true); }}
            disabled={!verification.verified}
            title={verification.verified ? 'Publish a role to the board' : verification.message}
          >
            Post an opening
          </button>
        </div>
      </div>

      {!verification.verified && verification.state !== 'checking' && (
        <div className="card cr-verify-card mb">
          <div className="row">
            <div className="grow">
              <b>Verified accounts post and apply</b>
              <div className="tiny">{verification.message}</div>
            </div>
            {verification.action && <a className="btn btn-ghost btn-sm" href={verification.action.href}>{verification.action.label}</a>}
            {verification.state === 'unreachable' && <button className="btn btn-ghost btn-sm" onClick={verification.refresh}>Try again</button>}
          </div>
        </div>
      )}

      <div className="earn-grid">
        <div className="card earn-card">
          <div className="lbl">Roles on the board</div>
          <div className="num">{board ? board.total : '—'}</div>
          <div className="def">{filters.status === 'open' ? 'Openings accepting applications' : `Openings with status “${filters.status}”`}{activeFilterCount ? ', matching your filters' : ''}.</div>
          <div className="src">Counted by the server for this filter set.</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">Workspaces hiring</div>
          <div className="num">{board ? board.availableWorkspaces.length : '—'}</div>
          <div className="def">Distinct workspaces with at least one open role right now.</div>
          <div className="src">From the board read, not a fixed list.</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">Your open postings</div>
          <div className="num">{mine ? openRoles : '—'}</div>
          <div className="def">Roles you published that are still accepting applications.</div>
          <div className="src">{mine ? `${mine.length} posting${mine.length === 1 ? '' : 's'} in total, including closed and filled.` : 'Your postings have not loaded.'}</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">Applications received</div>
          <div className="num">{mine ? received : '—'}</div>
          <div className="def">Messages sent to you across your postings.</div>
          <div className="src">Each one is a notification on your account.</div>
        </div>
        <div className="card earn-card">
          <div className="lbl">Applications sent</div>
          <div className="num">{sent ? sent.length : '—'}</div>
          <div className="def">Roles you applied to, with the author&apos;s answer when there is one.</div>
          <div className="src">{sent ? `${sent.filter((a) => a.status === 'submitted').length} still awaiting a response.` : 'Your applications have not loaded.'}</div>
        </div>
      </div>

      <div className="seg-group mb" role="group" aria-label="Careers section">
        {([['board', 'Open roles'], ['mine', 'My postings'], ['applications', 'My applications']] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" className={'seg' + (tab === key ? ' active' : '')} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}{key === 'mine' && mine?.length ? ` (${mine.length})` : ''}{key === 'applications' && sent?.length ? ` (${sent.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <>
          <div className="card cr-filters mb">
            <div className="cr-filter-search">
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles, skills and descriptions"
                aria-label="Search openings"
              />
            </div>
            <select className="input" value={filters.workspace || ''} onChange={(e) => setFilter('workspace', e.target.value)} aria-label="Workspace">
              <option value="">All workspaces</option>
              {(board?.availableWorkspaces.length ? board.availableWorkspaces : options?.workspaces || []).map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <select className="input" value={filters.field || ''} onChange={(e) => setFilter('field', e.target.value)} aria-label="Field">
              <option value="">All fields</option>
              {(board?.availableFields.length ? board.availableFields : options?.fields || []).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select className="input" value={filters.workMode || ''} onChange={(e) => setFilter('workMode', e.target.value)} aria-label="Work mode">
              <option value="">Any work mode</option>
              {(Object.keys(WORK_MODE_LABEL) as Array<keyof typeof WORK_MODE_LABEL>).map((k) => <option key={k} value={k}>{WORK_MODE_LABEL[k]}</option>)}
            </select>
            <select className="input" value={filters.employmentType || ''} onChange={(e) => setFilter('employmentType', e.target.value)} aria-label="Employment type">
              <option value="">Any employment type</option>
              {(Object.keys(EMPLOYMENT_LABEL) as Array<keyof typeof EMPLOYMENT_LABEL>).map((k) => <option key={k} value={k}>{EMPLOYMENT_LABEL[k]}</option>)}
            </select>
            <select className="input" value={filters.seniority || ''} onChange={(e) => setFilter('seniority', e.target.value)} aria-label="Seniority">
              <option value="">Any seniority</option>
              {(Object.keys(SENIORITY_LABEL) as Array<keyof typeof SENIORITY_LABEL>).map((k) => <option key={k} value={k}>{SENIORITY_LABEL[k]}</option>)}
            </select>
            <select className="input" value={filters.educationLevel || ''} onChange={(e) => setFilter('educationLevel', e.target.value)} aria-label="Education level">
              <option value="">Any education level</option>
              {(Object.keys(EDUCATION_LABEL) as Array<keyof typeof EDUCATION_LABEL>).map((k) => <option key={k} value={k}>{EDUCATION_LABEL[k]}</option>)}
            </select>
            <select className="input" value={filters.status || 'open'} onChange={(e) => setFilter('status', e.target.value)} aria-label="Opening status">
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
              <option value="all">All statuses</option>
            </select>
            {(activeFilterCount > 0 || filters.status !== 'open') && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilters({ status: 'open' }); }}>Clear filters</button>
            )}
          </div>

          {boardError && <div className="cr-error mb" role="alert">{boardError}</div>}

          {!board && !boardError && <div className="cr-loading">Loading the board…</div>}

          {board && board.openings.length === 0 && (
            <div className="card card-glow bg-gradient-card">
              <div className="empty-state">
                <div className="es-ico">💼</div>
                <div className="es-t">{activeFilterCount ? 'No roles match these filters' : 'No openings on the board yet'}</div>
                <div className="es-m">
                  {activeFilterCount
                    ? 'Widen the filters, or clear them to see everything that is published.'
                    : 'Every role here is published by a verified account. If you are hiring, post the first one.'}
                </div>
                {activeFilterCount > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilters({ status: 'open' }); }}>Clear filters</button>}
              </div>
            </div>
          )}

          <div className="cr-board stagger">
            {(board?.openings || []).map((o) => (
              <article key={o.id} className="card card-glow bg-gradient-card card-hover cr-role">
                <div className="row">
                  <div className="grow">
                    <b className="cr-role-title">{o.title}</b>
                    <div className="tiny">{o.workspace} · {o.field}</div>
                  </div>
                  <div className="cr-chips">
                    <span className="chip cr-mode">{WORK_MODE_LABEL[o.workMode]}</span>
                    {o.status !== 'open' && <span className={'chip cr-status-' + o.status}>{o.status}</span>}
                  </div>
                </div>

                <div className="cr-role-meta">
                  {EMPLOYMENT_LABEL[o.employmentType]} · {SENIORITY_LABEL[o.seniority]} · {o.experienceYears === 0 ? 'no experience required' : `${o.experienceYears}+ yrs`} · {EDUCATION_LABEL[o.educationLevel]}
                </div>
                <div className="cr-role-pay">{payLine(o)}{o.equity ? ` · ${o.equity}` : ''}</div>

                {o.skills.length > 0 && (
                  <div className="cr-chips">
                    {o.skills.slice(0, 5).map((s) => <span key={s} className="chip cr-skill">{s}</span>)}
                    {o.skills.length > 5 && <span className="chip cr-skill cr-skill-soft">+{o.skills.length - 5}</span>}
                  </div>
                )}

                <div className="tiny cr-role-foot">
                  {o.location || WORK_MODE_LABEL[o.workMode]}
                  {o.deadline ? ` · apply by ${fmtDate(o.deadline)}` : ''}
                  {` · ${o.positions} position${o.positions === 1 ? '' : 's'}`}
                  {` · ${o.applicationsCount} applied`}
                </div>
                <div className="tiny cr-role-author">Posted by {o.authorName}{o.createdAt ? ` · ${fmtDate(o.createdAt)}` : ''}</div>

                <div className="row cr-role-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetailId(o.id)}>View role</button>
                  {o.mine ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setTab('mine'); }}>Your posting</button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setDetailId(o.id)}
                      disabled={o.status !== 'open'}
                      title={o.status !== 'open' ? `This opening is ${o.status}` : 'Read the full spec and send the author a message'}
                    >
                      Apply
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {board && board.openings.length < board.total && (
            <div className="row cr-more">
              <button className="btn btn-ghost btn-sm" onClick={() => loadBoard(filters, board.openings.length)} disabled={loading}>
                {loading && <span className="spin" />} Load more ({board.total - board.openings.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (
        <>
          {mineError && <div className="cr-error mb" role="alert">{mineError}</div>}
          {!mine && !mineError && <div className="cr-loading">Loading your postings…</div>}
          {mine && mine.length === 0 && (
            <div className="card card-glow bg-gradient-card">
              <div className="empty-state">
                <div className="es-ico">📝</div>
                <div className="es-t">You have not posted an opening</div>
                <div className="es-m">Publish a role with its full specification — requirements, skills, education level, pay and how to apply. Verified accounts can post.</div>
                <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }} disabled={!verification.verified}>Post an opening</button>
              </div>
            </div>
          )}
          <div className="stagger">
            {(mine || []).map((o) => (
              <div key={o.id} className="card card-glow bg-gradient-card mb cr-role">
                <div className="row">
                  <div className="grow">
                    <b className="cr-role-title">{o.title}</b>
                    <div className="tiny">{o.workspace} · {o.field} · {EMPLOYMENT_LABEL[o.employmentType]} · {payLine(o)}</div>
                  </div>
                  <span className={'chip cr-status-' + o.status}>{o.status}</span>
                </div>
                <div className="tiny cr-role-foot">
                  {o.applicationsCount} application{o.applicationsCount === 1 ? '' : 's'}
                  {o.deadline ? ` · deadline ${fmtDate(o.deadline)}` : ''}
                  {o.createdAt ? ` · posted ${fmtDate(o.createdAt)}` : ''}
                </div>
                <div className="row cr-role-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setInbox(o)}>Applications ({o.applicationsCount})</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetailId(o.id)}>View role</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(o); setFormOpen(true); }} disabled={busyId === o.id}>Edit</button>
                  {o.status === 'open' ? (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(o, 'filled')} disabled={busyId === o.id}>Mark filled</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(o, 'closed')} disabled={busyId === o.id}>Close</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(o, 'open')} disabled={busyId === o.id}>Re-open</button>
                  )}
                  <button className="btn btn-ghost btn-sm cr-danger" onClick={() => remove(o)} disabled={busyId === o.id}>Delete</button>
                </div>
                {o.applicationsCount > 0 && (
                  <div className="hint">An opening with applications cannot be deleted — close it instead, so applicants keep a reference to what they applied to.</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'applications' && <MyApplications onOpen={(openingId) => setDetailId(openingId)} />}

      {detailId && (
        <OpeningDetail
          openingId={detailId}
          verification={verification}
          onClose={() => setDetailId(null)}
          onApplied={refreshAll}
        />
      )}
      {formOpen && (
        <OpeningForm
          options={options}
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); refreshAll(); setTab('mine'); }}
        />
      )}
      {inbox && <ApplicationInbox opening={inbox} onClose={() => setInbox(null)} onChanged={refreshAll} />}
    </div>
  );
}
