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

/**
 * Fetches and caches a real FX rate for an arbitrary base->quote pair from
 * GET /api/fx/rate; refreshes periodically while mounted. Returns null (never a
 * guess) until the rate has loaded.
 */
export function useRate(base: Currency, quote: Currency): number | null {
  const [rate, setRate] = useState<number | null>(base === quote ? 1 : null);

  useEffect(() => {
    if (base === quote) {
      setRate(1);
      return;
    }
    setRate(null); // don't show a stale rate for the previous pair while the new one loads
    let cancelled = false;
    const fetchRate = async () => {
      const res = await api.get<FxRateResponse>('/api/fx/rate', { base, quote });
      if (!cancelled && res.ok && res.data) setRate(res.data.rate);
    };
    fetchRate();
    const id = window.setInterval(fetchRate, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [base, quote]);

  return rate;
}

/** Convenience USD->currency hook (kept for existing callers). */
export function useFxRate(currency: Currency): number | null {
  return useRate('USD', currency);
}

/** Converts a real USD amount into the display currency using a real fetched rate. Returns null (not a guess) while the rate hasn't loaded yet. */
export function toDisplayCurrency(usdAmount: number, currency: Currency, rate: number | null): number | null {
  if (currency === 'USD') return usdAmount;
  if (rate === null) return null;
  return usdAmount * rate;
}

/** The fiat unit an asset value is denominated in. Mallchain prices every token
 * in KES on-chain (M-Pesa native); USD_M is the only genuinely-USD asset. */
export type FiatUnit = 'KES' | 'USD';

/**
 * Returns a converter that expresses any asset's fiat value in the user's chosen
 * display currency. It fetches exactly the two rates needed (USD->cur and
 * KES->cur) and multiplies by the one matching the value's unit — so a
 * KES-denominated Mallcoin price is never mistaken for USD and wrongly
 * FX-inflated. Returns null while the needed rate is still loading, so callers
 * can show a placeholder instead of a wrong number.
 */
export function useCurrencyConverter(cur: Currency): (amount: number | null, unit: FiatUnit) => number | null {
  const usdToCur = useRate('USD', cur);
  const kesToCur = useRate('KES', cur);
  return (amount: number | null, unit: FiatUnit) => {
    if (amount === null) return null;
    const rate = unit === 'KES' ? kesToCur : usdToCur;
    if (rate === null) return null;
    return amount * rate;
  };
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
