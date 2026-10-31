/**
 * Single live price source for the whole wallet/economy UI.
 *
 * Every Mallchain token is priced in KES on-chain (the x/mlcoin market module
 * is the authority; the backend's economy/state bundles it). Before this hook,
 * individual components each fetched the price from a different endpoint and
 * fell back to their own hardcoded numbers (0.62 / 0.58 / 3.2), so the same
 * coin showed a different rate on different screens. This hook polls the one
 * canonical endpoint on a fixed interval so the platform tracks live rate
 * changes and every screen agrees.
 */
import { useEffect, useState } from 'react';
import { economyApi } from '../services/economyApi';

const POLL_MS = 30 * 1000;

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
}

const IDLE: LivePrice = {
  buyKes: null,
  sellKes: null,
  midKes: null,
  pointPriceKes: null,
  conversionRate: null,
  loading: true,
  error: false,
};

export function useLivePrice(): LivePrice {
  const [price, setPrice] = useState<LivePrice>(IDLE);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await economyApi.getState();
      if (cancelled) return;
      if (res.ok && res.data) {
        const d = res.data;
        setPrice({
          buyKes: d.market?.buyPriceKes ?? null,
          sellKes: d.market?.sellPriceKes ?? null,
          midKes: d.market?.midPriceKes ?? d.mlcnsPriceKes ?? null,
          pointPriceKes: d.pointPriceKes ?? null,
          conversionRate: d.conversion?.rate ?? null,
          loading: false,
          error: false,
        });
      } else {
        setPrice((prev) => ({ ...prev, loading: false, error: true }));
      }
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return price;
}
