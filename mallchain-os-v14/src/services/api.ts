/**
 * Mallchain Mission Control v14 — API service layer.
 *
 * Contract: api.get(path, params) / api.post(path, body) / api.mutate(tx) all
 * return Promises and always perform real fetch() calls (JSON in/out) against
 * config.apiBaseUrl.
 *
 * Features:
 * - Session auth: the JWT lives in an httpOnly cookie set by the backend, so
 *   every request goes out with `credentials: 'include'` and no
 *   Authorization header — the browser attaches the cookie automatically.
 * - CSRF protection: mutating requests (POST/PUT/PATCH/DELETE) attach an
 *   `X-CSRF-Token` header, fetched/cached via authService.getCsrfToken() —
 *   required because cookie auth (unlike a manually-attached bearer header)
 *   is forgeable cross-site without it.
 * - Task 2.4: Network vs HTTP error distinction: Network errors return {ok: false, error: ...}, HTTP errors include status code
 * - Task 2.3: 401 interceptor: Clears session and redirects to login on 401 Unauthorized
 * - Task 2.5: Request deduplication: Prevents duplicate concurrent requests to same endpoint
 * - Task 6.1: Network error display with user-friendly messages and console logging
 * - Task 6.2-6.3: Error handling with user notifications (429, network errors, etc.)
 *
 * Error handling flow:
 * 1. Network error (fetch fails): handleNetworkError() shows toast to user
 * 2. 401 (Unauthorized): handle401Error() clears session, shows message, redirects to login
 * 3. 403 with an invalid/missing CSRF token: transparently refreshes the token and retries once
 * 4. Other HTTP errors (4xx, 5xx): Returns error code and message, caller decides if toast needed
 * 5. Success (2xx): Returns {ok: true, data: parsed JSON response}
 */
import { config } from './config';
import { handleNetworkError, handle401Error } from './errorHandler';
import { authService } from './auth';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: number;
  /** Structured extra context on an error response (e.g. rule-specific fields on a 4xx) — see performRequest's errorResult below. */
  details?: unknown;
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
   * 1. Attach X-CSRF-Token for mutating methods; send cookies via credentials: 'include'
   * 2. Perform fetch() call
   * 3. Handle network errors (fetch itself fails)
   * 4. Parse response JSON
   * 5. Handle 401 by clearing session and redirecting
   * 6. Handle a CSRF-rejected 403 by refreshing the token and retrying once
   * 7. Handle other HTTP errors (4xx, 5xx)
   * 8. Return success with parsed data
   */
  private async performRequest<T>(path: string, base: string, init?: RequestInit, isCsrfRetry = false): Promise<ApiResult<T>> {
    try {
      const method = (init?.method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init?.headers ? Object.fromEntries(Object.entries(init.headers)) : {}),
      };

      // Cookie auth is auto-attached by the browser regardless of which
      // site triggered the request — unlike a manually-set Authorization
      // header, that reintroduces CSRF risk, so every mutating request
      // must carry a token the backend can check against its secret
      // cookie (middleware/requireAuth.js's checkCsrf).
      if (MUTATING_METHODS.has(method)) {
        const csrfToken = await authService.getCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      }

      // Perform the fetch request
      // fetch throws if network request fails (connection refused, DNS failed, etc.)
      let res: Response;
      try {
        // `headers` must come AFTER `...init`, not before — the merged
        // `headers` above already folds in whatever `init.headers` had.
        // Spread order the other way round meant that any init object
        // carrying a `headers` key at all — even explicitly `undefined`,
        // which post()'s optional third argument now does on every call
        // that doesn't pass one — clobbered the real, merged headers with
        // `undefined`, stripping Content-Type and CSRF headers from every
        // such request. Caught by the frontend's own test suite the moment
        // it ran, not by anything downstream.
        //
        // credentials: 'include' is what makes the browser send the
        // httpOnly auth_token cookie (and the CSRF secret cookie) at all —
        // without it, cross-origin requests (frontend on :5173, backend on
        // :4000) go out cookie-less regardless of what's stored client-side.
        res = await fetch(base + path, {
          ...init,
          headers,
          credentials: 'include',
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

      // Task 2.3: Handle 401 — handle401Error() clears the token, fully resets
      // the store, and navigates via the app's hash router (see errorHandler.ts).
      if (res.status === 401) {
        handle401Error({
          action: `accessing ${path}`,
          endpoint: path,
        });

        return { ok: false, code: 401, error: 'Session expired. Please log in again.' };
      }

      // A 403 specifically caused by a stale/missing CSRF token (rather than
      // a genuine authorization failure) is transient — the secret cookie
      // backing it can rotate or not have existed yet on the very first
      // mutating request of a session. Refresh the token once and retry
      // before surfacing this as an error to the caller.
      if (res.status === 403 && !isCsrfRetry && MUTATING_METHODS.has(method)) {
        const rawError = (json as { error?: string } | null)?.error;
        if (rawError === 'invalid or missing CSRF token') {
          authService.invalidateCsrfToken();
          return this.performRequest<T>(path, base, init, true);
        }
      }

      // Task 2.4: HTTP error (status >= 400)
      // Examples: 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Server Error
      // Task 6.1: Display error with context (caller decides if toast needed)
      if (!res.ok) {
        // Two real error shapes exist across the backend: a flat string
        // (`{error: "message"}`, most routes) and AppError's nested object
        // (`{error: {code, message, statusCode, ...}}`, errorHandler.js's
        // asyncHandler-wrapped routes — this is what sendController.js's
        // broadcast failures use). Extracting the raw field without
        // checking its type passed the object straight through, which
        // `new Error(...)`/string interpolation downstream coerced to the
        // literal text "[object Object]" instead of the real message —
        // confirmed live on a Send broadcast failure.
        const rawError = (json as { error?: string | { message?: string } } | null)?.error;
        const errorMessage = typeof rawError === 'string' ? rawError : rawError?.message;
        const errorResult = {
          ok: false,
          code: res.status,
          error: errorMessage || `HTTP ${res.status}`,
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
   */
  get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<ApiResult<T>> {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
    return this.request<T>(path + qs);
  }

  /**
   * POST request helper
   *
   * Example: api.post('/api/wallets', { name: 'My Wallet' })
   * → POST /api/wallets with JSON body
   */
  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), headers });
  }

  /** PUT request helper — same contract as post(), for REST endpoints that expect PUT (e.g. admin user/role updates). */
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
  }

  /** DELETE request helper — same contract as post(), for REST endpoints that expect DELETE. */
  del<T = unknown>(path: string): Promise<ApiResult<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * Task 2.6: Mutate (transaction) helper
   *
   * POSTs to /api/tx — backend validates, signs, and broadcasts the
   * transaction to the blockchain.
   * Example: api.mutate({ type: 'send', amount: 100, asset: 'mallcoin', kind: 'debit' })
   */
  mutate<T = unknown>(tx: { type: string; amount: number; asset: string; kind: 'credit' | 'debit'; note?: string }): Promise<ApiResult<T>> {
    return this.request<T>('/api/tx', { method: 'POST', body: JSON.stringify(tx) });
  }
}

export const api = new Api();
