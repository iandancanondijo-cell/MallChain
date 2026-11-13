/**
 * The Mallpoints rate — one shared read of GET /api/mallpoints/price.
 *
 * Why this is its own feed rather than a field borrowed from the price poll:
 * `services/livePrice.ts` has to fetch `/api/economy/state` anyway for the
 * MLCNS spread, and that response carries `pointPriceKes`, so every surface
 * that showed a Mallpoints number went through it. Fine on the dashboard,
 * which also shows MLCNS. Not fine for the two screens that show *only* the
 * point rate — the Mallpoints purchase page and the Mines leaderboard — which
 * were paying for the heaviest route in the backend (two chain queries plus
 * the emission schedule and the treasury balances) to read one integer, on an
 * anonymous per-IP budget that the app is already close to spending. This
 * module asks the one question and gets the one answer.
 *
 * Same sharing shape as livePrice and networkIdentity: the first subscriber
 * starts the interval, the last one stops it, and everybody sees the identical
 * snapshot. One request per minute for the whole tab, however many cards ask.
 *
 * Honesty rules, inherited from the endpoint:
 *  - `pointPriceKes` stays null until the server states it. There is no
 *    client-side default of 2 — a page that gates a payment on a rate must not
 *    be able to quote a number nobody configured.
 *  - A failed poll keeps the last values and sets `error`, so a caller gating
 *    a financial action can refuse; it does not blank a rate that was read
 *    seconds ago.
 *  - `pegSource` is surfaced rather than dropped. "KSh 2" from a deployment
 *    that configured it and "KSh 2" from one that never set the variable are
 *    different facts, and a rate card that cannot tell them apart is guessing.
 */
import { mallpointsApi, type MallpointsConversion } from './mallpointsApi';

const POLL_MS = 60 * 1000;

export interface MallpointsPeg {
  /** KES per MLPTS, as the server states it. Null until it does. */
  pointPriceKes: number | null;
  /** 'environment' when the deployment configured it, 'default' when it did not. */
  pegSource: 'environment' | 'default' | null;
  defaultPointPriceKes: number | null;
  /** The settleable MLPTS→MLCNS ratio, or null when the oracle did not answer. */
  conversion: MallpointsConversion | null;
  /** What the server said the ratio is, e.g. "1 MP ≈ 3.23 MLCNS". */
  conversionRate: string | null;
  asOf: string | null;
  loading: boolean;
  error: boolean;
}

const IDLE: MallpointsPeg = {
  pointPriceKes: null,
  pegSource: null,
  defaultPointPriceKes: null,
  conversion: null,
  conversionRate: null,
  asOf: null,
  loading: true,
  error: false,
};

let snapshot: MallpointsPeg = IDLE;
let timer: number | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(p: MallpointsPeg) => void>();

function publish(): void {
  for (const fn of listeners) fn(snapshot);
}

async function fetchOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await mallpointsApi.getPrice();
    if (res.ok && res.data) {
      const d = res.data;
      snapshot = {
        pointPriceKes: d.pointPriceKes ?? null,
        pegSource: d.pegSource ?? null,
        defaultPointPriceKes: d.defaultPointPriceKes ?? null,
        conversion: d.conversion ?? null,
        conversionRate: d.conversion?.human ?? null,
        asOf: d.asOf ?? null,
        loading: false,
        error: false,
      };
    } else {
      snapshot = { ...snapshot, loading: false, error: true };
    }
    publish();
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** Subscribe to the shared rate; the first subscriber starts the poll. */
export function subscribeMallpointsPrice(fn: (p: MallpointsPeg) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  if (timer === null) {
    void fetchOnce();
    timer = window.setInterval(() => void fetchOnce(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function getMallpointsPeg(): MallpointsPeg {
  return snapshot;
}

/**
 * Force an immediate re-read — the way a page refreshes the rate after a
 * deployment changes it, and the way a test drives a second poll without
 * waiting out the interval. Joins an in-flight read instead of starting a
 * second request.
 */
export function refreshMallpointsPeg(): Promise<void> {
  return fetchOnce();
}

export const MALLPOINTS_PEG_POLL_MS = POLL_MS;
