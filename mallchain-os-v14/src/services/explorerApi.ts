/**
 * Explorer API Service
 * Fetches blockchain data from backend explorer endpoints
 * Phase 7: Blockchain integration
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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

/**
 * Get latest block information
 */
export async function getLatestBlock(): Promise<BlockData> {
  try {
    const response = await fetch(`${API_BASE}/api/explorer/latest`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    console.error('Failed to fetch latest block:', error);
    throw error;
  }
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

/**
 * Get block by height
 */
export async function getBlock(height: number): Promise<BlockData> {
  try {
    const response = await fetch(`${API_BASE}/api/explorer/block/${height}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Same nested-envelope mismatch as getTransaction() below: the backend
    // returns {success, block: {...}, source}, not a flat BlockData — every
    // field (hash, timestamp, numTxs, proposer) rendered undefined/"Invalid
    // Date" despite the search reporting success. Block-level gas isn't
    // tracked by this chain's explorer service (only per-tx), so — matching
    // the same convention getLatest() already uses — it's reported as 0
    // rather than left undefined.
    const data: RawBlockEnvelope = await response.json();
    const block = data.block;
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
  } catch (error) {
    console.error(`Failed to fetch block ${height}:`, error);
    throw error;
  }
}

/**
 * Get transaction by hash
 */
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

export async function getTransaction(hash: string): Promise<TransactionData> {
  try {
    const response = await fetch(`${API_BASE}/api/explorer/tx/${hash}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // The backend returns {success, transaction: {txHash, success, ...}, source}
    // — a differently-shaped, nested envelope, not a flat TransactionData. Map
    // it explicitly instead of returning it as-is (which left every field the
    // renderer reads — hash, status, gasUsed — undefined).
    const data: RawTxEnvelope = await response.json();
    const tx = data.transaction;
    return {
      hash: tx.txHash,
      height: Number(tx.height) || 0,
      timestamp: tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : 0,
      status: tx.success ? 'success' : 'failed',
      gasUsed: tx.gasUsed !== undefined ? Number(tx.gasUsed) : undefined,
      gasWanted: tx.gasWanted !== undefined ? Number(tx.gasWanted) : undefined,
      logs: tx.rawLog || '',
    };
  } catch (error) {
    console.error(`Failed to fetch transaction ${hash}:`, error);
    throw error;
  }
}

/**
 * Get blockchain stats
 */
export async function getBlockchainStats(): Promise<BlockStats> {
  try {
    const response = await fetch(`${API_BASE}/api/blockchain/stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    console.error('Failed to fetch blockchain stats:', error);
    throw error;
  }
}

/**
 * Get blockchain health
 */
export async function getBlockchainHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/blockchain/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    console.error('Failed to fetch blockchain health:', error);
    throw error;
  }
}

/**
 * Get recent transactions
 */
export async function getRecentTransactions(limit = 20): Promise<TransactionData[]> {
  try {
    const response = await fetch(
      `${API_BASE}/api/blockchain/transactions?limit=${limit}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // Handle both array and object with transactions property
    return Array.isArray(data) ? data : (data.transactions || []);
  } catch (error) {
    console.error('Failed to fetch recent transactions:', error);
    throw error;
  }
}
