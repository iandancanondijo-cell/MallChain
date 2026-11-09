/**
 * MLCNS market price series — GET /api/market/price
 * (backend/src/controllers/marketController.js's getMarketPrice).
 *
 * Read this before trusting the numbers: the backend keeps its price history
 * in a process-local array, sampled from chain REST every 15s. It survives
 * restarts no better than RAM, so `history` only reaches back as far as the
 * current process has been running and `aggregates['7d']` is `null` until a
 * sample older than that window exists. Callers must treat null as "no trend
 * recorded yet", never as "price was flat".
 */
import { api } from './api';

export interface PriceSample {
  ts: number;
  mid: number;
}

export interface PriceAggregate {
  pct: number;
  latest: number;
  past: number;
}

export interface MarketPriceResponse {
  market_price?: {
    buy_price?: number;
    sell_price?: number;
    mid?: number;
    last_update_height?: number | string | null;
  };
  history?: PriceSample[];
  aggregates?: Record<string, PriceAggregate | null>;
}

export async function fetchMarketPrice(): Promise<MarketPriceResponse | null> {
  const res = await api.get<MarketPriceResponse>('/api/market/price');
  return res.ok ? res.data ?? null : null;
}
