/**
 * Public network status — one shared poller for GET /api/blockchain/overview.
 *
 * Two problems this file exists to fix, both learned from a real incident on
 * this very page:
 *
 * 1. The status table used to fetch three endpoints per poll
 *    (/api/blockchain/health, /api/blockchain/stats, /api/explorer/blocks)
 *    through a helper that threw away the HTTP status. When the anonymous
 *    per-IP budget (300 requests / 15 min) ran out, all three answered 429
 *    and the page told visitors the network was "UNREACHABLE" — a false
 *    outage report about a chain that was producing blocks normally. So the
 *    result here is a discriminated union: `rate_limited`, `server_error` and
 *    `unreachable` are three different answers and are rendered as three
 *    different sentences.
 *
 * 2. Every component that wanted the status added its own interval. Like
 *    services/networkIdentity.ts, this module owns a single poll and hands
 *    the same snapshot to every subscriber, so a second surface showing
 *    network status costs zero extra requests.
 *
 * It deliberately does NOT go through services/api.ts: that client attaches
 * cookies/CSRF and raises user-facing toasts on network failure, which is
 * right for an app screen and wrong for an unauthenticated marketing page
 * that must fail soft.
 */
import { config } from './config';

const POLL_MS = 30 * 1000;

export interface OverviewSources {
  chain: { ok: boolean; error: string | null };
  explorer: { ok: boolean; error: string | null };
  price: { ok: boolean; error: string | null };
}

export interface OverviewChain {
  reachable: boolean;
  producing: boolean;
  chainId: string | null;
  moniker: string | null;
  nodeVersion: string | null;
  height: number | null;
  latestBlockTime: string | null;
  averageBlockTime: number | null;
  totalTxs: number | null;
  blockAgeMs: number | null;
  /** The age beyond which `producing` flips false, so the UI can name it. */
  staleThresholdMs?: number;
  error: string | null;
}

export interface OverviewPrice {
  ok: boolean;
  midKes: number | null;
  buyKes: number | null;
  sellKes: number | null;
  pointPriceKes: number | null;
  source: 'onchain' | 'fallback' | 'unavailable';
  error: string | null;
}

export interface NetworkOverview {
  generatedAt: string;
  cachedForMs: number;
  fromCache: boolean;
  sources: OverviewSources;
  chain: OverviewChain;
  explorer: { ok: boolean; recentBlockCount: number; error: string | null };
  price: OverviewPrice;
  restEndpoint?: string;
}

/** What the last poll attempt actually got back. */
export type FeedOutcome =
  | { kind: 'ok'; status: number; overview: NetworkOverview }
  | { kind: 'rate_limited'; status: 429; retryAfterSeconds: number }
  | { kind: 'server_error'; status: number; code: string | null }
  | { kind: 'unreachable'; status: 0 };

export interface NetworkStatusState {
  /** Latest successful overview, kept across a failed poll so the table can
   *  show it as stale rather than blanking out. */
  overview: NetworkOverview | null;
  outcome: FeedOutcome | null;
  loading: boolean;
  lastAttemptAt: number | null;
  /** Seconds left on the current rate-limit cool-down, ticked down live. */
  retryAfterSeconds: number | null;
}

const IDLE: NetworkStatusState = {
  overview: null,
  outcome: null,
  loading: true,
  lastAttemptAt: null,
  retryAfterSeconds: null,
};

function base(): string {
  return config.apiBaseUrl.replace(/\/$/, '');
}

/**
 * Fetch the overview once and classify the transport outcome. Never throws,
 * never toasts.
 */
export async function fetchNetworkOverview(): Promise<FeedOutcome> {
  let res: Response;
  try {
    res = await fetch(`${base()}/api/blockchain/overview`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    // fetch itself rejected: DNS failure, connection refused, offline browser.
    // This is the only case that genuinely means "could not reach the API".
    return { kind: 'unreachable', status: 0 };
  }

  if (res.status === 429) {
    const header = Number(res.headers.get('Retry-After'));
    return {
      kind: 'rate_limited',
      status: 429,
      // express-rate-limit sends Retry-After as whole seconds. If the header
      // is missing (a proxy stripped it) fall back to the documented window
      // rather than claiming the cool-down is already over.
      retryAfterSeconds: Number.isFinite(header) && header > 0 ? header : 60,
    };
  }

  if (!res.ok) {
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: { code?: string } | string };
      const err = body?.error;
      code = typeof err === 'string' ? err : err?.code ?? null;
    } catch {
      code = null;
    }
    return { kind: 'server_error', status: res.status, code };
  }

  try {
    const overview = (await res.json()) as NetworkOverview;
    if (!overview || typeof overview !== 'object' || !overview.chain) {
      return { kind: 'server_error', status: res.status, code: 'malformed_overview' };
    }
    return { kind: 'ok', status: res.status, overview };
  } catch {
    return { kind: 'server_error', status: res.status, code: 'invalid_json' };
  }
}

let state: NetworkStatusState = IDLE;
let pollTimer: number | null = null;
let tickTimer: number | null = null;
let inFlight: Promise<FeedOutcome> | null = null;
let coolDownUntilMs = 0;
const listeners = new Set<(s: NetworkStatusState) => void>();

function publish(): void {
  for (const fn of listeners) fn(state);
}

async function pollOnce(): Promise<void> {
  // Concurrent subscribers join the same request instead of each starting one.
  if (inFlight) { await inFlight; return; }
  inFlight = (async () => {
    const outcome = await fetchNetworkOverview();
    state = {
      ...state,
      loading: false,
      lastAttemptAt: Date.now(),
      outcome,
      // A successful poll clears any cool-down; a 429 starts one.
      retryAfterSeconds: outcome.kind === 'rate_limited' ? outcome.retryAfterSeconds : null,
      overview: outcome.kind === 'ok' ? outcome.overview : state.overview,
    };
    if (outcome.kind === 'rate_limited') coolDownUntilMs = Date.now() + outcome.retryAfterSeconds * 1000;
    else coolDownUntilMs = 0;
    publish();
    return outcome;
  })().finally(() => { inFlight = null; });
  await inFlight;
}

/**
 * Advance the cool-down countdown without polling. Runs on its own 1s timer
 * so the page shows real remaining seconds; it never touches the network, so
 * a visitor watching a rate-limited feed waits it out instead of adding
 * requests to the very bucket that is full.
 */
function tick(): void {
  if (coolDownUntilMs <= 0) return;
  const remaining = Math.ceil((coolDownUntilMs - Date.now()) / 1000);
  if (remaining <= 0) {
    coolDownUntilMs = 0;
    if (state.retryAfterSeconds !== null) {
      state = { ...state, retryAfterSeconds: null };
      publish();
    }
    return;
  }
  if (state.retryAfterSeconds !== remaining) {
    state = { ...state, retryAfterSeconds: remaining };
    publish();
  }
}

export function getNetworkStatus(): NetworkStatusState {
  return state;
}

/** Subscribe to the shared status poll; the first subscriber starts it. */
export function subscribeNetworkStatus(fn: (s: NetworkStatusState) => void): () => void {
  listeners.add(fn);
  fn(state);
  if (pollTimer === null) {
    void pollOnce();
    pollTimer = window.setInterval(() => void pollOnce(), POLL_MS);
    tickTimer = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (pollTimer !== null) { window.clearInterval(pollTimer); pollTimer = null; }
      if (tickTimer !== null) { window.clearInterval(tickTimer); tickTimer = null; }
    }
  };
}

export function refreshNetworkStatus(): Promise<void> {
  return pollOnce();
}

export const NETWORK_STATUS_POLL_MS = POLL_MS;
