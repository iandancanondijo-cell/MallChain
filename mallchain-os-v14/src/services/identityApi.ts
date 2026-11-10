import { api } from './api';
import { store } from '../store/store';

/**
 * Wallet address → the display identity of the account that registered it.
 *
 * Transaction records only ever carry addresses (see walletApi's `Transaction`:
 * `from?: string; to?: string`), so a history row cannot show who the other
 * side is without asking. This module is that question, asked once per screen
 * rather than once per row.
 *
 * What it is NOT: a way to look up whether an address belongs to a Mallchain
 * account. backend/src/routes/identity.js answers `null` for an unknown address
 * and for a public-profile-hidden address identically, and this layer keeps
 * that shape — `null` means "the server gave no name for this address", never
 * "this address is invalid".
 */

export interface WalletIdentity {
  displayName: string | null;
  avatarUrl: string | null;
}

/** Settled answers, keyed by the exact address string that was asked for. */
const answered = new Map<string, WalletIdentity | null>();
/** Addresses in flight or queued for the next batch — dedupe, don't re-ask. */
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** The largest batch the server accepts per call (routes/identity.js). */
const MAX_BATCH = 50;

/** `res.json(ok(data))` — the envelope every backend route answers with, and
 *  the layer `api` hands back untouched (it returns the parsed body as `data`). */
interface Envelope<T> {
  ok?: boolean;
  data?: T;
  error?: string;
}

async function flush(): Promise<void> {
  flushTimer = null;
  const batch = [...queued].filter((address) => !answered.has(address));
  queued.clear();
  if (!batch.length) return;
  const ownerAtRequest = cacheOwner;

  // One call per slice; a page wider than the server's cap is rare but must not
  // silently drop the tail of the list.
  for (let i = 0; i < batch.length; i += MAX_BATCH) {
    const slice = batch.slice(i, i + MAX_BATCH);
    const res = await api.post<Envelope<Record<string, unknown>>>(
      '/api/identity/resolve',
      { addresses: slice },
    );
    // Whoever is signed in may have changed while this was in flight; answers
    // gathered for the previous account are dropped rather than kept under it.
    if (cacheOwner !== ownerAtRequest) return;
    const answers = res.ok && res.data && res.data.ok !== false ? res.data.data : undefined;
    if (answers && typeof answers === 'object') {
      for (const address of slice) {
        const value = (answers as Record<string, unknown>)[address];
        // An absent key means the server did not answer for it, which is a
        // transport-level surprise, not a "no identity" — leave it unanswered
        // so the next screen can retry instead of caching a permanent blank.
        if (address in answers) {
          answered.set(address, value === null ? null : normalize(value));
        }
      }
    }
  }
  notify();
}

function normalize(value: unknown): WalletIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const displayName = typeof record.displayName === 'string' && record.displayName.trim()
    ? record.displayName.trim()
    : null;
  const avatarUrl = typeof record.avatarUrl === 'string' && record.avatarUrl.trim()
    ? record.avatarUrl.trim()
    : null;
  if (!displayName && !avatarUrl) return null;
  return { displayName, avatarUrl };
}

/** Whose answers these are. The lookup runs under a session, so the batch in
 *  flight belongs to whoever asked for it. When a different account is signed
 *  in on this browser, its rows start from scratch instead of inheriting the
 *  previous person's view of who owns what. */
let cacheOwner = '';

/** Ask for a set of addresses. Returns immediately; subscribers are notified
 *  when answers land. Cached addresses cost nothing. */
export function requestIdentities(addresses: Array<string | null | undefined>): void {
  // The route is behind auth, so asking while logged out would answer 401 — and
  // api.ts treats a 401 as "session expired": it clears the session and sends
  // the visitor to the login page. A logged-out explorer visitor must not be
  // chased off the page because a row tried to put a face on an address; the
  // rows simply render addresses until someone signs in.
  const userId = store.state.user.authed ? store.state.user.id : '';
  if (!userId) return;
  if (userId !== cacheOwner) {
    clearIdentityCache();
    cacheOwner = userId;
  }

  const wanted = addresses.map((a) => (a || '').trim()).filter((a) => a.length > 0);
  let added = false;
  for (const address of wanted) {
    if (answered.has(address) || queued.has(address)) continue;
    queued.add(address);
    added = true;
  }
  if (added && !flushTimer) {
    // Coalesce every request mounted on the same screen into one call.
    flushTimer = setTimeout(() => void flush(), 0);
  }
}

export function subscribeToIdentities(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The answer for one address: `undefined` = not yet settled, `null` = the
 *  server has no public identity for it. */
export function identityFor(address: string | null | undefined): WalletIdentity | null | undefined {
  return answered.get((address || '').trim());
}

/**
 * Forget every cached answer and drop any batch that has not gone out. Called
 * when the session changes hands, so the next account is never shown a name
 * resolved under the previous one's cookie.
 */
export function clearIdentityCache(): void {
  answered.clear();
  queued.clear();
  cacheOwner = '';
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  notify();
}

export const identityApi = { requestIdentities, subscribeToIdentities, identityFor, clearIdentityCache };
