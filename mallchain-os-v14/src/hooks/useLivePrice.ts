/**
 * Single live price source for the whole wallet/economy UI.
 *
 * Every Mallcoin token is priced in KES on-chain (the x/mlcoin market module
 * is the authority; the backend's economy/state bundles it). Before this hook
 * existed, individual components each fetched the price from a different
 * endpoint and fell back to their own hardcoded numbers (0.62 / 0.58 / 3.2),
 * so the same coin showed a different rate on different screens.
 *
 * The polling itself now lives in services/livePrice.ts, which keeps ONE
 * interval for the whole tab and shares its snapshot — this file is only the
 * React binding. See that file for why per-consumer polling was a problem and
 * what `estimating` means.
 */
import { useEffect, useState } from 'react';
import {
  getLivePrice,
  subscribeLivePrice,
  type LivePrice,
} from '../services/livePrice';

export type { LivePrice };
export { getLivePrice, subscribeLivePrice, LIVE_PRICE_POLL_MS } from '../services/livePrice';

export function useLivePrice(): LivePrice {
  const [price, setPrice] = useState<LivePrice>(getLivePrice);
  useEffect(() => subscribeLivePrice(setPrice), []);
  return price;
}
