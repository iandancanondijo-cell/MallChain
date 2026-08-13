/**
 * React Hook for transaction data management
 * 
 * Features:
 * - Task 13.5-13.6: Fetch real transactions from API
 * - Task 13.7: Pagination (20 per page)
 * - Task 13.8: Transaction type filtering
 * - Task 13.9: Transaction status filtering
 * - Task 13.11-13.12: Real-time updates via Socket.IO
 * - Task 13.13: Loading states
 * - Task 13.14: Retry logic with exponential backoff
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { walletApi, type TransactionsResponse, type Transaction } from '../services/walletApi';
import { socketManager } from '../services/socket';
import { store } from '../store/store';

export interface UseTransactionDataOptions {
  walletAddress: string | null | undefined;
  page?: number;
  pageSize?: number;
  type?: string; // Filter: send, receive, swap, stake, etc.
  status?: string; // Filter: pending, confirmed, failed
}

export interface UseTransactionDataState {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const DEFAULT_STATE: UseTransactionDataState = {
  transactions: [],
  total: 0,
  page: 1,
  pageSize: 20,
  hasMore: false,
  loading: false,
  error: null,
  lastUpdated: null,
};

/**
 * Hook for fetching and managing transaction data with pagination and filtering
 * 
 * Usage:
 * ```tsx
 * const { transactions, page, pageSize, hasMore, loading, error } = useTransactionData({
 *   walletAddress,
 *   page: currentPage,
 *   pageSize: 20,
 *   type: 'send', // optional
 *   status: 'confirmed', // optional
 * });
 * ```
 */
export function useTransactionData(options: UseTransactionDataOptions) {
  const { walletAddress, page = 1, pageSize = 20, type, status } = options;
  const [state, setState] = useState<UseTransactionDataState>({
    ...DEFAULT_STATE,
    page,
    pageSize,
  });

  const retryCountRef = useRef(0);
  const maxRetriesRef = useRef(3);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Calculate exponential backoff delay
   */
  const getRetryDelay = useCallback((attemptNumber: number): number => {
    return Math.min(1000 * Math.pow(2, attemptNumber), 8000);
  }, []);

  /**
   * Fetch transactions from API with retry logic
   */
  const fetchTransactions = useCallback(
    async (retryCount = 0) => {
      if (!walletAddress) {
        setState(DEFAULT_STATE);
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await walletApi.getTransactions({
          walletAddress,
          page,
          pageSize,
          type,
          status,
        });

        if (result.ok && result.data) {
          setState({
            transactions: result.data.transactions,
            total: result.data.total,
            page: result.data.page,
            pageSize: result.data.pageSize,
            hasMore: result.data.hasMore,
            loading: false,
            error: null,
            lastUpdated: Date.now(),
          });

          // Update store with transactions
          store.state.txs = result.data.transactions;
          store.commit();

          retryCountRef.current = 0;
        } else {
          throw new Error(result.error || 'Failed to fetch transactions');
        }
      } catch (error) {
        const errorMsg = (error as Error).message || 'Unknown error';

        if (retryCount < maxRetriesRef.current) {
          const delay = getRetryDelay(retryCount);
          console.warn(
            `[useTransactionData] Retrying in ${delay}ms (attempt ${retryCount + 1})`
          );

          retryTimeoutRef.current = setTimeout(() => {
            fetchTransactions(retryCount + 1);
          }, delay);
        } else {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to load transactions: ${errorMsg}`,
          }));
        }
      }
    },
    [walletAddress, page, pageSize, type, status, getRetryDelay]
  );

  /**
   * Handle real-time transaction updates from Socket.IO
   * Task 13.11-13.12: Auto-update on new tx events
   */
  const handleTransactionUpdate = useCallback((data: any) => {
    // If it's for this wallet, reload the list
    if (data.address === walletAddress && page === 1) {
      fetchTransactions(0);
    }
  }, [walletAddress, page, fetchTransactions]);

  // Initial fetch and setup Socket.IO listeners
  useEffect(() => {
    fetchTransactions(0);

    // Listen for transaction updates
    const unsubscribeTxPending = socketManager.on('tx:pending', handleTransactionUpdate);
    const unsubscribeTxConfirmed = socketManager.on('tx:confirmed', handleTransactionUpdate);

    // Cleanup
    return () => {
      unsubscribeTxPending?.();
      unsubscribeTxConfirmed?.();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [walletAddress, page, pageSize, type, status, fetchTransactions, handleTransactionUpdate]);

  return state;
}
