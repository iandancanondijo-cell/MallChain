import { useEffect, useState } from 'react';
import {
  getNetworkStatus,
  refreshNetworkStatus,
  subscribeNetworkStatus,
  type NetworkStatusState,
} from '../services/networkStatus';

export type { NetworkStatusState };

/**
 * Shared view of GET /api/blockchain/overview.
 *
 * services/networkStatus.ts owns the single 30s poller, so mounting this in a
 * second component does not add a request — which is the point: anonymous
 * visitors only get 300 API requests per 15 minutes per IP, and everyone
 * behind one carrier gateway shares that budget.
 */
export function useNetworkStatus(): NetworkStatusState & { reload: () => Promise<void> } {
  const [status, setStatus] = useState<NetworkStatusState>(getNetworkStatus);
  useEffect(() => subscribeNetworkStatus(setStatus), []);
  return { ...status, reload: refreshNetworkStatus };
}
