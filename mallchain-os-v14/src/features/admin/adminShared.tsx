/**
 * Shared helpers for the admin category windows.
 *
 * Problem this solves: every admin list fetch used the pattern
 * `if (r.ok && r.data) setState(...)` and silently swallowed failures —
 * so a 403/500 looked exactly like "queue is empty", which is how panels
 * appeared "not in good condition" to admins. `collectErrors` turns a
 * batch of ApiResult responses into a human-readable list, and
 * <AdminErrorBanner/> renders it (distinguishing 403 role/category
 * failures from server errors) above the empty-state message.
 */
import type { ApiResult } from '../../services/api';
import type { AdminKycSubmission } from '../../services/adminApi';
import { useEffect, useRef } from 'react';
import { fmtNum } from '../../components/ui';

export interface AdminFetchError {
  endpoint: string;
  status?: number;
  message: string;
  hint: string;
}

function hintFor(status?: number): string {
  if (status === 403) return "your role/category doesn't include this panel";
  if (status === 401) return 'session expired — sign in again';
  if (status === 404) return 'endpoint missing on this backend build';
  if (status && status >= 500) return 'backend error — the panel may be broken, not empty';
  return 'request failed';
}

/**
 * Inspect ApiResult batches from a panel's load() and return one error
 * entry per failed call. Pass endpoint names alongside the results so
 * admins (and bug reports) can see *which* section is broken.
 *
 *   const errs = collectErrors([
 *     ['pending KYC', listPendingKycRes],
 *     ['AML reviews', listPendingAmlRes],
 *   ]);
 */
export function collectErrors(entries: Array<[string, ApiResult<unknown> | null | undefined]>): AdminFetchError[] {
  const out: AdminFetchError[] = [];
  for (const [endpoint, r] of entries) {
    if (!r) {
      out.push({ endpoint, message: 'no response', hint: 'request never completed', status: undefined });
      continue;
    }
    if (!r.ok) {
      out.push({ endpoint, status: r.code, message: r.error || `HTTP ${r.code ?? '???'}`, hint: hintFor(r.code) });
    }
  }
  return out;
}

export function AdminErrorBanner({ errors }: { errors: AdminFetchError[] }) {
  if (!errors.length) return null;
  return (
    <div
      style={{
        border: '1px solid rgba(255,122,112,0.45)',
        background: 'rgba(255,122,112,0.08)',
        borderRadius: 12,
        padding: '10px 14px',
        margin: '0 0 14px',
        color: 'var(--danger, #FF7A70)',
        fontSize: 13,
      }}
    >
      <b>Some sections couldn't be loaded:</b>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {errors.map((e, i) => (
          <li key={i}>
            <span className="mono">{e.endpoint}</span> — {e.status ? `HTTP ${e.status} ` : ''}
            ({e.hint}){e.message && e.status !== 403 ? `: ${e.message}` : ''}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 6, color: 'var(--txt-3, #999)' }}>
        When a section shows an error above, its list below may look empty even though data exists.
      </div>
    </div>
  );
}

/** Explain an AML trigger amount that the client supplied (often 0/missing). */
export function amlAmountLabel(triggerAmountKes: number | undefined | null): string {
  const n = Number(triggerAmountKes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 'amount unverified';
  return `${n.toLocaleString()} KES`;
}

/**
 * Safety net for PII fields: values written to the DB before server-side
 * decryption existed can still arrive as raw AES-GCM ciphertext
 * ("v1:<iv>:<ciphertext>"). Never render that to an admin — show a masked
 * legacy marker instead. Plain (already-decrypted) values pass through.
 */
export function displayPii(value: string | undefined | null): string {
  if (!value) return '—';
  if (/^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value)) return 'legacy-encrypted ••••';
  return value;
}

/**
 * What actually ran behind a KYC submission's risk level
 * (backend/src/services/amlProvider.js).
 *
 * A reviewer deciding on "risk: high" has to be able to tell a sanctions hit
 * apart from "no vendor is configured, so nobody looked": the first is
 * evidence about the applicant, the second is evidence about our setup. The
 * backend records the difference (`amlChecks.screened` + `amlChecks.provider`),
 * and this is where the KYC window says it out loud. A record with no
 * `amlChecks` at all — written before provenance existed — reads as
 * unscreened, which is the honest meaning of unknown provenance.
 */
const AML_PROVIDER_LABELS: Record<string, string> = {
  none: 'no AML vendor is configured',
  // Records written before provenance existed carry provider 'mock', which was
  // this repo's name for "no vendor is configured" — labelled as such rather
  // than rendered as if a vendor called "mock" had screened them.
  mock: 'no AML vendor is configured (record predates provenance tracking)',
  safeguard: 'production safeguard — no AML vendor is configured',
  unavailable: 'the AML vendor could not be reached',
  chainalysis: 'screened by Chainalysis',
  trm: 'screened by TRM Labs',
  complyadvantage: 'screened by ComplyAdvantage',
  http: 'screened by the configured AML endpoint',
  '[erased]': 'screening record erased by request',
};
const AML_HIT_LABELS: Record<string, string> = {
  sanctions: 'sanctions',
  pep: 'PEP',
  adverseMedia: 'adverse media',
  watchlist: 'watchlist',
};

