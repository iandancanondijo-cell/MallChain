import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { chain, config } from '../services/config';

const POLL_MS = 60 * 1000;

interface HealthResponse {
  status?: string;
  chainId?: string;
  moniker?: string;
  latestHeight?: string | number;
  latestBlockTime?: string | null;
}

export interface NetworkIdentity {
  /** e.g. "Mallchain Mainnet" — derived from the chain the node actually reports. */
  networkName: string;
  /** The chain's own identifier, straight from node_info. */
  chainId: string | null;
  latestHeight: number | null;
  latestBlockTime: string | null;
  /** True only while /api/blockchain/health answers with a usable chainId. */
  reachable: boolean;
  /** False when the node is on a different chain than this build is pointed at. */
  matchesConfig: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * The chain's `node_info.network` (its chain ID) is the only name that cannot
 * drift from reality, so the dashboard reads it from the node instead of
 * printing a build flag — VITE_NETWORK defaults to 'testnet' when unset, and a
 * forgotten env var must not rename the network the node is actually producing
 * blocks on. Cosmos convention puts the revision number last and reserves `-1`
 * for mainnets; anything these rules don't recognise is displayed verbatim
 * rather than labelled "mainnet" on faith. A build pointed at a different chain
 * than the node reports is surfaced separately by `matchesConfig`.
 */
function nameForChainId(chainId: string): string {
  if (/test|dev|local/i.test(chainId)) return 'Mallchain Testnet';
  if (/^(.*-)?1$/.test(chainId)) return 'Mallchain Mainnet';
  return chainId;
}

export function useNetworkIdentity(): NetworkIdentity {
  const [snap, setSnap] = useState<{ chainId: string | null; height: number | null; blockTime: string | null }>({
    chainId: null,
    height: null,
    blockTime: null,
  });
  const [reachable, setReachable] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await api.get<HealthResponse>('/api/blockchain/health');
    const chainId = res.ok && res.data?.chainId && res.data.chainId !== 'unknown' ? res.data.chainId : null;
    setReachable(Boolean(chainId));
    setSnap({
      chainId,
      height: chainId ? Number(res.data?.latestHeight ?? 0) || null : null,
      blockTime: chainId ? res.data?.latestBlockTime ?? null : null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const id = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  return {
    networkName: snap.chainId ? nameForChainId(snap.chainId) : loading ? 'Checking network…' : 'Network unreachable',
    chainId: snap.chainId,
    latestHeight: snap.height,
    latestBlockTime: snap.blockTime,
    reachable,
    matchesConfig: snap.chainId === null || snap.chainId === chain.chainId,
    loading,
    reload,
  };
}
