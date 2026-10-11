/**
 * KycSession — the full-page identity-verification wizard that the KYC
 * gate's "Start Verification Now" opens at #/kyc.
 *
 * Five steps whose ids mirror the backend's VALID_STEPS
 * (controllers/kycController.js saveDraft) so draft autosave
 * (PATCH /api/kyc/draft) and submit validation line up exactly. Every edit
 * is debounced-saved as a draft, so closing the browser mid-flow and
 * coming back resumes on the last touched step with fields refilled.
 *
 * Styling reuses features/auth/KycWizard.css; KycSession.css only adapts
 * the standalone auth-page layout to the in-app shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { AlertTriangle, Check, Shield } from 'lucide-react';
import { kycApi } from '../../services/kycApi';
import { api } from '../../services/api';
import '../auth/KycWizard.css';
import './KycSession.css';

type Phase = 'loading' | 'wizard' | 'pending' | 'approved' | 'success';

interface KycForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  phoneNumber: string;
  idType: string;
  idNumber: string;
  idExpiry: string;
  idDocumentUrl: string;
  idDocumentName: string;
  occupation: string;
  sourceOfFunds: string;
  annualIncome: string;
  politicalExposure: boolean;
  confirm: boolean;
}

const EMPTY_FORM: KycForm = {
  firstName: '', lastName: '', dateOfBirth: '', nationality: '',
  address: '', city: '', country: 'Kenya', postalCode: '', phoneNumber: '',
  idType: 'national_id', idNumber: '', idExpiry: '', idDocumentUrl: '', idDocumentName: '',
  occupation: '', sourceOfFunds: '', annualIncome: '', politicalExposure: false, confirm: false,
};

const STEPS = [
  { id: 'personal', title: 'About you' },
  { id: 'address', title: 'Address & contact' },
  { id: 'identity', title: 'ID document' },
  { id: 'financial', title: 'Financial profile' },
  { id: 'review', title: 'Review & submit' },
] as const;

const LEADS: Record<(typeof STEPS)[number]['id'], string> = {
  personal: 'Tell us who you are — exactly as written on your government ID.',
  address: 'Where you live and how we can reach you about your verification.',
  identity: 'Upload a photo or scan of your ID document so we can verify it.',
  financial: 'A few questions about your financial profile, required by anti-money-laundering rules.',
  review: 'Check everything below, then submit. You can go back and edit any section.',
};

const REQUIRED: Record<(typeof STEPS)[number]['id'], string[]> = {
  personal: ['firstName', 'lastName', 'dateOfBirth', 'nationality'],
  address: ['address', 'city', 'country', 'postalCode', 'phoneNumber'],
  identity: ['idType', 'idNumber', 'idExpiry', 'idDocumentUrl'],
  financial: ['occupation', 'sourceOfFunds', 'annualIncome'],
  review: ['confirm'],
};

const ID_TYPES = [
  { value: 'national_id', label: 'National ID card' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's licence" },
];

const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Nigeria', 'Ghana', 'South Africa', 'United Kingdom', 'United States', 'Other'];

const SOURCE_OF_FUNDS = ['Salary / employment', 'Business income', 'Investments & trading', 'Savings', 'Family support', 'Other'];

const INCOME_RANGES = ['Below KES 100,000', 'KES 100,000 – 500,000', 'KES 500,000 – 1,000,000', 'KES 1,000,000 – 5,000,000', 'Above KES 5,000,000'];

interface DraftResponse {
  ok: boolean;
  step: string | null;
  data: Record<string, unknown> | null;
  updatedAt: string | null;
}

/** Only user-typed content counts as "has progress" — defaults (country,
    id type) and the confirm box alone don't justify creating a draft. */
function hasAnyInput(f: KycForm): boolean {
  const rec = f as unknown as Record<string, unknown>;
  const typed = ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'address', 'city', 'postalCode', 'phoneNumber', 'idNumber', 'idExpiry', 'idDocumentUrl', 'occupation', 'sourceOfFunds', 'annualIncome'];
  return typed.some((k) => String(rec[k] ?? '').trim() !== '') || f.politicalExposure;
}

