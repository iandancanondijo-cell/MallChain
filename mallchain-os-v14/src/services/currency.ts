/** Real USD-to-any-currency conversion — wraps GET /api/fx/rate (backend/src/routes/fx.js, open.er-api.com, ~166 currencies). */
import { useEffect, useState } from 'react';
import { api } from './api';

/** Any real ISO 4217 code — see services/locale.ts. */
export type Currency = string;

interface FxRateResponse {
  base: string;
  quote: string;
  rate: number;
  date: string | null;
  fetchedAt: number;
}

const REFRESH_MS = 60 * 60 * 1000; // matches the backend's own cache TTL (1hr — the provider itself only updates ~daily)

/** Fetches and caches the real USD->currency rate; refreshes periodically while mounted. */
export function useFxRate(currency: Currency): number | null {
  const [rate, setRate] = useState<number | null>(currency === 'USD' ? 1 : null);

  useEffect(() => {
    if (currency === 'USD') {
      setRate(1);
      return;
    }
    setRate(null); // don't show a stale rate for the previous currency while the new one loads
    let cancelled = false;
    const fetchRate = async () => {
      const res = await api.get<FxRateResponse>('/api/fx/rate', { base: 'USD', quote: currency });
      if (!cancelled && res.ok && res.data) setRate(res.data.rate);
    };
    fetchRate();
    const id = window.setInterval(fetchRate, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currency]);

  return rate;
}

/** Converts a real USD amount into the display currency using a real fetched rate. Returns null (not a guess) while the rate hasn't loaded yet. */
export function toDisplayCurrency(usdAmount: number, currency: Currency, rate: number | null): number | null {
  if (currency === 'USD') return usdAmount;
  if (rate === null) return null;
  return usdAmount * rate;
}

let cachedCurrencyList: string[] | null = null;

/** Every currency code the FX provider actually supports (~166) — for a full "more currencies" picker rather than just the curated shortlist. */
export function useSupportedCurrencies(): string[] {
  const [list, setList] = useState<string[]>(cachedCurrencyList || []);
  useEffect(() => {
    if (cachedCurrencyList) return;
    api.get<{ base: string; currencies: string[] }>('/api/fx/currencies').then((res) => {
      if (res.ok && res.data) {
        cachedCurrencyList = res.data.currencies;
        setList(res.data.currencies);
      }
    });
  }, []);
  return list;
}
