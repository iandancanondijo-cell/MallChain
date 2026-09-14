/**
 * Integration test for 401 authentication flow
 *
 * This test demonstrates the complete flow:
 * 1. User makes an authenticated request (httpOnly session cookie, invisible
 *    to this code — represented here by authService's local session marker)
 * 2. Backend returns 401 (session expired/invalid)
 * 3. Frontend clears the local session marker
 * 4. Frontend redirects to login page
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock modules
vi.mock('./config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
    network: 'testnet',
    sessionTtlMin: 120,
  },
  sim: {
    enabled: false,
  },
}));

vi.mock('../store/store', () => ({
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

import { api } from './api';
import { authService } from './auth';

describe('401 Authentication Flow Integration Test', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    localStorage.clear();

    delete (window as any).location;
    (window as any).location = { href: '', hash: '' };

    // CSRF token fetching goes through authService — stub it so mutating
    // requests in this file don't consume mockFetch's queued responses.
    vi.spyOn(authService, 'getCsrfToken').mockResolvedValue('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should complete full 401 flow: detect -> clear session -> redirect', async () => {
    // SETUP: User has a (soon to be rejected) session
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);
    expect(authService.isAuthenticated()).toBe(true);

    // SCENARIO: User tries to access protected resource
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });

    // ACTION: Make authenticated request
    const result = await api.get('/api/wallets/mall1abc123/balances');

    // VERIFICATION 1: Request carried credentials, not an Authorization header
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/wallets'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      })
    );

    // VERIFICATION 2: Session marker was cleared
    expect(authService.isAuthenticated()).toBe(false);

    // VERIFICATION 3: User was redirected to login
    // handle401Error() delays the redirect by 1s (to let the toast show),
    // so wait for it rather than asserting immediately.
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(window.location.hash).toBe('#/landing');

    // VERIFICATION 4: Error response was returned
    expect(result).toEqual({
      ok: false,
      code: 401,
      error: 'Session expired. Please log in again.',
    });
  });

  it('should handle 401 in transaction flow', async () => {
    // SETUP: User has a session but it's rejected by the time the request lands
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);

    // SCENARIO: User submits transaction but the session is rejected between UI and backend
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Token expired' }),
    });

    // ACTION: Submit transaction
    const tx = {
      type: 'transfer',
      amount: 100,
      asset: 'MALL',
      kind: 'debit' as const,
      note: 'Payment',
    };
    const result = await api.mutate(tx);

    // VERIFICATION: Session cleared and redirect happened
    expect(authService.isAuthenticated()).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(window.location.hash).toBe('#/landing');
    expect(result.ok).toBe(false);
    expect(result.code).toBe(401);
  }, 10000);

  it('should handle 401 on any HTTP method (GET, POST, etc.)', async () => {
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);

    // Test POST request
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await api.post('/api/auth/logout', {});

    expect(authService.isAuthenticated()).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(window.location.hash).toBe('#/landing');

    // Reset for next test
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);
    (window as any).location.hash = '';

    // Test GET request
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await api.get('/api/notifications');

    expect(authService.isAuthenticated()).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(window.location.hash).toBe('#/landing');
  }, 10000);

  it('should allow subsequent login after 401 redirect', async () => {
    // SCENARIO: Complete flow from 401 to re-login

    // Step 1: User gets 401
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await api.get('/api/data');

    expect(authService.isAuthenticated()).toBe(false);

    // Step 2: User logs in again (simulated) — the JWT itself would be set
    // as an httpOnly cookie by this same response; the JSON body only ever
    // carries the non-secret expiresAt hint.
    const newExpiresAt = Math.floor(Date.now() / 1000) + 7200;
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

    // Step 3: Record the new session marker (this would be done by the login component)
    authService.setSession((loginResult.data as any).expiresAt);
    expect(authService.isAuthenticated()).toBe(true);

    // Step 4: Make new authenticated request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ balances: { MALL: 1000 } }),
    });

    const retryResult = await api.get('/api/balances');

    expect(retryResult.ok).toBe(true);
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('should handle race condition: multiple concurrent requests all get 401', async () => {
    // SCENARIO: User has multiple tabs/components making requests, session expires
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);

    // All requests return 401
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    // Make concurrent requests (simulating multiple components)
    const results = await Promise.all([
      api.get('/api/balances'),
      api.get('/api/notifications'),
      api.get('/api/activity'),
    ]);

    // All should handle 401
    results.forEach((result) => {
      expect(result.ok).toBe(false);
      expect(result.code).toBe(401);
    });

    // Session should be cleared (only once, but multiple attempts are safe)
    expect(authService.isAuthenticated()).toBe(false);

    // Redirect happened
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(window.location.hash).toBe('#/landing');
  }, 10000);
});
