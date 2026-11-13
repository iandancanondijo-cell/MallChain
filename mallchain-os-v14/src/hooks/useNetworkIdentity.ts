import { useEffect, useState } from 'react';
import {
  getNetworkSnapshot,
  nameForChainId,
  networkLabel,
  refreshNetworkIdentity,
  subscribeNetworkIdentity,
  type NetworkSnapshot,
} from '../services/networkIdentity';

export type { NetworkSnapshot };
export { nameForChainId, networkLabel };

/**
 * The shared network snapshot. services/networkIdentity.ts owns the polling,
 * so a second surface that shows the network costs no extra request — that is
 * the whole reason this exists rather than each component calling
 * /api/blockchain/health on its own interval.
 */
export function useNetworkSnapshot(): NetworkSnapshot {
  // Seeded from the shared module state, so the very first render already has
  // a snapshot object (never `null`) and a caller can read fields unguarded.
  const [snap, setSnap] = useState<NetworkSnapshot>(getNetworkSnapshot);
  useEffect(() => subscribeNetworkIdentity(setSnap), []);
  return snap;
}

/** Dashboard-facing view: the snapshot plus its long-form name and refresh. */
export function useNetworkIdentity(): NetworkSnapshot & {
  networkName: string;
  reload: () => Promise<void>;
} {
  const snap = useNetworkSnapshot();
  return {
    ...snap,
    // The server's name when /api/network has answered; the documented local
    // fallback only while it has not. See services/networkIdentity.ts.
    networkName: snap.networkName
      ?? (snap.chainId ? nameForChainId(snap.chainId) : snap.loading ? 'Checking network…' : 'Network unreachable'),
    reload: refreshNetworkIdentity,
  };
}
