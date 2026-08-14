/**
 * Shared multi-step flow/wizard hook.
 *
 * Every wizard in the app (KYC, wallet creation, wallet send, mines
 * participation, private key export, ...) used to be a bare `useState`
 * step counter with hand-written transitions like `setKycStep(2)` — easy to
 * typo into the wrong step (see: the KYC "submit success sends you backward"
 * bug), and never persisted, so a reload silently threw away all progress.
 *
 * `useWizard` fixes both:
 *  - `next()`/`back()` are computed from the declared `steps` list, so a
 *    transition can never land outside it. `goTo(step)` is typed against the
 *    same list, so an explicit jump is reviewable against the list in the
 *    same file instead of being a magic number that needs a comment.
 *  - Progress is persisted through one of two tiers:
 *    - 'durable': the existing localStorage-backed `store` (cross-tab synced,
 *      survives full browser restarts) — for non-sensitive flow data.
 *    - 'session': sessionStorage (same-tab reload only, cleared on tab close,
 *      never cross-tab) — for sensitive flow data (PII, mnemonics, PIN
 *      attempts, private key material).
 */
import { useRef, useState } from 'react';
import { store } from '../store/store';
import { getSessionDraft, setSessionDraft, clearSessionDraft } from '../services/sessionDraft';

export type WizardTier = 'durable' | 'session';

export interface UseWizardOptions<TStep extends string, TData extends Record<string, unknown>> {
  /** Unique flow id. Parameterize it (e.g. `minesParticipation:${campaignId}`) when a flow can have multiple concurrent instances. */
  key: string;
  /** Ordered list of valid steps — the single source of truth for transitions. */
  steps: readonly TStep[];
  tier: WizardTier;
  initialData: TData;
  initialStep?: TStep;
}

export interface UseWizardApi<TStep extends string, TData extends Record<string, unknown>> {
  step: TStep;
  stepIndex: number;
  data: TData;
  setData: (patch: Partial<TData> | ((d: TData) => Partial<TData>)) => void;
  /** The only primitive that changes `step` directly. Must be a member of `steps`. */
  goTo: (step: TStep) => void;
  next: () => void;
  back: () => void;
  error: string;
  setError: (e: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Clear persisted progress and reset to initial step/data — call on flow success or explicit cancel. */
  reset: () => void;
  /** Alias for reset(), for readability at a flow's success call site. */
  complete: () => void;
}

function readPersisted<TStep extends string, TData extends Record<string, unknown>>(
  key: string,
  tier: WizardTier,
  steps: readonly TStep[]
): { step: TStep; data: TData } | null {
  const record = tier === 'durable' ? store.getFlow(key) : getSessionDraft<TData>(key);
  if (!record) return null;
  const step = record.step as TStep;
  if (!steps.includes(step)) return null;
  return { step, data: record.data as TData };
}

export function useWizard<TStep extends string, TData extends Record<string, unknown>>(
  options: UseWizardOptions<TStep, TData>
): UseWizardApi<TStep, TData> {
  const { key, steps, tier, initialData, initialStep } = options;
  const defaultStep = initialStep ?? steps[0];

  const hydrated = useRef(readPersisted<TStep, TData>(key, tier, steps));
  const [step, setStep] = useState<TStep>(hydrated.current?.step ?? defaultStep);
  const [data, setDataState] = useState<TData>(hydrated.current?.data ?? initialData);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // `step`/`data` from useState are only current as of the last *render* —
  // calling e.g. next() and setData() back-to-back in the same handler would
  // otherwise have the second call persist against the first call's stale
  // pre-update closure value (a real bug caught by this hook's own tests:
  // it silently dropped the just-made step transition). These refs are
  // updated synchronously on every write, so `persist()` always sees the
  // true latest values regardless of call order within one batch.
  const stepRef = useRef(step);
  const dataRef = useRef(data);

  const persist = (nextStep: TStep, nextData: TData) => {
    stepRef.current = nextStep;
    dataRef.current = nextData;
    if (tier === 'durable') {
      store.setFlow(key, { step: nextStep, data: nextData });
    } else {
      setSessionDraft<TData>(key, { step: nextStep, data: nextData });
    }
  };

  const goTo = (nextStep: TStep) => {
    setStep(nextStep);
    setError('');
    persist(nextStep, dataRef.current);
  };

  const setData: UseWizardApi<TStep, TData>['setData'] = (patch) => {
    const merged = { ...dataRef.current, ...(typeof patch === 'function' ? patch(dataRef.current) : patch) };
    setDataState(merged);
    persist(stepRef.current, merged);
  };

  const stepIndex = steps.indexOf(step);

  const next = () => {
    const idx = steps.indexOf(stepRef.current);
    const nextStep = steps[Math.min(idx + 1, steps.length - 1)];
    goTo(nextStep);
  };

  const back = () => {
    const idx = steps.indexOf(stepRef.current);
    const prevStep = steps[Math.max(idx - 1, 0)];
    goTo(prevStep);
  };

  const clearPersisted = () => {
    if (tier === 'durable') store.clearFlow(key);
    else clearSessionDraft(key);
  };

  const reset = () => {
    clearPersisted();
    stepRef.current = defaultStep;
    dataRef.current = initialData;
    setStep(defaultStep);
    setDataState(initialData);
    setError('');
    setBusy(false);
  };

  return { step, stepIndex, data, setData, goTo, next, back, error, setError, busy, setBusy, reset, complete: reset };
}
