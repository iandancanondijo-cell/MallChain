/**
 * Integration test for 401 authentication flow
 * 
 * This test demonstrates the complete flow:
 * 1. User makes authenticated request with token
 * 2. Backend returns 401 (token expired/invalid)
 * 3. Frontend clears token from localStorage
 * 4. Frontend redirects to login page
 * 
 * Validates Requirement 4.3: Token Storage and Usage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules
vi.mock('./config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
    demoMode: false,
    network: 'testnet',
    sessionTtlMin: 120,
  },
  sim: {
    enabled: false,
  },
}));

vi.mock('../store/store', () => ({
  store: {
    state: {
      balances: {},
      txs: [],
      notifications: [],
      activity: [],
      mines: { campaigns: [] },
      validators: { rewardsLeaderboard: { validators: [] } },
      explorer: { blocks: [] },
    },
    applyTx: vi.fn(),
  },
}));

import { api } from './api';

describe('401 Authentication Flow Integration Test', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    
    localStorage.clear();
    
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should complete full 401 flow: detect -> clear token -> redirect', async () => {
    // SETUP: User has an expired token
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired';
    localStorage.setItem('token', expiredToken);
    
    // Verify token is stored
    expect(localStorage.getItem('token')).toBe(expiredToken);

    // SCENARIO: User tries to access protected resource
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });

    // ACTION: Make authenticated request
    const result = await api.get('/api/wallets/mall1abc123/balances');

    // VERIFICATION 1: Request included the token
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/wallets'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${expiredToken}`,
        }),
      })
    );

    // VERIFICATION 2: Token was cleared from localStorage
    expect(localStorage.getItem('token')).toBeNull();

    // VERIFICATION 3: User was redirected to login
    expect(window.location.href).toBe('/login');

    // VERIFICATION 4: Error response was returned
    expect(result).toEqual({
      ok: false,
      code: 401,
      error: 'Session expired. Please log in again.',
    });
  });

  it('should handle 401 in transaction flow', async () => {
    // SETUP: User has token but it expires during transaction
    localStorage.setItem('token', 'valid-but-about-to-expire');

    // SCENARIO: User submits transaction but token expires between UI and backend
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

    // VERIFICATION: Token cleared and redirect happened
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
    expect(result.ok).toBe(false);
    expect(result.code).toBe(401);
  });

  it('should handle 401 on any HTTP method (GET, POST, etc.)', async () => {
    localStorage.setItem('token', 'expired');

    // Test POST request
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await api.post('/api/auth/logout', {});
    
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');

    // Reset for next test
    localStorage.setItem('token', 'expired');
    (window as any).location.href = '';

    // Test GET request
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await api.get('/api/notifications');
    
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('should allow subsequent login after 401 redirect', async () => {
    // SCENARIO: Complete flow from 401 to re-login

    // Step 1: User gets 401
    localStorage.setItem('token', 'old-expired-token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await api.get('/api/data');
    
    expect(localStorage.getItem('token')).toBeNull();

    // Step 2: User logs in again (simulated)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'new-fresh-token',
        user: { id: 'user123', username: 'testuser' },
      }),
    });

    const loginResult = await api.post('/api/auth/login', {
      username: 'testuser',
      password: 'password123',
    });

    expect(loginResult.ok).toBe(true);
    
    // Step 3: Store new token (this would be done by login component)
    localStorage.setItem('token', (loginResult.data as any).token);

    // Step 4: Make new authenticated request with fresh token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ balances: { MALL: 1000 } }),
    });

    const retryResult = await api.get('/api/balances');

    expect(retryResult.ok).toBe(true);
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-fresh-token',
        }),
      })
    );
  });

  it('should handle race condition: multiple concurrent requests all get 401', async () => {
    // SCENARIO: User has multiple tabs/components making requests, token expires
    localStorage.setItem('token', 'expired-token');

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

    // Token should be cleared (only once, but multiple attempts are safe)
    expect(localStorage.getItem('token')).toBeNull();
    
    // Redirect happened
    expect(window.location.href).toBe('/login');
  });
});
