/**
 * React Hook for wallet data management
 * 
 * Features:
 * - Task 13.1: Fetch real wallet balance from API
 * - Task 13.2: Real-time balance updates via Socket.IO
 * - Task 13.3-13.4: Remove demo data, display real balances
 * - Task 13.13: Loading skeleton states
 * - Task 13.14: Retry logic with exponential backoff
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { walletApi, type WalletBalance } from '../services/walletApi';
import { socketManager } from '../services/socket';
import { type WalletData } from '../services/socket';
import { store } from '../store/store';

export interface UseWalletDataState {
  balance: WalletBalance | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  isRealTime: boolean; // Is this real data from API?
  retry?: () => void; // Manual retry function
}

const DEFAULT_STATE: UseWalletDataState = {
  balance: null,
  loading: false,
  error: null,
  lastUpdated: null,
  isRealTime: false,
};

/**
 * Hook for fetching and managing wallet balance data
 * 
 * Usage:
 * ```tsx
 * const { balance, loading, error } = useWalletData(walletAddress);
 * 
 * if (loading) return <Skeleton />;
 * if (error) return <ErrorMessage message={error} />;
 * 
 * return <BalanceDisplay balance={balance} />;
 * ```
 */
export function useWalletData(address: string | null | undefined) {
  const [state, setState] = useState<UseWalletDataState>(DEFAULT_STATE);
  const retryCountRef = useRef(0);
  const maxRetriesRef = useRef(3);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Calculate exponential backoff delay
   * 1st retry: 1s, 2nd retry: 2s, 3rd retry: 4s
   */
  const getRetryDelay = useCallback((attemptNumber: number): number => {
    return Math.min(1000 * Math.pow(2, attemptNumber), 8000);
  }, []);

  /**
   * Fetch balance from API with retry logic
   */
  const fetchBalance = useCallback(async (retryCount = 0) => {
    if (!address) {
      setState(DEFAULT_STATE);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await walletApi.getBalance(address);

      if (result.ok && result.data) {
        setState({
          balance: result.data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
          isRealTime: true,
          retry: () => fetchBalance(0), // Allow manual retry
        });
        retryCountRef.current = 0; // Reset retry counter on success
      } else {
        throw new Error(result.error || 'Failed to fetch balance');
      }
    } catch (error) {
      const errorMsg = (error as Error).message || 'Unknown error';

      if (retryCount < maxRetriesRef.current) {
        // Schedule retry with exponential backoff
        const delay = getRetryDelay(retryCount);
        console.warn(`[useWalletData] Retrying in ${delay}ms (attempt ${retryCount + 1})`);

        retryTimeoutRef.current = setTimeout(() => {
          fetchBalance(retryCount + 1);
        }, delay);
      } else {
        setState({
          balance: null,
          loading: false,
          error: `Failed to load wallet: ${errorMsg}`,
          lastUpdated: null,
          isRealTime: false,
          retry: () => {
            retryCountRef.current = 0; // Reset retry count for manual retry
            fetchBalance(0);
          },
        });
      }
    }
  }, [address, getRetryDelay]);

  /**
   * Handle real-time balance updates from Socket.IO
   */
  const handleWalletUpdate = useCallback((data: WalletData) => {
    if (data.address === address) {
      const updatedBalance: WalletBalance = {
        address: data.address,
        MALL: data.balances.MALL || 0,
        MLPTS: data.balances.MLPTS || 0,
        USD_M: data.balances.USD_M || 0,
        KES: data.balances.KES,
        EUR: data.balances.EUR,
        GBP: data.balances.GBP,
        lastUpdated: data.timestamp,
      };

      setState((prev) => ({
        ...prev,
        balance: updatedBalance,
        lastUpdated: data.timestamp,
        isRealTime: true,
      }));

      // Update store with real balance
      store.state.balances = {
        MALL: data.balances.MALL || 0,
        MLPTS: data.balances.MLPTS || 0,
        USD_M: data.balances.USD_M || 0,
        KES: data.balances.KES || 0,
        EUR: data.balances.EUR || 0,
        GBP: data.balances.GBP || 0,
      };
      store.commit();
    }
  }, [address]);

  // Initial fetch and setup Socket.IO listeners
  useEffect(() => {
    if (!address) {
      setState(DEFAULT_STATE);
      return;
    }

    // Fetch initial balance
    fetchBalance(0);

    // Subscribe to real-time updates
    if (socketManager.isConnected()) {
      socketManager.subscribeWallet(address);
    }

    // Listen for wallet updates
    const unsubscribe = socketManager.onWalletUpdate(handleWalletUpdate);

    // Cleanup
    return () => {
      unsubscribe?.();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [address, fetchBalance, handleWalletUpdate]);

  return state;
}
