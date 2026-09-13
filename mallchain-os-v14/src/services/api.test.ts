/**
 * Unit tests for API service layer
 * Tests API service with mocked fetch in different scenarios:
 * - Success scenarios (200 OK with data)
 * - Network failure scenarios (fetch throws error)
 * - HTTP error scenarios (404, 500, etc. with proper code)
 * - Request formation (headers, query params, body)
 * - Cookie-based auth: every request carries credentials: 'include', never
 *   an Authorization header (the JWT lives in an httpOnly cookie now)
 * - CSRF token attachment on mutating requests, and retry-once on a
 *   CSRF-rejected 403
 * - Request deduplication
 * - 401 handling (session clearing and redirect)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock modules before importing the api service
vi.mock('./config', () => ({
  config: {
    apiBaseUrl: '',
    network: 'testnet',
    sessionTtlMin: 120,
  },
}));

vi.mock('../store/store', () => ({
  OS_KEY: 'mallchain_os_v1_v14',
  store: {
    state: {
      user: { authed: true },
      balances: { MALL: 1000, USDT: 500 },
      txs: [],
      notifications: [],
      activity: [],
      mines: { campaigns: [] },
      validators: { rewardsLeaderboard: { validators: [] } },
      explorer: { blocks: [] },
    },
    applyTx: vi.fn(() => ({ ok: true, tx: { id: 'tx123', amount: 100 } })),
    // authService.logout() (called by handle401Error) does a full store.reset()
    reset: vi.fn(),
  },
}));

// Import after mocks are set up
import { api } from './api';
import { config } from './config';
import { authService } from './auth';

describe('API Service - Real Backend Mode', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;

    // Create mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set real backend mode
    (config as any).apiBaseUrl = 'http://localhost:4000';

    // Clear localStorage
    localStorage.clear();

    // Reset location mock
    delete (window as any).location;
    (window as any).location = { href: '', hash: '' };

    // CSRF token fetching goes through authService, not the api.ts fetch
    // path under test — stub it directly so it never competes with
    // mockFetch's queued responses for the request actually being tested.
    vi.spyOn(authService, 'getCsrfToken').mockResolvedValue('test-csrf-token');
    vi.spyOn(authService, 'invalidateCsrfToken');
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Success Scenarios', () => {
    it('should return success response with data for GET request', async () => {
      const mockData = { balances: { MALL: 1000 } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await api.get('/api/balances');

      expect(result).toEqual({
        ok: true,
        data: mockData,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/balances',
        expect.objectContaining({
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return success response with data for POST request', async () => {
      const mockResponse = { id: 'user123', username: 'testuser' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const body = { username: 'testuser', password: 'pass123' };
      const result = await api.post('/api/auth/login', body);

      expect(result).toEqual({
        ok: true,
        data: mockResponse,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle null JSON response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error('No content');
        },
      });

      const result = await api.get('/api/health');

      expect(result).toEqual({
        ok: true,
        data: undefined,
      });
    });
  });

  describe('Request Formation', () => {
    it('should construct query string from params object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });

      await api.get('/api/items', { page: 1, limit: 10, sort: 'desc' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/items?page=1&limit=10&sort=desc',
        expect.any(Object)
      );
    });

    it('should handle numeric params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/data', { id: 42, count: 100 });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('id=42');
      expect(callUrl).toContain('count=100');
    });

    it('should include Content-Type header in all requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should stringify POST body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const body = { name: 'test', value: 123, nested: { key: 'val' } };
      await api.post('/api/data', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/data',
        expect.objectContaining({
          body: JSON.stringify(body),
        })
      );
    });
  });

  describe('Cookie Auth', () => {
    it('should send credentials: include on every request, never an Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });

    it('should send credentials: include on mutating requests too', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.post('/api/data', { a: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });

  describe('CSRF Token Handling', () => {
    it('should attach X-CSRF-Token on POST requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.post('/api/data', {});

      expect(authService.getCsrfToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token' }),
        })
      );
    });

    it('should attach X-CSRF-Token on PUT and DELETE requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.put('/api/data/1', { a: 1 });
      await api.del('/api/data/1');

      for (const call of mockFetch.mock.calls) {
        expect(call[1].headers).toEqual(expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token' }));
      }
    });

    it('should NOT attach X-CSRF-Token on GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/data');

      expect(authService.getCsrfToken).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({ 'X-CSRF-Token': expect.any(String) }),
        })
      );
    });

    it('should transparently refresh the CSRF token and retry once on a CSRF-rejected 403', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({ error: 'invalid or missing CSRF token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

      const result = await api.post('/api/data', {});

      expect(result).toEqual({ ok: true, data: { success: true } });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(authService.invalidateCsrfToken).toHaveBeenCalled();
    });

    it('should only retry once on a persistent CSRF-rejected 403', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'invalid or missing CSRF token' }),
      });

      const result = await api.post('/api/data', {});

      expect(result).toEqual({ ok: false, code: 403, error: 'invalid or missing CSRF token' });
      // One original attempt + exactly one retry, not an infinite loop.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry a 403 that is not CSRF-related', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'admin access required' }),
      });

      const result = await api.post('/api/admin/action', {});

      expect(result).toEqual({ ok: false, code: 403, error: 'admin access required' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Network Failure Scenarios', () => {
    it('should return error with message when fetch throws (network failure)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      const result = await api.get('/api/data');

      expect(result).toEqual({
        ok: false,
        error: 'Failed to fetch',
      });
    });

    it('should handle connection refused error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const result = await api.post('/api/tx', { type: 'send' });

      expect(result).toEqual({
        ok: false,
        error: 'connect ECONNREFUSED',
      });
    });

    it('should handle DNS resolution failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

      const result = await api.get('/api/balances');

      expect(result).toEqual({
        ok: false,
        error: 'getaddrinfo ENOTFOUND',
      });
    });

    it('should handle timeout error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

      const result = await api.get('/api/slow');

      expect(result).toEqual({
        ok: false,
        error: 'The operation was aborted',
      });
    });
  });

  describe('HTTP Error Scenarios', () => {
    it('should return error with status code for 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Resource not found' }),
      });

      const result = await api.get('/api/invalid');

      expect(result).toEqual({
        ok: false,
        code: 404,
        error: 'Resource not found',
      });
    });

    it('should return error with status code for 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      const result = await api.post('/api/broken', {});

      expect(result).toEqual({
        ok: false,
        code: 500,
        error: 'Internal server error',
      });
    });

    it('should use default error message when response has no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      const result = await api.get('/api/unavailable');

      expect(result).toEqual({
        ok: false,
        code: 503,
        error: 'HTTP 503',
      });
    });

    it('should handle 400 Bad Request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid request body' }),
      });

      const result = await api.post('/api/validate', { bad: 'data' });

      expect(result).toEqual({
        ok: false,
        code: 400,
        error: 'Invalid request body',
      });
    });

    it('should handle 403 Forbidden', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Access denied' }),
      });

      const result = await api.get('/api/admin');

      expect(result).toEqual({
        ok: false,
        code: 403,
        error: 'Access denied',
      });
    });

    it('should handle 429 Rate Limit Exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded, try again later' }),
      });

      const result = await api.post('/api/tx', {});

      expect(result).toEqual({
        ok: false,
        code: 429,
        error: 'Rate limit exceeded, try again later',
      });
    });
  });

  describe('401 Unauthorized Handling', () => {
    it('should clear the session and redirect to login on 401', async () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid or expired token' }),
      });

      const result = await api.get('/api/protected');

      expect(result).toEqual({
        ok: false,
        code: 401,
        error: 'Session expired. Please log in again.',
      });
      expect(authService.isAuthenticated()).toBe(false);

      // The redirect happens asynchronously in the error handler
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should handle 401 for POST requests', async () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await api.post('/api/data', { test: 'data' });

      expect(authService.isAuthenticated()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.hash).toBe('#/landing');
    });

    it('should handle localStorage removal failure on 401', async () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);

      // Mock removeItem to throw
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = vi.fn(() => {
        throw new Error('Cannot remove item');
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      const result = await api.get('/api/test');

      expect(result.ok).toBe(false);
      expect(result.code).toBe(401);

      // Restore
      Storage.prototype.removeItem = originalRemoveItem;
    });
  });

  describe('Transaction Mutations', () => {
    it('should POST to /api/tx for mutate() in real backend mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'tx123', status: 'pending' }),
      });

      const tx = {
        type: 'transfer',
        amount: 100,
        asset: 'MALL',
        kind: 'debit' as const,
        note: 'Test payment',
      };

      const result = await api.mutate(tx);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: 'tx123', status: 'pending' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/tx',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(tx),
        })
      );
    });

    it('should handle transaction mutation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Insufficient balance' }),
      });

      const tx = {
        type: 'transfer',
        amount: 9999,
        asset: 'MALL',
        kind: 'debit' as const,
      };

      const result = await api.mutate(tx);

      expect(result).toEqual({
        ok: false,
        code: 400,
        error: 'Insufficient balance',
      });
    });
  });

  describe('Request Deduplication', () => {
    it('should deduplicate concurrent identical GET requests', async () => {
      let resolveCount = 0;
      mockFetch.mockImplementation(async () => {
        resolveCount++;
        // Simulate delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: 'test' }),
        };
      });

      // Make 3 concurrent identical requests
      const results = await Promise.all([
        api.get('/api/same'),
        api.get('/api/same'),
        api.get('/api/same'),
      ]);

      // All should succeed
      results.forEach((result) => {
        expect(result.ok).toBe(true);
        expect(result.data).toEqual({ data: 'test' });
      });

      // But fetch should only be called once (deduplication)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT deduplicate requests to different paths', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await Promise.all([
        api.get('/api/path1'),
        api.get('/api/path2'),
        api.get('/api/path3'),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should NOT deduplicate GET and POST to same path', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await Promise.all([
        api.get('/api/resource'),
        api.post('/api/resource', {}),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should allow new request after previous completes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/test');
      await api.get('/api/test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty POST body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await api.post('/api/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      );
    });

    it('should handle apiBaseUrl with trailing slash (should be removed)', async () => {
      // Config should validate and reject trailing slash, but test the normalization
      (config as any).apiBaseUrl = 'http://localhost:4000/';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.get('/api/test');

      // Should not have double slash
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).not.toContain('//api');
    });

    it('should handle non-Error thrown from fetch', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await api.get('/api/test');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid JSON in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await api.get('/api/test');

      expect(result).toEqual({
        ok: false,
        code: 500,
        error: 'HTTP 500',
      });
    });
  });
});
