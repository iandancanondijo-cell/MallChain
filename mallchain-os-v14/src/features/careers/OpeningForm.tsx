import { useState } from 'react';
import { Modal, toast } from '../../components/ui';
import {
  careersApi, EMPTY_SPEC,
  EDUCATION_LABEL, EMPLOYMENT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL,
  type CareersOptions, type JobOpening, type JobSpec,
} from '../../services/careersApi';

const lines = (value: string) => value.split('\n').map((s) => s.trim()).filter(Boolean);
const joined = (value: string[]) => value.join('\n');

interface FormState {
  title: string;
  workspace: string;
  field: string;
  description: string;
  responsibilities: string;
  requirements: string;
  skills: string;
  preferredSkills: string;
  benefits: string;
  educationLevel: JobSpec['educationLevel'];
  experienceYears: string;
  seniority: JobSpec['seniority'];
  employmentType: JobSpec['employmentType'];
  location: string;
  workMode: JobSpec['workMode'];
  positions: string;
  payMin: string;
  payMax: string;
  payCurrency: string;
  payPeriod: JobSpec['payPeriod'];
  equity: string;
  applicationInstructions: string;
  deadline: string;
}

function toForm(o: JobOpening | null): FormState {
  const s = o || EMPTY_SPEC;
  return {
    title: s.title,
    workspace: s.workspace,
    field: s.field,
    description: s.description,
    responsibilities: joined(s.responsibilities),
    requirements: joined(s.requirements),
    skills: joined(s.skills),
    preferredSkills: joined(s.preferredSkills),
    benefits: joined(s.benefits),
    educationLevel: s.educationLevel,
    experienceYears: String(s.experienceYears),
    seniority: s.seniority,
    employmentType: s.employmentType,
    location: s.location,
    workMode: s.workMode,
    positions: String(s.positions),
    payMin: s.payMin == null ? '' : String(s.payMin),
    payMax: s.payMax == null ? '' : String(s.payMax),
    payCurrency: s.payCurrency,
    payPeriod: s.payPeriod,
    equity: s.equity,
    applicationInstructions: s.applicationInstructions,
    deadline: s.deadline ? s.deadline.slice(0, 10) : '',
  };
}

/**
 * The posting form. Every field the reader of a job ad needs is here, and the
 * client checks the same rules the server does so a person is not sent a
 * round trip to learn that a title is too short.
 */
