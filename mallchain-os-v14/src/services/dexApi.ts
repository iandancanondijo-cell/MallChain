/**
 * Read-only access to x/dex pools, via the backend's REST-gateway proxy
 * (routes/dex.js -> /marketplace/dex/v1/*). Cosmos REST responses use
 * snake_case JSON keys matching the .proto field names, normalized here
 * into camelCase for the rest of the app.
 */
import { api } from './api';

interface RawCoin {
  denom: string;
  amount: string;
}

interface RawPool {
  id: string;
  token_a_denom: string;
  token_b_denom: string;
  token_a_reserve: RawCoin;
  token_b_reserve: RawCoin;
  total_liquidity: RawCoin;
  fee: string;
  creator: string;
}

export interface DexPool {
  id: number;
  tokenADenom: string;
  tokenBDenom: string;
  tokenAReserve: RawCoin;
  tokenBReserve: RawCoin;
  totalLiquidity: RawCoin;
  fee: string;
  creator: string;
}

function normalizePool(p: RawPool): DexPool {
  return {
    id: Number(p.id),
    tokenADenom: p.token_a_denom,
    tokenBDenom: p.token_b_denom,
    tokenAReserve: p.token_a_reserve,
    tokenBReserve: p.token_b_reserve,
    totalLiquidity: p.total_liquidity,
    fee: p.fee,
    creator: p.creator,
  };
}

export async function listPools(): Promise<DexPool[]> {
  const res = await api.get<{ success: boolean; pools: RawPool[] }>('/api/dex/pools');
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to load pools');
  return (res.data.pools || []).map(normalizePool);
}

export async function getPool(poolId: number): Promise<DexPool> {
  const res = await api.get<{ success: boolean; pool: RawPool }>(`/api/dex/pools/${poolId}`);
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to load pool');
  return normalizePool(res.data.pool);
}

export interface SwapEstimate {
  tokenOut: RawCoin;
  fee: RawCoin;
}

export async function estimateSwap(poolId: number, tokenIn: RawCoin, tokenOutDenom: string): Promise<SwapEstimate> {
  const res = await api.get<{ success: boolean; token_out: RawCoin; fee: RawCoin }>(
    `/api/dex/pools/${poolId}/estimate`,
    { denom: tokenIn.denom, amount: tokenIn.amount, tokenOutDenom }
  );
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to estimate swap');
  return { tokenOut: res.data.token_out, fee: res.data.fee };
}
