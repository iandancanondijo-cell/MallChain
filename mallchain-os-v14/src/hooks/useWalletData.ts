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
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Guards against out-of-order responses: a retry-delayed fetch, a manual
  // retry, and an address-change refetch can all be in flight at once, and
  // an older one resolving last would otherwise overwrite a newer balance
  // (including one just set optimistically by store.applyTx() in a Send/Swap
  // flow) with stale data. Only the most recently issued fetch may commit.
  const fetchSeqRef = useRef(0);

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

    const seq = ++fetchSeqRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await walletApi.getBalance(address);

      if (seq !== fetchSeqRef.current) {
        // A newer fetch was issued while this one was in flight — drop this
        // stale result instead of letting it clobber more recent state.
        return;
      }

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

        // Keep the global store in sync too — TopBar and flows like Send
        // read st.balances directly and would otherwise only ever see a
        // real balance after a socket push (see handleWalletUpdate below).
        store.state.balances = {
          MALL: result.data.MALL || 0,
          MLPTS: result.data.MLPTS || 0,
          USD_M: result.data.USD_M || 0,
          KES: result.data.KES || 0,
          EUR: result.data.EUR || 0,
          GBP: result.data.GBP || 0,
        };
        store.commit();
      } else {
        throw new Error(result.error || 'Failed to fetch balance');
      }
    } catch (error) {
      if (seq !== fetchSeqRef.current) {
        return;
      }

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
   *
   * `wallet:update` is emitted by backend/src/services/walletSync.js when a
   * movement involving this address settles, and once as a primer when the
   * socket joins the wallet's room. Its payload is the on-chain MLCN balance
   * in display units: `{ address, balances: { mlcns, mlcnsAvailable,
   * mlcnsLocked }, timestamp }`.
   *
   * It has never contained `MALL`, `MLPTS`, `USD_M`, `KES`, `EUR` or `GBP`.
   * The mapping here used to read precisely those keys and default each with
   * `|| 0`, so the first live push after a purchase wrote a zeroed balance
   * over the real one REST had just fetched — in this hook's state and in the
   * global store, which is what TopBar, Send and Staking read. The wallet
   * blanked itself at the moment the money moved, while claiming `isRealTime`.
   * `balances: Record<string, number>` in services/socket.ts is why the typo
   * still typechecked; that type now names the three keys the server sends.
   *
   * The rule this implements: a push overwrites only what it carries. MALL is
   * the available figure — the same definition GET /api/wallet/:address uses
   * (`MALL = availableDisplay`, `MALL_LOCKED = lockedDisplay`) — and every
   * other column is preserved from the last fetch. Mallpoints in particular
   * comes from a Mongo account plus a chain points call that no socket payload
   * includes, so zeroing it was never a refresh, only a loss.
   */
  const handleWalletUpdate = useCallback((data: WalletData) => {
    if (data.address !== address) return;

    const available = data.balances?.mlcnsAvailable;
    if (typeof available !== 'number' || !Number.isFinite(available)) {
      // No readable balance in the payload, so nothing changes. Treating an
      // unknown as 0 is the bug this guard exists to prevent; the figures the
      // last fetch produced stay on screen until a push that carries a number.
      return;
    }
    const locked = typeof data.balances.mlcnsLocked === 'number'
      ? data.balances.mlcnsLocked
      : undefined;

    setState((prev) => {
      const was = prev.balance;
      return {
        ...prev,
        balance: {
          address: data.address,
          MALL: available,
          MALL_LOCKED: locked ?? was?.MALL_LOCKED,
          MALL_UNLOCK_TIME: was?.MALL_UNLOCK_TIME,
          MLPTS: was?.MLPTS ?? 0,
          USD_M: was?.USD_M ?? 0,
          KES: was?.KES ?? 0,
          EUR: was?.EUR ?? 0,
          GBP: was?.GBP ?? 0,
          lastUpdated: data.timestamp,
        },
        lastUpdated: data.timestamp,
        isRealTime: true,
      };
    });

    // Same rule for the global store: mutate only the number the push carries
    // and leave the columns that only REST fills in.
    store.state.balances.MALL = available;
    store.commit();
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