export function OpeningForm({
  options, editing, onClose, onSaved,
}: {
  options: CareersOptions | null;
  editing: JobOpening | null;
  onClose: () => void;
  onSaved: (o: JobOpening) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(editing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const workspaces = options?.workspaces || [];
  const fields = options?.fields || [];

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (form.title.trim().length < 4) e.title = 'Give the role a title of at least 4 characters.';
    if (!form.workspace) e.workspace = 'Choose the workspace this role sits in.';
    if (!form.field) e.field = 'Choose the field or discipline.';
    if (form.description.trim().length < 20) e.description = 'Describe the role in at least 20 characters — say what it actually involves.';
    if (lines(form.skills).length === 0) e.skills = 'Name at least one skill the role needs.';
    for (const key of ['responsibilities', 'requirements', 'skills', 'preferredSkills', 'benefits'] as const) {
      if (lines(form[key]).length > 20) e[key] = 'At most 20 lines.';
      else if (lines(form[key]).some((l) => l.length > 300)) e[key] = 'Each line is limited to 300 characters.';
    }
    const years = Number(form.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) e.experienceYears = 'Whole years, between 0 and 60.';
    const positions = Number(form.positions);
    if (!Number.isInteger(positions) || positions < 1 || positions > 999) e.positions = 'Between 1 and 999.';
    const min = form.payMin === '' ? null : Number(form.payMin);
    const max = form.payMax === '' ? null : Number(form.payMax);
    if (min != null && (!Number.isFinite(min) || min < 0)) e.payMin = 'A non-negative number, or leave it blank.';
    if (max != null && (!Number.isFinite(max) || max < 0)) e.payMax = 'A non-negative number, or leave it blank.';
    if (min != null && max != null && min > max) e.payMax = 'The maximum cannot be lower than the minimum.';
    if (!/^[A-Za-z]{3}$/.test(form.payCurrency.trim())) e.payCurrency = 'A three-letter code such as USD or KES.';
    if (form.deadline && new Date(form.deadline).getTime() < Date.now() && !editing) e.deadline = 'The deadline cannot be in the past.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setServerError(null);
    if (!validate()) return;
    const spec: JobSpec = {
      title: form.title.trim(),
      workspace: form.workspace,
      field: form.field,
      description: form.description.trim(),
      responsibilities: lines(form.responsibilities),
      requirements: lines(form.requirements),
      skills: lines(form.skills),
      preferredSkills: lines(form.preferredSkills),
      benefits: lines(form.benefits),
      educationLevel: form.educationLevel,
      experienceYears: Number(form.experienceYears),
      seniority: form.seniority,
      employmentType: form.employmentType,
      location: form.location.trim(),
      workMode: form.workMode,
      positions: Number(form.positions),
      payMin: form.payMin === '' ? null : Number(form.payMin),
      payMax: form.payMax === '' ? null : Number(form.payMax),
      payCurrency: form.payCurrency.trim().toUpperCase(),
      payPeriod: form.payPeriod,
      equity: form.equity.trim(),
      applicationInstructions: form.applicationInstructions.trim(),
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    };
    setBusy(true);
    const res = editing ? await careersApi.update(editing.id, spec) : await careersApi.create(spec);
    setBusy(false);
    if (!res.ok || !res.data) {
      setServerError(res.error || 'Could not save this opening');
      return;
    }
    toast(editing ? 'Opening updated' : 'Opening published — it is on the board now');
    onSaved(res.data);
  };

  const err = (key: string) => errors[key] ? <div className="cr-field-error">{errors[key]}</div> : null;

  const listField = (key: keyof FormState, label: string, hint: string, required = false) => (
    <div className="field">
      <label htmlFor={`cr-${key}`}>{label}{required && ' *'}</label>
      <textarea
        id={`cr-${key}`}
        className="input"
        rows={3}
        value={String(form[key])}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder="One per line"
        disabled={busy}
      />
      <div className="hint">{hint}</div>
      {err(key)}
    </div>
  );

  return (
    <Modal title={editing ? 'Edit opening' : 'Post an opening'} onClose={onClose} wide>
      <div className="cr-form">
        <p className="cr-form-intro">
          Anyone browsing Careers can read this. It is published under your verified account, and applications
          arrive as a message to you — so state the role completely: what it involves, what it needs, and what it pays.
        </p>

        {serverError && <div className="cr-error" role="alert">{serverError}</div>}

        <div className="field">
          <label htmlFor="cr-title">Role title *</label>
          <input id="cr-title" className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Frontend Engineer" disabled={busy} maxLength={120} />
          {err('title')}
        </div>

        <div className="cr-two">
          <div className="field">
            <label htmlFor="cr-workspace">Workspace *</label>
            <select id="cr-workspace" className="input" value={form.workspace} onChange={(e) => set('workspace', e.target.value)} disabled={busy}>
              <option value="">Choose a workspace…</option>
              {workspaces.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <div className="hint">The team or space the role sits in.</div>
            {err('workspace')}
          </div>
          <div className="field">
            <label htmlFor="cr-field">Field *</label>
            <select id="cr-field" className="input" value={form.field} onChange={(e) => set('field', e.target.value)} disabled={busy}>
              <option value="">Choose a field…</option>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="hint">The discipline, so people browsing by skill can find it.</div>
            {err('field')}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cr-description">About the role *</label>
          <textarea id="cr-description" className="input" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What the team does, what this person will own, and why the role exists." disabled={busy} maxLength={4000} />
          <div className="hint">{form.description.length}/4000 characters · at least 20.</div>
          {err('description')}
        </div>

        {listField('responsibilities', 'Responsibilities', 'What the person will actually do, one line per responsibility.')}
        {listField('requirements', 'Requirements', 'Must-haves: experience, certifications, availability, language.')}
        {listField('skills', 'Skills needed *', 'At least one. These are searchable on the board.')}
        {listField('preferredSkills', 'Nice to have', 'Skills that help but are not required.')}
        {listField('benefits', 'Benefits', 'What the role offers beyond pay.')}

        <div className="cr-two">
          <div className="field">
            <label htmlFor="cr-education">Education level</label>
            <select id="cr-education" className="input" value={form.educationLevel} onChange={(e) => set('educationLevel', e.target.value as JobSpec['educationLevel'])} disabled={busy}>
              {(Object.keys(EDUCATION_LABEL) as JobSpec['educationLevel'][]).map((k) => <option key={k} value={k}>{EDUCATION_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cr-experience">Experience required (years)</label>
            <input id="cr-experience" className="input" type="number" min={0} max={60} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} disabled={busy} />
            {err('experienceYears')}
          </div>
        </div>

        <div className="cr-two">
          <div className="field">
            <label htmlFor="cr-seniority">Seniority</label>
            <select id="cr-seniority" className="input" value={form.seniority} onChange={(e) => set('seniority', e.target.value as JobSpec['seniority'])} disabled={busy}>
              {(Object.keys(SENIORITY_LABEL) as JobSpec['seniority'][]).map((k) => <option key={k} value={k}>{SENIORITY_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cr-employment">Employment type</label>
            <select id="cr-employment" className="input" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as JobSpec['employmentType'])} disabled={busy}>
              {(Object.keys(EMPLOYMENT_LABEL) as JobSpec['employmentType'][]).map((k) => <option key={k} value={k}>{EMPLOYMENT_LABEL[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="cr-two">
          <div className="field">
            <label htmlFor="cr-workmode">Work mode</label>
            <select id="cr-workmode" className="input" value={form.workMode} onChange={(e) => set('workMode', e.target.value as JobSpec['workMode'])} disabled={busy}>
              {(Object.keys(WORK_MODE_LABEL) as JobSpec['workMode'][]).map((k) => <option key={k} value={k}>{WORK_MODE_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cr-location">Location</label>
            <input id="cr-location" className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Nairobi, or Remote · East Africa" disabled={busy} maxLength={120} />
          </div>
        </div>

        <div className="cr-two">
          <div className="field">
            <label htmlFor="cr-positions">Positions available</label>
            <input id="cr-positions" className="input" type="number" min={1} max={999} value={form.positions} onChange={(e) => set('positions', e.target.value)} disabled={busy} />
            {err('positions')}
          </div>
          <div className="field">
            <label htmlFor="cr-deadline">Application deadline</label>
            <input id="cr-deadline" className="input" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} disabled={busy} />
            <div className="hint">Leave blank for no deadline.</div>
            {err('deadline')}
          </div>
        </div>

        <div className="cr-pay">
          <div className="field">
            <label htmlFor="cr-paymin">Pay from</label>
            <input id="cr-paymin" className="input" type="number" min={0} value={form.payMin} onChange={(e) => set('payMin', e.target.value)} placeholder="Optional" disabled={busy} />
            {err('payMin')}
          </div>
          <div className="field">
            <label htmlFor="cr-paymax">Pay up to</label>
            <input id="cr-paymax" className="input" type="number" min={0} value={form.payMax} onChange={(e) => set('payMax', e.target.value)} placeholder="Optional" disabled={busy} />
            {err('payMax')}
          </div>
          <div className="field">
            <label htmlFor="cr-currency">Currency</label>
            <input id="cr-currency" className="input" value={form.payCurrency} onChange={(e) => set('payCurrency', e.target.value.toUpperCase())} maxLength={3} disabled={busy} />
            {err('payCurrency')}
          </div>
          <div className="field">
            <label htmlFor="cr-period">Per</label>
            <select id="cr-period" className="input" value={form.payPeriod} onChange={(e) => set('payPeriod', e.target.value as JobSpec['payPeriod'])} disabled={busy}>
              <option value="hour">Hour</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>
        <div className="hint cr-pay-hint">Leave both pay fields blank if the role does not state a number — the board then says "Pay not stated" rather than inventing one.</div>

        <div className="field">
          <label htmlFor="cr-equity">Equity or token allocation</label>
          <input id="cr-equity" className="input" value={form.equity} onChange={(e) => set('equity', e.target.value)} placeholder="Optional — e.g. 0.1% over 4 years" disabled={busy} maxLength={120} />
        </div>

        <div className="field">
          <label htmlFor="cr-instructions">What to include when applying</label>
          <textarea id="cr-instructions" className="input" rows={3} value={form.applicationInstructions} onChange={(e) => set('applicationInstructions', e.target.value)} placeholder="e.g. A short note on your experience, a link to work you have shipped, and your availability." disabled={busy} maxLength={1000} />
          <div className="hint">Shown to the applicant before they write their message.</div>
        </div>

        <div className="row cr-form-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
            {busy && <span className="spin" />} {editing ? 'Save changes' : 'Publish opening'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
