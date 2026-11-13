/**
 * The one live price poll for the whole app.
 *
 * useLivePrice used to run `economyApi.getState()` inside its own
 * `useEffect`, which meant every component that rendered a price added its own
 * 30-second interval: the dashboard (hub + wallet + leaderboard) issued three
 * identical requests every 30s, and the anonymous per-IP budget is 300
 * requests per 15 minutes. Same data, same answer, multiplied by however many
 * cards happened to be on screen — and when the budget ran out the 429s
 * surfaced as "price unavailable".
 *
 * So this module owns a single interval (the first subscriber starts it, the
 * last one stops it) and hands the identical snapshot to everyone, the same
 * way services/networkIdentity.ts shares the network label.
 *
 * `estimating` is new and deliberate: /api/economy/state's price comes from
 * mallcoinService.getMarketPrice(), which answers with the configured default
 * and flags the substitution rather than throwing. Before, that fallback
 * printed under the words "read from the on-chain market". Now a fallback
 * price carries `estimating: true` and `midKes: null`, so no surface can claim
 * an unverified rate as live.
 *
 * The websocket is now the primary transport and the interval is the fallback.
 * `services/priceEngine.js` pushes `price:current` to the `price:updates` room
 * whenever the on-chain spread actually moves, so a tab with the socket up gets
 * the new price the moment it exists instead of up to 30s later, and the poll
 * below goes quiet while pushes are arriving (see PUSH_FRESH_MS) rather than
 * spending the anonymous request budget on a number that is already on screen.
 * The poll never stops entirely: /api/economy/state also carries the
 * MLPTS→MLCNS conversion, which the price room does not send, and it is what
 * feeds the display when the socket is down.
 */
import { economyApi } from './economyApi';
import { socketManager, type PriceData } from './socket';

const POLL_MS = 30 * 1000;
/** How recently a socket push must have arrived for the interval to stand down. */
const PUSH_FRESH_MS = POLL_MS * 4;

export interface LivePrice {
  /** MLCNS buy price in KES (what a customer pays via M-Pesa). */
  buyKes: number | null;
  /** MLCNS sell price in KES. Selling is disabled for now, so this is display-only. */
  sellKes: number | null;
  /** Midpoint in KES — the number to show as "the MALL price". */
  midKes: number | null;
  /** MLPTS (Mallpoints) price in KES — pegged, defaults to 2. */
  pointPriceKes: number | null;
  /** Human-readable live MLPTS→MLCNS conversion, e.g. "1 MP ≈ 3.23 MLCNS". */
  conversionRate: string | null;
  loading: boolean;
  error: boolean;
  /**
   * True when the numbers on screen are the deployment's configured defaults
   * standing in for a market feed that did not answer. Values are withheld
   * (`midKes`/`buyKes`/`sellKes` null) whenever this is true; only the pegged
   * MLPTS rate keeps showing, because it is a peg rather than a measurement.
   */
  estimating: boolean;
}

const IDLE: LivePrice = {
  buyKes: null,
  sellKes: null,
  midKes: null,
  pointPriceKes: null,
  conversionRate: null,
  loading: true,
  error: false,
  estimating: false,
};

let snapshot: LivePrice = IDLE;
let timer: number | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(p: LivePrice) => void>();

function publish(): void {
  for (const fn of listeners) fn(snapshot);
}

async function fetchOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await economyApi.getState();
    if (res.ok && res.data) {
      const d = res.data;
      const market = d.market as { buyPriceKes?: number; sellPriceKes?: number; midPriceKes?: number; fallback?: boolean } | undefined;
      // Only the market feed's own flag decides this. `conversion.source`
      // describes the MLPTS→MLCNS oracle, a different feed, and must not
      // make a verified price look unverified.
      const isFallback = market?.fallback === true;
      snapshot = {
        buyKes: isFallback ? null : market?.buyPriceKes ?? null,
        sellKes: isFallback ? null : market?.sellPriceKes ?? null,
        midKes: isFallback ? null : market?.midPriceKes ?? d.mlcnsPriceKes ?? null,
        pointPriceKes: d.pointPriceKes ?? null,
        conversionRate: isFallback ? null : d.conversion?.rate ?? null,
        loading: false,
        error: false,
        estimating: isFallback,
      };
    } else {
      // Keep the last known values so a single failed poll does not blank a
      // price that was verified seconds ago, but mark the feed as errored —
      // callers that gate a financial action on the price check `error`.
      snapshot = { ...snapshot, loading: false, error: true };
    }
    publish();
  })().finally(() => { inFlight = null; });
  return inFlight;
}

let lastPushAt = 0;
let priceRoomBound = false;

/**
 * A `price:current` push becomes the shared snapshot.
 *
 * Only the fields the price room carries are replaced. `conversionRate` comes
 * from /api/economy/state's MLPTS→MLCNS oracle and has no counterpart in the
 * price feed, so a push must not blank it — the same reason the poll keeps
 * running whenever the socket has gone quiet.
 *
 * `source` is the push's own honesty flag and maps onto `estimating` exactly
 * the way the REST path maps `market.fallback`: a configured default is never
 * displayed as a measured price.
 */
function applyPush(p: PriceData): void {
  if (!p || typeof p.midPriceKes !== 'number') return;
  const fallback = p.source === 'configured-default';
  lastPushAt = Date.now();
  snapshot = {
    buyKes: fallback ? null : p.buyPriceKes,
    sellKes: fallback ? null : p.sellPriceKes,
    midKes: fallback ? null : p.midPriceKes,
    pointPriceKes: p.mlptsPriceKes ?? snapshot.pointPriceKes,
    conversionRate: fallback ? null : snapshot.conversionRate,
    loading: false,
    // A push means the socket and the chain read behind it are answering, which
    // supersedes whatever the last poll recorded.
    error: false,
    estimating: fallback,
  };
  publish();
}

/**
 * Join the price room once for the whole tab. The room is never left: the
 * server's own polling gate is per-connection (see priceEngine's shouldPoll),
 * and this module only ever starts running while the app-level socket is up, so
 * unsubscribing on the last unmount would trade a 30s server-side chain read
 * for nothing — the next dashboard mount would re-subscribe anyway.
 */
function bindPriceRoom(): void {
  if (priceRoomBound) return;
  priceRoomBound = true;
  socketManager.onPriceUpdate(applyPush);
  socketManager.subscribePrice();
}

/** The interval's entry point: stand down while the socket is keeping us fresh. */
function fetchUnlessPushed(): Promise<void> {
  if (Date.now() - lastPushAt < PUSH_FRESH_MS) return Promise.resolve();
  return fetchOnce();
}

/** Subscribe to the shared price snapshot; the first subscriber starts the poll. */
export function subscribeLivePrice(fn: (p: LivePrice) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  if (timer === null) {
    bindPriceRoom();
    // The first read is unconditional: it is what brings the conversion rate
    // and the Mallpoints peg, neither of which travels on the price room.
    void fetchOnce();
    timer = window.setInterval(() => void fetchUnlessPushed(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function getLivePrice(): LivePrice {
  return snapshot;
}

/**
 * Force an immediate re-read (a page's "refresh price" affordance, and the
 * way a test drives a second poll without waiting out the interval). It
 * works with or without subscribers, and joins an in-flight poll rather than
 * starting a second request.
 */
export function refreshLivePrice(): Promise<void> {
  return fetchOnce();
}

export const LIVE_PRICE_POLL_MS = POLL_MS;
