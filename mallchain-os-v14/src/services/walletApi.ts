/**
 * Mallchain Mission Control v14 — Wallet API Service
 * 
 * Handles all wallet-related API calls:
 * - Fetching real wallet balances from /api/wallet/{address}
 * - Fetching transaction history from /api/transactions
 * - Real-time updates via Socket.IO events
 * 
 * Features:
 * - Task 13.1: Fetch real wallet data from /api/wallet/{address}
 * - Task 13.5: Fetch transactions from /api/transactions?walletAddress=...
 * - Error handling with retry logic (Task 13.14)
 * - Loading states for UI (Task 13.13)
 */

import { api } from './api';
import { type ApiResult } from './api';

/**
 * Balance response from /api/wallet/{address}
 */
export interface WalletBalance {
  address: string;
  MALL: number;
  MLPTS: number;
  USD_M: number;
  KES?: number;
  EUR?: number;
  GBP?: number;
  lastUpdated?: number;
}

/**
 * Transaction response from /api/transactions
 */
export interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'swap' | 'stake' | 'unstake' | 'reward' | 'penalty' | 'claim' | 'escrow';
  amount: number;
  asset: string;
  status: 'pending' | 'confirmed' | 'failed';
  to?: string;
  from?: string;
  fee?: number;
  ts: number;
  note?: string;
  hash?: string;
  blockNumber?: number;
}

/**
 * Paginated transactions response
 */
export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Wallet API service
 */
class WalletApi {
  /**
   * Fetch wallet balance from API
   * Maps to: GET /api/wallet/{address}
   * 
   * @param address - Wallet address to fetch balance for
   * @returns Promise resolving to balance or error
   */
  async getBalance(address: string): Promise<ApiResult<WalletBalance>> {
    if (!address) {
      return { ok: false, error: 'Wallet address is required' };
    }

    try {
      const result = await api.get<WalletBalance>(`/api/wallet/${address}`);
      return result;
    } catch (error) {
      console.error(`[WalletApi] Failed to fetch balance for ${address}:`, error);
      return {
        ok: false,
        error: `Failed to fetch wallet balance: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch transactions for a wallet
   * Maps to: GET /api/transactions?walletAddress={address}&page={page}&pageSize={pageSize}&type={type}&status={status}
   * 
   * @param options - Query options
   * @returns Promise resolving to paginated transactions or error
   */
  async getTransactions(options: {
    walletAddress: string;
    page?: number;
    pageSize?: number;
    type?: string; // Filter by transaction type (send, receive, etc.)
    status?: string; // Filter by status (pending, confirmed, failed)
  }): Promise<ApiResult<TransactionsResponse>> {
    const { walletAddress, page = 1, pageSize = 20, type, status } = options;

    if (!walletAddress) {
      return { ok: false, error: 'Wallet address is required' };
    }

    try {
      const params = new URLSearchParams({
        walletAddress,
        page: String(page),
        pageSize: String(pageSize),
        ...(type && { type }),
        ...(status && { status }),
      });

      const result = await api.get<TransactionsResponse>(`/api/transactions?${params.toString()}`);
      return result;
    } catch (error) {
      console.error(
        `[WalletApi] Failed to fetch transactions for ${walletAddress}:`,
        error
      );
      return {
        ok: false,
        error: `Failed to fetch transactions: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch a single transaction detail
   * Maps to: GET /api/transactions/{transactionId}
   * 
   * @param txId - Transaction ID
   * @returns Promise resolving to transaction detail or error
   */
  async getTransactionDetail(txId: string): Promise<ApiResult<Transaction>> {
    if (!txId) {
      return { ok: false, error: 'Transaction ID is required' };
    }

    try {
      const result = await api.get<Transaction>(`/api/transactions/${txId}`);
      return result;
    } catch (error) {
      console.error(`[WalletApi] Failed to fetch transaction ${txId}:`, error);
      return {
        ok: false,
        error: `Failed to fetch transaction: ${(error as Error).message}`,
      };
    }
  }
}

/**
 * Singleton instance
 */
export const walletApi = new WalletApi();
