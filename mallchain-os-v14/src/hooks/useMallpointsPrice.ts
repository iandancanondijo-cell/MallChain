/**
 * React binding for the Mallpoints rate feed.
 *
 * The polling lives in services/mallpointsPrice.ts, which keeps one interval
 * for the whole tab; this file only subscribes. See that file for why the
 * rate-only screens stopped borrowing `pointPriceKes` from the economy-state
 * price poll, and what `pegSource` / a null `pointPriceKes` mean.
 */
import { useEffect, useState } from 'react';
import {
  getMallpointsPeg,
  subscribeMallpointsPrice,
  type MallpointsPeg,
} from '../services/mallpointsPrice';

export type { MallpointsPeg };
export {
  getMallpointsPeg,
  subscribeMallpointsPrice,
  refreshMallpointsPeg,
  MALLPOINTS_PEG_POLL_MS,
} from '../services/mallpointsPrice';

export function useMallpointsPrice(): MallpointsPeg {
  const [peg, setPeg] = useState<MallpointsPeg>(getMallpointsPeg);
  useEffect(() => subscribeMallpointsPrice(setPeg), []);
  return peg;
}