export function amlProvenance(kyc: AdminKycSubmission): { text: string; title: string; unscreened: boolean } {
  const checks = kyc.amlChecks || {};
  const provider = checks.provider || 'none';
  const label = AML_PROVIDER_LABELS[provider] || `screened by ${provider}`;

  if (checks.screened) {
    const hits = Object.entries(AML_HIT_LABELS).filter(([flag]) => Boolean(checks[flag as keyof typeof checks]));
    return {
      text: hits.length ? `${label} — ${hits.map(([, name]) => name).join(', ')} matched` : `${label} — no matches`,
      title: 'A sanctions / PEP / adverse-media / watchlist list was consulted for this submission.',
      unscreened: false,
    };
  }

  return {
    text: `AML: ${label}`,
    title: 'Nothing was checked against a sanctions / PEP / adverse-media / watchlist list, so the risk level here means "unvetted — hold for manual review", not "the lists found nothing". Configure AML_PROVIDER_TYPE and AML_PROVIDER_API_KEY to screen submissions.',
    unscreened: true,
  };
}

/**
 * What one approved task of a campaign pays.
 *
 * `rate_per_task` is required in the Campaign schema, but the admin campaign
 * list is raw `.lean()` documents straight from Mongo, so a record written
 * before the field existed arrives with no rate at all. Rendering that as a
 * blank cell — or worse, as the friendly-looking `0` that
 * `Number(undefined) || 0` produced in the approve route — hid the fact that
 * approving against it pays nothing. Say it out loud instead; the approve
 * route now refuses such a campaign rather than settling it for 0 MLPTS.
 */
export function campaignRateLabel(rate: number | undefined | null): string {
  const n = Number(rate ?? NaN);
  if (!Number.isFinite(n)) return 'no rate set — approving pays nothing';
  return `${fmtNum(n)} MLPTS`;
}

export function campaignRateIsSet(rate: number | undefined | null): boolean {
  return Number.isFinite(Number(rate ?? NaN));
}

/**
 * Escrow left on a campaign. Same reason as above: a missing or negative
 * number is not a balance an admin can spend, and `0` here means "fully paid
 * out", so it gets the word rather than a bare digit.
 */
export function campaignBudgetLabel(budget: number | undefined | null): string {
  const n = Number(budget ?? NaN);
  if (!Number.isFinite(n)) return 'no budget recorded';
  if (n <= 0) return '0 — budget exhausted';
  return fmtNum(n);
}

/**
 * Poll an admin panel's loader without trashing what the admin is reading.
 *
 * Every window used to own a bare `setInterval(() => load(), ms)` and each
 * `load()` began with `setLoading(true)`, so a queue that was perfectly on
 * screen flipped to "loading…" for the length of every request, and a panel
 * that failed once on a refresh cleared the rows it had just shown. Three
 * rules fix that:
 *
 * 1. The first run is a load; every later run is a refresh. Loaders take the
 *     boolean so they can leave the spinner off and keep the rows they have
 *     when a refresh fails — the next tick is seconds away, and an empty
 *     table is a worse readout than one a few seconds stale.
 * 2. A tick is skipped while the tab is hidden, and while the previous request
 *     is still in flight, so a slow backend can never stack overlapping
 *     fan-outs against the rate-limit budget.
 * 3. Becoming visible again refreshes immediately, so returning to the tab
 *     does not mean reading a stale panel for another whole interval.
 *
 * `deps` behaves like a useEffect dependency list: when it changes the panel
 * is showing a different question (a filter, a search), so the next run counts
 * as a load again.
 */
export function useAdminPoller(
  load: (refresh: boolean) => void | Promise<void>,
  ms: number,
  deps: readonly unknown[] = [],
  opts: { skipInitial?: boolean } = {},
): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  const skipInitialRef = useRef(opts.skipInitial);
  skipInitialRef.current = !!opts.skipInitial;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async (refresh: boolean) => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        await loadRef.current(refresh);
      } finally {
        inFlight = false;
      }
    };

    const hidden = () =>
      typeof document !== 'undefined' && document.visibilityState !== 'visible';

    // Panels that fetch on their own for the first paint (because the spinner
    // is theirs to control) pass skipInitial, so the mount does not pay for
    // the same read twice.
    if (!skipInitialRef.current) void run(false);
    timer = setInterval(() => {
      if (hidden()) return;
      void run(true);
    }, ms);

    const onVisible = () => {
      if (!cancelled && !hidden()) void run(true);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
