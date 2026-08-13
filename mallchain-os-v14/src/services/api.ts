/**
 * Mallchain Mission Control v14 — API service layer.
 *
 * Contract: api.get(path, params) / api.post(path, body) / api.mutate(tx) all
 * return Promises. When config.apiBaseUrl is set they perform real fetch()
 * calls (JSON in/out); when it is empty they resolve from the local store —
 * the same simulated engine the v14 HTML preview uses.
 *
 * Features:
 * - Task 2.1: Token-based authentication: Automatically adds Authorization: Bearer header when JWT exists in localStorage
 * - Task 2.4: Network vs HTTP error distinction: Network errors return {ok: false, error: ...}, HTTP errors include status code
 * - Task 2.3: 401 interceptor: Clears token and redirects to login on 401 Unauthorized
 * - Task 2.5: Request deduplication: Prevents duplicate concurrent requests to same endpoint
 * - Task 6.1: Network error display with user-friendly messages and console logging
 * - Task 6.2-6.3: Error handling with user notifications (429, network errors, etc.)
 * 
 * Error handling flow:
 * 1. Network error (fetch fails): handleNetworkError() shows toast to user
 * 2. 401 (Unauthorized): handle401Error() clears token, shows message, redirects to login
 * 3. Other HTTP errors (4xx, 5xx): Returns error code and message, caller decides if toast needed
 * 4. Success (2xx): Returns {ok: true, data: parsed JSON response}
 */
import { config, sim } from './config';
import { store, type AppState } from '../store/store';
import { handleNetworkError, handleApiError, handle401Error } from './errorHandler';

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: number;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Task 2.2: Retrieve JWT token from localStorage safely
 * 
 * localStorage might be unavailable in:
 * - Private browsing mode (some browsers block it)
 * - Cross-origin iframes (browser security restriction)
 * - Offline scenarios
 * - Older browsers with storage disabled
 * 
 * Returns null if localStorage is unavailable or token doesn't exist
 * Logs warning if localStorage access fails (helps debugging)
 */
function getToken(): string | null {
  try {
    const token = localStorage.getItem('token');
    return token ? String(token) : null;
  } catch (e) {
    // localStorage access failed (e.g., private browsing, error)
    console.warn('Failed to access localStorage for token:', (e as Error).message);
    return null;
  }
}

class Api {
  /**
   * Task 2.5: Request deduplication cache
   * 
   * Problem: User clicks "Send" button twice → two identical requests sent
   * Solution: Track pending requests by cache key
   * 
   * Maps path+method to pending promise
   * When duplicate request comes in, returns same promise instead of making new request
   * 
   * Example:
   * - User clicks "Get Balance" at t=0ms
   * - GET /api/wallets request starts, stored in pendingRequests
   * - User clicks "Get Balance" again at t=100ms
   * - Cache key matches, returns same promise
   * - When response arrives at t=500ms, both callers get same data
   */
  private pendingRequests = new Map<string, Promise<ApiResult<unknown>>>();

  /**
   * Generate cache key from path and request init (for deduplication)
   * 
   * Format: "METHOD:path"
   * Examples: "GET:/api/wallets", "POST:/api/tx"
   */
  private getCacheKey(path: string, init?: RequestInit): string {
    return `${init?.method || 'GET'}:${path}`;
  }

  /**
   * Task 2.3: Handle 401 Unauthorized by clearing token and redirecting to login
   * Task 2.4: Distinguish network errors from HTTP errors
   * Task 2.5: Check for duplicate requests and prevent concurrent duplicates
   * 
   * Returns Promise that resolves to ApiResult
   * Handles:
   * - Network errors (no connection, DNS failed, etc.)
   * - 401 Unauthorized (token invalid/expired)
   * - Other HTTP errors (4xx, 5xx)
   * - Success responses (2xx)
   */
  private async request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    // Task 2.5: Check if this request is already in flight (deduplication)
    const cacheKey = this.getCacheKey(path, init);
    const pending = this.pendingRequests.get(cacheKey) as Promise<ApiResult<T>> | undefined;
    if (pending) {
      // Return existing promise instead of making duplicate request
      return pending;
    }

    const base = config.apiBaseUrl.replace(/\/$/, '');
    
    // Create the promise and store it before awaiting
    // This ensures the promise is in the map before it resolves
    const promise = this.performRequest<T>(path, base, init);
    this.pendingRequests.set(cacheKey, promise);

