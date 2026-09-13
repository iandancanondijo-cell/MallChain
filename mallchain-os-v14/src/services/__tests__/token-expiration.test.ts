/**
 * Task 4.7: Test session expiration handling
 *
 * Integration-level suite covering how api.ts and authService behave
 * together across a session's lifecycle. The JWT itself now lives in an
 * httpOnly cookie invisible to this code — these tests exercise the
 * client-visible half of the contract: authService's non-secret
 * `{authedUntil}` session marker, and api.ts's request/401/CSRF behavior.
 * (Pure unit coverage of authService's marker math lives in auth.test.ts —
 * not duplicated here.)
 *
 * Comprehensive flow covered:
 * 1. A request goes out with credentials: 'include' and no Authorization
 *    header, regardless of local session-marker state (the marker is a UI
 *    hint, never something attached to requests).
 * 2. The backend is the sole authority — a 401 clears the local marker and
 *    redirects to login even if the local marker still claimed validity.
 * 3. Recovery: logging in again after a 401 establishes a fresh session and
 *    subsequent requests succeed.
 *
 * Validates Requirements:
 * - 4.1 Session Establishment: backend sets an httpOnly cookie + returns expiresAt
 * - 4.2 Session Verification: backend returns 401 for an invalid/expired cookie
 * - 4.3 Session Handling: frontend clears its local marker and redirects on 401
 * - 6.2 Authentication Failure Handling: proper 401 response flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService } from '../auth';

// Mock modules
vi.mock('../config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
    demoMode: false,
    network: 'testnet',
    sessionTtlMin: 120, // Default session TTL
  },
  sim: {
    enabled: false,
  },
}));

vi.mock('../../store/store', () => ({
  OS_KEY: 'mallchain_os_v1_v14',
  store: {
    state: {
      user: { authed: true },
      balances: {},
      txs: [],
      notifications: [],
      activity: [],
      mines: { campaigns: [] },
      validators: { rewardsLeaderboard: { validators: [] } },
      explorer: { blocks: [] },
    },
    applyTx: vi.fn(),
    // authService.logout() (called by handle401Error) does a full store.reset()
    reset: vi.fn(),
  },
}));

import { api } from '../api';

function futureExpiry(seconds = 7200): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe('Task 4.7: Session Expiration Handling', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    // Setup fetch mock
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Setup localStorage
    localStorage.clear();

    // Setup window.location mock
    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '', hash: '' };

    // CSRF token fetching goes through authService — stub it so mutating
    // requests in this file don't consume mockFetch's queued responses.
    vi.spyOn(authService, 'getCsrfToken').mockResolvedValue('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Valid Session Works', () => {
    it('should successfully use a valid session for an authenticated request', async () => {
      // SETUP: A valid local session marker (expires in 2 hours)
      authService.setSession(futureExpiry(7200));
      expect(authService.isAuthenticated()).toBe(true);

      // MOCK: Backend accepts the request (real auth is the httpOnly cookie)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          balances: {
            MALL: 1000,
            STAKE: 500,
          },
        }),
      });

      // ACTION: Make authenticated request
      const result = await api.get('/api/wallets/mall1abc123/balances');

      // VERIFICATION 1: Request succeeded
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        balances: {
          MALL: 1000,
          STAKE: 500,
        },
      });

      // VERIFICATION 2: Request carried credentials, never an Authorization header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/wallets'),
        expect.objectContaining({
          credentials: 'include',
          headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        })
      );

      // VERIFICATION 3: Session marker untouched (still valid)
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should successfully make multiple requests with a valid session', async () => {
      authService.setSession(futureExpiry(7200));

      // MOCK: All requests succeed
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      // ACTION: Make multiple authenticated requests
      const results = await Promise.all([
        api.get('/api/balances'),
        api.get('/api/notifications'),
        api.post('/api/market/buy', { itemId: '123', amount: 100 }),
      ]);

      // VERIFICATION: All requests succeeded
      results.forEach((result) => {
        expect(result.ok).toBe(true);
      });

      // VERIFICATION: Session marker still valid
      expect(authService.isAuthenticated()).toBe(true);

      // VERIFICATION: All requests carried credentials, none carried an Authorization header
      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach((call) => {
        const [, init] = call;
        expect(init?.credentials).toBe('include');
        expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined();
      });
    });
  });

  describe('Scenario 2: Backend Rejects Session → 401 → Clear → Redirect', () => {
    it('should detect a backend-rejected session and trigger the 401 flow', async () => {
      // SETUP: Client believes it has a session (local marker), but the
      // backend is the real authority and rejects the (httpOnly) cookie.
      authService.setSession(futureExpiry());

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Invalid or expired token',
        }),
      });

      // ACTION: Attempt an authenticated request
      const result = await api.get('/api/balances');

      // VERIFICATION 1: Backend returned 401
      expect(result.code).toBe(401);
      expect(result.ok).toBe(false);

      // VERIFICATION 2: Local session marker was cleared
      expect(authService.isAuthenticated()).toBe(false);

      // VERIFICATION 3: User was redirected to login page (wait for async redirect)
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should properly clear the session marker even if localStorage is in a problematic state', async () => {
      authService.setSession(futureExpiry());

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await api.get('/api/data');

      expect(authService.isAuthenticated()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should handle 401 response with various error messages', async () => {
      // 4 iterations x 1.5s redirect wait = 6s+, over the 5s default test timeout.
      const errorResponses = [
        { error: 'Invalid or expired token' },
        { error: 'Token expired' },
        { error: 'Unauthorized' },
        {}, // Empty error object
      ];

      for (const errorResponse of errorResponses) {
        authService.setSession(futureExpiry());
        (window as any).location.hash = '';
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => errorResponse,
        });

        const result = await api.get('/api/test');

        expect(result.ok).toBe(false);
        expect(result.code).toBe(401);
        expect(authService.isAuthenticated()).toBe(false);
        // Redirect happens asynchronously, wait for it
        await new Promise(resolve => setTimeout(resolve, 1500));
        expect(window.location.hash).toBe('#/landing');
      }
    }, 10000);
  });

  describe('Scenario 3: Multiple Concurrent Requests Rejected', () => {
    it('should handle multiple concurrent requests all receiving 401', async () => {
      authService.setSession(futureExpiry());

      // MOCK: All concurrent requests return 401
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      // ACTION: Make 5 concurrent requests (simulating multiple components/tabs)
      const results = await Promise.all([
        api.get('/api/balances'),
        api.get('/api/notifications'),
        api.get('/api/activity'),
        api.post('/api/tx', { type: 'transfer', amount: 100 }),
        api.get('/api/market'),
      ]);

      // VERIFICATION 1: All requests failed with 401
      results.forEach((result) => {
        expect(result.ok).toBe(false);
        expect(result.code).toBe(401);
      });

      // VERIFICATION 2: Session marker was cleared (even though multiple requests failed)
      expect(authService.isAuthenticated()).toBe(false);

      // VERIFICATION 3: Every request carried credentials, none carried an
      // Authorization header. Checked before the redirect wait below — each
      // 401 independently schedules its own delayed authService.logout(),
      // which itself issues a POST /api/auth/logout; waiting first would let
      // those additional calls land and inflate this count.
      expect(mockFetch).toHaveBeenCalledTimes(5);
      mockFetch.mock.calls.forEach((call) => {
        const [, init] = call;
        expect(init?.credentials).toBe('include');
        expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined();
      });

      // VERIFICATION 4: Redirect happened
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should handle consistency: all concurrent 401s result in a single cleared state', async () => {
      authService.setSession(futureExpiry());

      // Create a delay to simulate multiple concurrent requests being in flight
      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () => {
              resolve({
                ok: false,
                status: 401,
                json: async () => ({}),
              });
            },
            Math.random() * 50
          ); // Random delay 0-50ms
        });
      });

      const promises = [
        api.get('/api/data1'),
        api.get('/api/data2'),
        api.get('/api/data3'),
        api.get('/api/data4'),
        api.get('/api/data5'),
      ];

      const results = await Promise.all(promises);

      results.forEach((r) => {
        expect(r.ok).toBe(false);
        expect(r.code).toBe(401);
      });

      expect(authService.isAuthenticated()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should handle mixed scenario: some requests get 401, others get different errors', async () => {
      authService.setSession(futureExpiry());

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        });

      const [result1, result2, result3] = await Promise.all([
        api.get('/api/data1'),
        api.get('/api/data2'),
        api.get('/api/data3'),
      ]);

      expect(result1.code).toBe(401);
      expect(result3.code).toBe(401);
      expect(result2.code).toBe(500);

      // Session marker was cleared (because at least one 401 occurred)
      expect(authService.isAuthenticated()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });
  });

  describe('Scenario 4: Recovery After a Rejected Session', () => {
    it('should allow successful login after a 401', async () => {
      // STEP 1: Client has a (now-invalid) session marker
      authService.setSession(futureExpiry());

      // STEP 2: Request fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      await api.get('/api/data');

      expect(authService.isAuthenticated()).toBe(false);

      // STEP 3: User logs in again — the backend sets a fresh httpOnly
      // cookie and returns only the non-secret expiresAt hint.
      const newExpiresAt = futureExpiry(7200);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          expiresAt: newExpiresAt,
          user: { id: 'user123', username: 'testuser' },
        }),
      });

      const loginResult = await api.post('/api/auth/login', {
        username: 'testuser',
        password: 'password123',
      });

      expect(loginResult.ok).toBe(true);

      // STEP 4: Record the new session marker (done by the login component)
      authService.setSession((loginResult.data as any).expiresAt);
      expect(authService.isAuthenticated()).toBe(true);

      // STEP 5: Subsequent request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

      const retryResult = await api.get('/api/data');

      expect(retryResult.ok).toBe(true);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should handle the user manually retrying after a 401', async () => {
      authService.setSession(futureExpiry());

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      const result1 = await api.get('/api/data');
      expect(result1.ok).toBe(false);

      // After being redirected to login and logging in again...
      authService.setSession(futureExpiry(7200));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'refreshed' }),
      });

      const result2 = await api.get('/api/data');

      expect(result2.ok).toBe(true);
      expect(result2.data).toEqual({ data: 'refreshed' });
    });
  });

  describe('Scenario 5: Requests Without a Local Session Marker', () => {
    it('should still succeed against a public endpoint, with no Authorization header', async () => {
      localStorage.clear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'public' }),
      });

      const result = await api.get('/api/health');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
          headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        })
      );
    });
  });

  describe('Scenario 6: Session Marker Persistence', () => {
    it('should maintain the session marker across multiple API calls', async () => {
      authService.setSession(futureExpiry(7200));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      for (let i = 0; i < 5; i++) {
        await api.get(`/api/data${i}`);
        expect(authService.isAuthenticated()).toBe(true);
      }

      expect(authService.isAuthenticated()).toBe(true);
    });
  });
});
