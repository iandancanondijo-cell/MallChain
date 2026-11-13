/**
 * MLCNS market price series — GET /api/market/price
 * (backend/src/controllers/marketController.js's getMarketPrice), plus
 * GET /api/market/cap.
 *
 * How to trust the numbers, in the order that matters:
 *
 *  - `aggregates[range]` is `null` when the backend cannot reach that far back.
 *    It used to fall back to the oldest sample the running process had, which
 *    made ten minutes of drift look like a weekly trend. A null now means
 *    "not recorded yet", never "flat".
 *  - The backend keeps two tiers: this process's own samples (second-accurate,
 *    lost on restart) and a durable one-per-minute store in Mongo. `window`
 *    and `store` say which tier answered and how far it reaches, so a chart can
 *    label itself with the range it really drew.
 *  - Ask for a range explicitly with `?window=` (`7d`, `24h`, …) and the
 *    response downsamples the durable store to at most `?points=` rows.
 *  - Nothing here is a constant: prices come from the chain's x/mlcoin market,
 *    the cap from x/mlcoin's emission_state times that same price.
 */
import { api } from './api';

export interface PriceSample {
  ts: number;
  mid: number;
  buy?: number;
  sell?: number;
}

export interface PriceAggregate {
  pct: number;
  latest: number;
  past: number;
  /** When the sample the change was measured from was taken. */
  since: string;
  /** How far that sample actually sits behind now. */
  spanMs: number;
  /** 'process' = this backend's recent in-RAM samples, 'store' = durable history. */
  source: 'process' | 'store';
}

export interface PriceWindow {
  /** The window name that was requested, or null when none was. */
  requested: string | null;
  windowMs: number | null;
  points: number;
  /** Milliseconds each returned row stands for; null for the process tier. */
  groupMs: number | null;
  source: 'store' | 'process';
  /** False when the returned rows do not reach back to the window's start. */
  covered: boolean;
  firstTs: number | null;
  lastTs: number | null;
  /** Only present without an explicit window: how long the series spans. */
  spanMs?: number;
}

export interface PriceStoreCoverage {
  persisted: boolean;
  oldestTs: number | null;
  newestTs: number | null;
  bucketMs: number;
  retentionMs: number;
}

export interface MarketPriceResponse {
  market_price?: {
    buy_price?: number;
    sell_price?: number;
    mid?: number;
    last_update_height?: number | string | null;
  };
  history?: PriceSample[];
  window?: PriceWindow;
  aggregates?: Record<string, PriceAggregate | null>;
  store?: PriceStoreCoverage;
}

/** Ranges `?window=` accepts; mirrors PRICE_WINDOWS_MS in marketController.js. */
export type PriceWindowName =
  | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '3d' | '7d' | '30d';

export async function fetchMarketPrice(
  opts: { window?: PriceWindowName; points?: number } = {}
): Promise<MarketPriceResponse | null> {
  const params = new URLSearchParams();
  if (opts.window) params.set('window', opts.window);
  if (opts.points) params.set('points', String(opts.points));
  const qs = params.toString();
  const res = await api.get<MarketPriceResponse>(`/api/market/price${qs ? `?${qs}` : ''}`);
  return res.ok ? res.data ?? null : null;
}

export interface MarketCapResponse {
  circulatingSupply: number;
  totalSupply: number;
  priceKes: number;
  marketCapKes: number;
  currency: 'KES';
  asOfHeight: number | null;
  asOf: string;
  /** 'genesis' when the supply came from the chain's starting state, not live. */
  supplyFallback: string | null;
  method: string;
}

/**
 * Circulating MLCNS × the on-chain price, both read by the backend in one
 * call. Multiplication happens server-side on purpose: the method is part of
 * the answer, and a client that re-derives it would be a second definition of
 * "market cap" in the product.
 */
export async function fetchMarketCap(): Promise<MarketCapResponse | null> {
  const res = await api.get<MarketCapResponse>('/api/market/cap');
  return res.ok ? res.data ?? null : null;
}