    // Remove from cache when done (success or error)
    // This allows new requests after this one completes
    promise.finally(() => {
      this.pendingRequests.delete(cacheKey);
    });

    return promise;
  }

  /**
   * Perform the actual HTTP request with comprehensive error handling
   * 
   * Request flow:
   * 1. Add Authorization header with JWT if available
   * 2. Perform fetch() call
   * 3. Handle network errors (fetch itself fails)
   * 4. Parse response JSON
   * 5. Handle 401 by clearing token and redirecting
   * 6. Handle other HTTP errors (4xx, 5xx)
   * 7. Return success with parsed data
   */
  private async performRequest<T>(path: string, base: string, init?: RequestInit): Promise<ApiResult<T>> {
    try {
      // Task 2.1: Add Authorization header if token exists
      // This header tells backend we're authenticated
      // Format: "Authorization: Bearer eyJhbGc..."
      const token = getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init?.headers ? Object.fromEntries(Object.entries(init.headers)) : {}),
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Perform the fetch request
      // fetch throws if network request fails (connection refused, DNS failed, etc.)
      let res: Response;
      try {
        res = await fetch(base + path, {
          headers,
          ...init,
        });
      } catch (fetchError) {
        // Task 2.4: Network error (fetch failed)
        // Examples: backend unreachable, DNS failed, connection refused, timeout
        // This is different from HTTP errors (which have a Response object)
        
        // Task 6.1: Display user-friendly error and log for debugging
        // Shows toast: "Failed to fetch. Trying: GET request to /api/wallets"
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Failed to fetch';
        
        // Show user-friendly error toast with context
        handleNetworkError(errorMessage, {
          action: `${init?.method || 'GET'} request to ${path}`,
          endpoint: path,
          originalError: fetchError instanceof Error ? fetchError : new Error(String(fetchError)),
        });
        
        return { ok: false, error: errorMessage };
      }

      // Parse response JSON (may be null if not valid JSON)
      // Use .catch(() => null) to handle non-JSON responses gracefully
      const json = (await res.json().catch(() => null)) as T | null;

      // Task 2.3: Handle 401 by clearing token and redirecting
      // 401 means token invalid/expired - user must log in again
      // Clear localStorage token so we don't keep sending invalid token
      // Task 6.1: Use error handler to display message and redirect
      if (res.status === 401) {
        try {
          localStorage.removeItem('token');
        } catch (e) {
          console.warn('Failed to clear token from localStorage:', (e as Error).message);
        }
        
        // Use error handler to display message and redirect
        handle401Error({ 
          action: `accessing ${path}`, 
          endpoint: path,
        }, () => {
          window.location.href = '/login';
        });
        
        return { ok: false, code: 401, error: 'Session expired. Please log in again.' };
      }

      // Task 2.4: HTTP error (status >= 400)
      // Examples: 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Server Error
      // Task 6.1: Display error with context (caller decides if toast needed)
      if (!res.ok) {
        const errorResult = {
          ok: false,
          code: res.status,
          error: (json as { error?: string } | null)?.error || `HTTP ${res.status}`,
          details: (json as { details?: unknown } | null)?.details,
        };
        
        // Log error for debugging (don't show toast for all errors - let caller decide)
        console.warn(`[API Error] ${init?.method || 'GET'} ${path}`, {
          status: res.status,
          error: errorResult.error,
          details: errorResult.details,
        });
        
        return errorResult;
      }

      // Success response (status 2xx)
      // Return data to caller (or undefined if response body was empty)
      return { ok: true, data: json ?? undefined };
    } catch (e) {
      // Unexpected error (should be rare - most errors handled above)
      // Examples: JSON parsing error, unknown exception
      
      // Task 6.1: Log unexpected errors
      console.error('[API Unexpected Error]', { path, error: (e as Error).message });
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * GET request helper
   * 
   * Example: api.get('/api/wallets', { limit: 10 })
   * → GET /api/wallets?limit=10
   * 
   * If config.apiBaseUrl is set: Makes real HTTP request
   * If config.apiBaseUrl is empty: Resolves from local store (demo mode)
   */
  get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<ApiResult<T>> {
    if (config.apiBaseUrl) {
      const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
      return this.request<T>(path + qs);
    }
    // local fallback — resolve from the store (demo mode)
    return delay(sim.enabled ? 120 : 8).then(() => this.localResolve<T>(path, params));
  }

  /**
   * POST request helper
   * 
   * Example: api.post('/api/wallets', { name: 'My Wallet' })
   * → POST /api/wallets with JSON body
   * 
   * If config.apiBaseUrl is set: Makes real HTTP request
   * If config.apiBaseUrl is empty: Resolves from local store (demo mode)
   */
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
    if (config.apiBaseUrl) {
      return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
    }
    return delay(sim.enabled ? 140 : 8).then(() => this.localResolve<T>(path, undefined, body));
  }

  /**
   * Task 2.6: Mutate (transaction) helper
   * 
   * Handles financial transactions (credit/debit operations)
   * Example: api.mutate({ type: 'send', amount: 100, asset: 'mallcoin', kind: 'debit' })
   * 
   * When apiBaseUrl set:
   * - POSTs to /api/tx endpoint on backend
   * - Backend validates, signs, and broadcasts transaction to blockchain
   * 
   * When apiBaseUrl empty (demo mode):
   * - Updates local store (simulated transaction)
   * - Returns mock response
   */
  mutate<T = unknown>(tx: { type: string; amount: number; asset: string; kind: 'credit' | 'debit'; note?: string }): Promise<ApiResult<T>> {
    if (config.apiBaseUrl) {
      // Task 2.6: POST to /api/tx when apiBaseUrl is set
      // Backend endpoint expects transaction data and returns confirmation
      return this.request<T>('/api/tx', { method: 'POST', body: JSON.stringify(tx) });
    }
    
    // Demo mode: apply transaction to local store
    const res = store.applyTx({
      type: tx.type,
      amount: tx.amount,
      asset: tx.asset as keyof AppState['balances'],
      kind: tx.kind,
      note: tx.note,
      notifTitle: `${tx.kind === 'credit' ? '+' : '−'}${tx.amount} ${tx.asset} · ${tx.type}`,
      notifKind: 'tx',
      activityText: `${tx.kind === 'credit' ? 'Received' : 'Sent'} ${tx.amount} ${tx.asset} (${tx.type})`,
    });
    if (!res.ok) return Promise.resolve({ ok: false, error: res.error });
    return Promise.resolve({ ok: true, data: res.tx as unknown as T });
  }

  /**
   * Local store resolver (demo mode)
   * 
   * When backend is not available, resolve requests from local store
   * Allows development/testing without backend running
   * 
   * Maps common API paths to store data:
   * - /api/wallet/{address} → user's token balances (PHASE 1 FIX)
   * - /balances → user's token balances
   * - /txs → transaction history
   * - /notifications → notifications queue
   * - /validators/leaderboard → validator rankings
   * etc.
   */
  private localResolve<T>(path: string, _params?: unknown, _body?: unknown): ApiResult<T> {
    // Local mirror of the backend's key read endpoints.
    const st = store.state;
    
    // PHASE 1 FIX: Handle /api/wallet/{address} endpoint
    // Extracts wallet address from path and returns balance from store
    const walletMatch = path.match(/^\/api\/wallet\/(.+?)(?:\?|$)/);
    if (walletMatch) {
      const walletAddress = walletMatch[1];
      // Return wallet balance from store
      return {
        ok: true,
        data: {
          address: walletAddress,
          MALL: st.balances.MALL,
          MLPTS: st.balances.MLPTS,
          USD_M: st.balances.USD_M,
          KES: st.balances.KES,
          EUR: st.balances.EUR,
          GBP: st.balances.GBP,
          lastUpdated: Date.now(),
        } as unknown as T,
      };
    }
    
    // PHASE 1 FIX: Handle /api/transactions endpoint
    const txMatch = path.match(/^\/api\/transactions/);
    if (txMatch) {
      // Return transactions from store
      return {
        ok: true,
        data: {
          transactions: st.txs,
          total: st.txs.length,
          page: 1,
          pageSize: 20,
          hasMore: false,
        } as unknown as T,
      };
    }
    
    switch (path) {
      case '/balances':
        return { ok: true, data: st.balances as unknown as T };
      case '/txs':
        return { ok: true, data: st.txs as unknown as T };
      case '/notifications':
        return { ok: true, data: st.notifications as unknown as T };
      case '/activity':
        return { ok: true, data: st.activity as unknown as T };
      case '/campaigns':
        return { ok: true, data: st.mines.campaigns as unknown as T };
      case '/validators/leaderboard':
        return { ok: true, data: st.validators.rewardsLeaderboard.validators as unknown as T };
      case '/explorer/blocks':
        return { ok: true, data: st.explorer.blocks as unknown as T };
      default:
        return { ok: true, data: null as unknown as T };
    }
  }
}

export const api = new Api();
