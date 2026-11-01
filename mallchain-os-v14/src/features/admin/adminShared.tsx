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