function applyDraft(d: Record<string, unknown>): KycForm {
  const next = { ...EMPTY_FORM } as unknown as Record<string, unknown>;
  for (const key of Object.keys(EMPTY_FORM)) {
    if (key === 'confirm') continue;
    const v = d[key];
    if (key === 'politicalExposure') {
      next[key] = v === true;
      continue;
    }
    if (typeof v === 'string' && v) {
      next[key] = key === 'dateOfBirth' || key === 'idExpiry' ? v.slice(0, 10) : v;
    }
  }
  return next as unknown as KycForm;
}

function WizardShell({ children }: { children: ReactNode }) {
  return (
    <div className="kyc-wizard kyc-session">
      <div className="kyc-bg-a" aria-hidden="true" />
      <div className="kyc-bg-b" aria-hidden="true" />
      <div className="kyc-vignette" aria-hidden="true" />
      <div className="kyc-shell">{children}</div>
    </div>
  );
}

export default function KycSession({ navigate }: { navigate: (p: string) => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<KycForm>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [rejectedNotes, setRejectedNotes] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /* Load current status + any saved draft. Status decides the phase;
     pending/review/approved users land on a result screen instead of the
     wizard. A failed status fetch fails open into the wizard. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, draftRes] = await Promise.all([
        kycApi.getStatus(),
        api.get<DraftResponse>('/api/kyc/draft'),
      ]);
      if (cancelled) return;
      const status = statusRes.ok && statusRes.data ? statusRes.data.status : 'not_submitted';
      if (status === 'approved') {
        setPhase('approved');
        return;
      }
      if (status === 'pending' || status === 'review') {
        setSubmittedAt((statusRes.ok && statusRes.data?.submittedAt) || null);
        setPhase('pending');
        return;
      }
      if (status === 'rejected' && statusRes.ok) {
        setRejectedNotes(statusRes.data?.notes ?? '');
      }
      if (draftRes.ok && draftRes.data?.data) {
        setForm(applyDraft(draftRes.data.data));
        const idx = STEPS.findIndex((s) => s.id === draftRes.data?.step);
        if (idx >= 0) setStepIndex(idx);
      }
      setPhase('wizard');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDraft = useCallback((stepId: string, f: KycForm) => {
    if (!hasAnyInput(f)) return;
    const data: Record<string, unknown> = { ...f };
    delete data.confirm;
    api.patch('/api/kyc/draft', { step: stepId, data });
  }, []);

  useEffect(() => {
    if (phase !== 'wizard') return;
    const t = setTimeout(() => saveDraft(STEPS[stepIndex].id, form), 1200);
    return () => clearTimeout(t);
  }, [form, stepIndex, phase, saveDraft]);

  const missing = useMemo(() => {
    const req = REQUIRED[STEPS[stepIndex].id];
    const rec = form as unknown as Record<string, unknown>;
    return req.filter((k) => (k === 'confirm' ? !form.confirm : String(rec[k] ?? '').trim() === ''));
  }, [form, stepIndex]);

  const bad = useCallback((k: string) => showErrors && missing.includes(k), [showErrors, missing]);

  const set = (key: keyof KycForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const setBool = (key: 'politicalExposure' | 'confirm') => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.checked }));

  const goTo = useCallback((i: number) => {
    setShowErrors(false);
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, i)));
  }, []);

  const next = () => {
    if (missing.length > 0) {
      setShowErrors(true);
      return;
    }
    goTo(stepIndex + 1);
  };

  const acceptFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setUploadError('');
    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) {
      setUploadError('Unsupported format — upload a PNG, JPG, or PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('That file is larger than 10 MB — try a smaller copy.');
      return;
    }
    setUploading(true);
    const res = await kycApi.uploadDocument(file);
    setUploading(false);
    if (!res.ok || !res.data?.documentRef) {
      setUploadError(res.error ?? 'Upload failed — please try again.');
      return;
    }
    setForm((f) => ({ ...f, idDocumentUrl: res.data!.documentRef, idDocumentName: file.name }));
  }, []);

  const submit = async () => {
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    const res = await kycApi.submit({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      nationality: form.nationality,
      address: form.address.trim(),
      city: form.city.trim(),
      country: form.country,
      postalCode: form.postalCode.trim(),
      phoneNumber: form.phoneNumber.trim(),
      idType: form.idType,
      idNumber: form.idNumber.trim(),
      idExpiry: form.idExpiry,
      idDocumentUrl: form.idDocumentUrl,
      occupation: form.occupation.trim(),
      sourceOfFunds: form.sourceOfFunds,
      annualIncome: form.annualIncome,
      politicalExposure: form.politicalExposure,
    });
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res.error ?? 'Submission failed — please try again.');
      return;
    }
    api.delete('/api/kyc/draft');
    setPhase('success');
  };

  if (phase === 'loading') {
    return (
      <WizardShell>
        <main className="kyc-main">
          <div className="kyc-session-loading" role="status">
            <span className="kyc-session-loading-text">loading.........</span>
          </div>
        </main>
      </WizardShell>
    );
  }

  if (phase !== 'wizard') {
    const conf = {
      pending: {
        title: 'Verification under review',
        lead: 'Your submission is with our compliance team. We will notify you in-app and by email as soon as the review is complete — most reviews finish within one business day.',
        ok: false,
      },
      approved: {
        title: 'You are verified',
        lead: 'Your identity has been verified. Every part of Mallchain — sending, trading, staking, governance — is now unlocked for your account.',
        ok: true,
      },
      success: {
        title: 'Verification submitted',
        lead: 'Thank you — your application is now with our compliance team. We will notify you in-app and by email once the review is complete, usually within one business day.',
        ok: true,
      },
    }[phase];

    return (
      <WizardShell>
        <main className="kyc-main">
          <div className={`kyc-panel kyc-session-status${conf.ok ? ' ok' : ''}`}>
            <div className="kyc-session-status-icon">
              {phase === 'approved' ? <Check size={30} /> : <Shield size={30} />}
            </div>
            <h1 className="kyc-step-title">{conf.title}</h1>
            <p className="kyc-step-lead">{conf.lead}</p>
            {phase === 'pending' && submittedAt && (
              <dl className="kyc-session-meta">
                <div>
                  <dt>Submitted</dt>
                  <dd>{new Date(submittedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
                </div>
              </dl>
            )}
            <div className="kyc-nav">
              <button type="button" className="kyc-btn kyc-btn-primary" onClick={() => navigate('/')}>
                Back to dashboard
              </button>
            </div>
          </div>
        </main>
      </WizardShell>
    );
  }

  const summaryRows: { label: string; value: string; step: number }[] = [
    { label: 'Name', value: `${form.firstName} ${form.lastName}`.trim(), step: 0 },
    { label: 'Date of birth', value: form.dateOfBirth, step: 0 },
    { label: 'Nationality', value: form.nationality, step: 0 },
    { label: 'Address', value: [form.address, form.city, form.postalCode].filter(Boolean).join(', '), step: 1 },
    { label: 'Country', value: form.country, step: 1 },
    { label: 'Phone', value: form.phoneNumber, step: 1 },
    { label: 'ID type', value: ID_TYPES.find((t) => t.value === form.idType)?.label ?? form.idType, step: 2 },
    { label: 'ID number', value: form.idNumber, step: 2 },
    { label: 'ID expiry', value: form.idExpiry, step: 2 },
    { label: 'Document', value: form.idDocumentName || (form.idDocumentUrl ? 'Uploaded' : ''), step: 2 },
    { label: 'Occupation', value: form.occupation, step: 3 },
    { label: 'Source of funds', value: form.sourceOfFunds, step: 3 },
    { label: 'Annual income', value: form.annualIncome, step: 3 },
    { label: 'Politically exposed', value: form.politicalExposure ? 'Yes' : 'No', step: 3 },
  ];

  return (
    <WizardShell>
      <aside className="kyc-sidebar">
        <a className="kyc-logo-link" href="#/">
          <img src="/mallchain.svg" alt="" width={26} height={26} />
          Mallchain
        </a>
        <p className="kyc-sidebar-desc">
          This session takes about five minutes. Your progress is saved automatically — you can
          close this page and pick up right where you left off.
        </p>
        <ol className="kyc-stepper">
          {STEPS.map((step, i) => {
            const isCompleted = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <li
                key={step.id}
                className={isCurrent ? 'on' : isCompleted ? 'done' : ''}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="kyc-dot">{isCompleted ? '✓' : String(i + 1)}</span>
                <span>{step.title}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="kyc-main">
        <div className="kyc-panel">
          {rejectedNotes && (
            <div className="kyc-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              Your previous submission was rejected. {rejectedNotes} Update your details below and
              resubmit.
            </div>
          )}

          {showErrors && missing.length > 0 && (
            <div className="kyc-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              Please complete the highlighted fields to continue.
            </div>
          )}

          <div className="kyc-step-content">
            <h1 className="kyc-step-title">{STEPS[stepIndex].title}</h1>
            <p className="kyc-step-lead">{LEADS[STEPS[stepIndex].id]}</p>

            {STEPS[stepIndex].id === 'personal' && (
              <>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-first">First name</label>
                    <input
                      id="ks-first"
                      value={form.firstName}
                      onChange={set('firstName')}
                      aria-invalid={bad('firstName')}
                      placeholder="As on your ID"
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-last">Last name</label>
                    <input
                      id="ks-last"
                      value={form.lastName}
                      onChange={set('lastName')}
                      aria-invalid={bad('lastName')}
                      placeholder="As on your ID"
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-dob">Date of birth</label>
                    <input
                      id="ks-dob"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={set('dateOfBirth')}
                      aria-invalid={bad('dateOfBirth')}
                    />
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-nat">Nationality</label>
                    <select id="ks-nat" value={form.nationality} onChange={set('nationality')} aria-invalid={bad('nationality')}>
                      <option value="">Select nationality</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {STEPS[stepIndex].id === 'address' && (
              <>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-street">Street address</label>
                    <input
                      id="ks-street"
                      value={form.address}
                      onChange={set('address')}
                      aria-invalid={bad('address')}
                      placeholder="Street, house / apartment"
                      autoComplete="street-address"
                    />
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-city">City / town</label>
                    <input
                      id="ks-city"
                      value={form.city}
                      onChange={set('city')}
                      aria-invalid={bad('city')}
                      autoComplete="address-level2"
                    />
                  </div>
                </div>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-postal">Postal code</label>
                    <input
                      id="ks-postal"
                      value={form.postalCode}
                      onChange={set('postalCode')}
                      aria-invalid={bad('postalCode')}
                      autoComplete="postal-code"
                    />
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-country">Country</label>
                    <select id="ks-country" value={form.country} onChange={set('country')} aria-invalid={bad('country')}>
                      <option value="">Select country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="kyc-field">
                  <label htmlFor="ks-phone">Phone number</label>
                  <input
                    id="ks-phone"
                    type="tel"
                    value={form.phoneNumber}
                    onChange={set('phoneNumber')}
                    aria-invalid={bad('phoneNumber')}
                    placeholder="+254 …"
                    autoComplete="tel"
                  />
                </div>
              </>
            )}

            {STEPS[stepIndex].id === 'identity' && (
              <>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-idtype">Document type</label>
                    <select id="ks-idtype" value={form.idType} onChange={set('idType')} aria-invalid={bad('idType')}>
                      {ID_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-idnum">Document number</label>
                    <input
                      id="ks-idnum"
                      value={form.idNumber}
                      onChange={set('idNumber')}
                      aria-invalid={bad('idNumber')}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="kyc-field">
                  <label htmlFor="ks-idexp">Expiry date</label>
                  <input
                    id="ks-idexp"
                    type="date"
                    value={form.idExpiry}
                    onChange={set('idExpiry')}
                    aria-invalid={bad('idExpiry')}
                  />
                </div>

                <div
                  className={`kyc-drop-zone${form.idDocumentUrl ? ' has-file' : ''}${dragOver ? ' drag' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  aria-label="Upload ID document"
                >
                  <div className="kyc-upload-frame">
                    <b>{form.idDocumentUrl ? 'Document attached' : 'Drop your document here'}</b>
                    <span>
                      {form.idDocumentUrl
                        ? form.idDocumentName || 'ID document'
                        : 'Or click to browse · PNG, JPG or PDF · up to 10 MB'}
                    </span>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    acceptFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <p className={`kyc-upload-status${uploadError ? ' err' : ''}`} role={uploadError ? 'alert' : undefined}>
                  {uploadError || (uploading ? 'Uploading…' : '')}
                </p>

                <ul className="kyc-tips">
                  <li>All four corners of the document visible</li>
                  <li>Text fully readable — no glare or blur</li>
                  <li>Valid (not expired) government-issued document</li>
                </ul>
              </>
            )}

            {STEPS[stepIndex].id === 'financial' && (
              <>
                <div className="kyc-field">
                  <label htmlFor="ks-occ">Occupation</label>
                  <input
                    id="ks-occ"
                    value={form.occupation}
                    onChange={set('occupation')}
                    aria-invalid={bad('occupation')}
                    placeholder="e.g. Software engineer, Shop owner"
                  />
                </div>
                <div className="kyc-form-row">
                  <div className="kyc-field">
                    <label htmlFor="ks-sof">Source of funds</label>
                    <select id="ks-sof" value={form.sourceOfFunds} onChange={set('sourceOfFunds')} aria-invalid={bad('sourceOfFunds')}>
                      <option value="">Select source</option>
                      {SOURCE_OF_FUNDS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="kyc-field">
                    <label htmlFor="ks-income">Annual income</label>
                    <select id="ks-income" value={form.annualIncome} onChange={set('annualIncome')} aria-invalid={bad('annualIncome')}>
                      <option value="">Select range</option>
                      {INCOME_RANGES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="kyc-checkbox">
                  <input type="checkbox" checked={form.politicalExposure} onChange={setBool('politicalExposure')} />
                  <span>
                    I hold, or have held in the last 12 months, a prominent public position
                    (politically exposed person), or a family member / close associate does.
                  </span>
                </label>
              </>
            )}

            {STEPS[stepIndex].id === 'review' && (
              <>
                <dl className="kyc-summary">
                  {summaryRows.map((row) => (
                    <div className="kyc-sum-row" key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value || <em className="kyc-sum-empty">—</em>}</dd>
                      <button type="button" className="kyc-edit-btn" onClick={() => goTo(row.step)}>
                        Edit
                      </button>
                    </div>
                  ))}
                </dl>
                <label className="kyc-checkbox">
                  <input type="checkbox" checked={form.confirm} onChange={setBool('confirm')} />
                  <span>
                    I confirm the information above is true and complete. I understand that
                    providing false information may lead to account suspension.
                  </span>
                </label>
                {submitError && (
                  <div className="kyc-error" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    {submitError}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="kyc-nav">
            {stepIndex > 0 && (
              <button type="button" className="kyc-btn kyc-btn-ghost" onClick={() => goTo(stepIndex - 1)}>
                Back
              </button>
            )}
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className="kyc-btn kyc-btn-primary" onClick={next}>
                Continue
              </button>
            )}
            {STEPS[stepIndex].id === 'review' && (
              <button
                type="button"
                className="kyc-btn kyc-btn-primary"
                disabled={!form.confirm || submitting}
                onClick={submit}
              >
                {submitting ? 'Submitting…' : 'Submit verification'}
              </button>
            )}
          </div>
        </div>
      </main>
    </WizardShell>
  );
}
