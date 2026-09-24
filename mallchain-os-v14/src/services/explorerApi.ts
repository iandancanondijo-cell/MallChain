/**
 * Explorer API Service
 * Fetches blockchain data from backend explorer endpoints
 * Phase 7: Blockchain integration
 *
 * Consistency: Uses the shared `api` service (api.ts) for every call so all
 * explorer requests benefit from the same JWT auth, 401 interceptor,
 * network-error toast, request deduplication, and uniform error shape that
 * the rest of the app relies on. Raw fetch() is intentionally not used here.
 */

import { api } from './api';

export interface BlockData {
  height: number;
  hash: string;
  time: string;
  timestamp: number;
  numTxs: number;
  proposer: string;
  gasUsed: number;
  gasWanted: number;
}

export interface TransactionData {
  hash: string;
  height: number;
  /** Not every tx source reports gas (the mlcoin transfer feed doesn't) — render "—" when absent, don't assume 0. */
  gasUsed?: number;
  gasWanted?: number;
  status: 'success' | 'failed';
  timestamp: number;
  logs: string;
  /** Only present on the recent-transactions list (GET /api/blockchain/transactions, the real mlcoin transfer feed) — a single-tx lookup by hash doesn't carry these. */
  from?: string;
  to?: string;
  amount?: string;
  memo?: string;
  txType?: string;
}

export interface BlockStats {
  height: number;
  time: string;
  numTxs: number;
  /** Real cumulative indexed-tx count; null when genuinely unavailable (not a fabricated fallback). */
  totalTxs: number | null;
  /** Real measured interval over the last several blocks; null if there aren't enough blocks yet to sample. */
  averageBlockTime: number | null;
  lastBlockHeight: number;
  chainId: string;
  nodeVersion: string;
}

interface RawBlockEnvelope {
  block: {
    height: number;
    hash: string | null;
    chainId: string;
    blockTime: { iso: string | null; unix: number | null };
    proposer: string;
    txCount: number;
  };
}

interface RawTxEnvelope {
  transaction: {
    txHash: string;
    height: number;
    time: string;
    success: boolean;
    gasUsed?: string | number;
    gasWanted?: string | number;
    rawLog?: string;
  };
}

/**
 * Get latest block information
 */
export async function getLatestBlock(): Promise<BlockData> {
  const res = await api.get<BlockData>('/api/explorer/latest');
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch latest block');
  return res.data;
}

/**
 * Get block by height
 */
export async function getBlock(height: number): Promise<BlockData> {
  const res = await api.get<RawBlockEnvelope>(`/api/explorer/block/${height}`);
  if (!res.ok || !res.data) throw new Error(res.error || `Failed to fetch block ${height}`);
  // Backend returns {success, block: {...}, source}, not a flat BlockData.
  // Block-level gas isn't tracked by this chain's explorer service (only per-tx),
  // so it's reported as 0 rather than left undefined.
  const block = res.data.block;
  return {
    height: Number(block.height) || 0,
    hash: block.hash || '',
    time: block.blockTime?.iso || '',
    timestamp: block.blockTime?.unix || 0,
    numTxs: block.txCount || 0,
    proposer: block.proposer || '',
    gasUsed: 0,
    gasWanted: 0,
  };
}

/**
 * Get transaction by hash
 */
export async function getTransaction(hash: string): Promise<TransactionData> {
  const res = await api.get<RawTxEnvelope>(`/api/explorer/tx/${hash}`);
  if (!res.ok || !res.data) throw new Error(res.error || `Failed to fetch transaction ${hash}`);
  const tx = res.data.transaction;
  return {
    hash: tx.txHash,
    height: Number(tx.height) || 0,
    timestamp: tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : 0,
    status: tx.success ? 'success' : 'failed',
    gasUsed: tx.gasUsed !== undefined ? Number(tx.gasUsed) : undefined,
    gasWanted: tx.gasWanted !== undefined ? Number(tx.gasWanted) : undefined,
    logs: tx.rawLog || '',
  };
}

/**
 * Get recent blocks list
 */
export async function getRecentBlocks(limit = 20): Promise<BlockData[]> {
  const res = await api.get<{ blocks: BlockData[] }>('/api/explorer/blocks', { limit });
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch recent blocks');
  return res.data.blocks || [];
}

/**
 * Get blockchain stats
 */
export async function getBlockchainStats(): Promise<BlockStats> {
  const res = await api.get<BlockStats>('/api/blockchain/stats');
  if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch blockchain stats');
  return res.data;
}

/**
 * Get blockchain health
 */
export async function getBlockchainHealth(): Promise<unknown> {
  const res = await api.get('/api/blockchain/health');
  if (!res.ok) throw new Error(res.error || 'Failed to fetch blockchain health');
  return res.data;
}

/**
 * Get recent transactions
 */
export async function getRecentTransactions(limit = 20): Promise<TransactionData[]> {
  const res = await api.get<TransactionData[] | { transactions: TransactionData[] }>('/api/blockchain/transactions', { limit });
  if (!res.ok) throw new Error(res.error || 'Failed to fetch recent transactions');
  const data = res.data;
  // Handle both array and object with transactions property
  return Array.isArray(data) ? data : (data?.transactions || []);
}
