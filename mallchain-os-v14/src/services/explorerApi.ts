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
  gasUsed: number;
  gasWanted: number;
  status: 'success' | 'failed';
  timestamp: number;
  logs: string;
}

export interface BlockStats {
  height: number;
  time: string;
  numTxs: number;
  totalTxs: number;
  averageBlockTime: number;
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

/**
 * Get block by height
 */
export async function getBlock(height: number): Promise<BlockData> {
  try {
    const response = await fetch(`${API_BASE}/api/explorer/block/${height}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    console.error(`Failed to fetch block ${height}:`, error);
    throw error;
  }
}

/**
 * Get transaction by hash
 */
export async function getTransaction(hash: string): Promise<TransactionData> {
  try {
    const response = await fetch(`${API_BASE}/api/explorer/tx/${hash}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
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
