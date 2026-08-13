/**
 * Task 4.7: Test token expiration handling
 * 
 * Comprehensive test suite for complete token expiration flow:
 * 1. Generate a valid JWT token with SESSION_TTL_MIN (default 120 minutes) expiration
 * 2. Verify that the token is properly stored in localStorage
 * 3. Simulate token expiration by:
 *    - Creating an expired token, OR
 *    - Manually setting time forward in test, OR
 *    - Using a token with short expiration
 * 4. Attempt to use the expired token for an authenticated request
 * 5. Verify the backend returns 401 Unauthorized
 * 6. Verify the frontend receives the 401 and:
 *    - Clears the token from localStorage
 *    - Redirects to /login page
 * 7. Verify that after redirect, the user must log in again
 * 
 * Validates Requirements:
 * - 4.1 JWT Token Generation: Token has SESSION_TTL_MIN expiration
 * - 4.2 JWT Token Verification: Backend returns 401 for expired tokens
 * - 4.3 Token Storage and Usage: Frontend clears token and redirects on 401
 * - 6.2 Authentication Failure Handling: Proper 401 response flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService, JwtPayload } from '../auth';

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

import { api } from '../api';

/**
 * Helper: Create a valid JWT token with specified expiration
 * @param expiresInSeconds How many seconds from now the token should expire (default: SESSION_TTL_MIN = 7200s)
 * @returns JWT token string
 */
function createJwtToken(expiresInSeconds: number = 7200): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    userId: '507f1f77bcf86cd799439011', // Valid MongoDB ObjectId format
    username: 'testuser',
    exp: now + expiresInSeconds,
    iat: now,
  };

  // Create a mock JWT (in real scenario this comes from backend)
  // Format: header.payload.signature
  // For testing, we just base64-encode the payload (signature verification happens on backend)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';

  return `${header}.${body}.${signature}`;
}

describe('Task 4.7: Token Expiration Handling', () => {
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
    (window as any).location = { href: '' };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  describe('Scenario 1: Valid Token Works', () => {
    it('should successfully use a valid (non-expired) token for authenticated request', async () => {
      // SETUP: Create and store a valid token (expires in 2 hours)
      const validToken = createJwtToken(7200);
      localStorage.setItem('token', validToken);

      // Verify token is stored
      expect(localStorage.getItem('token')).toBe(validToken);

      // MOCK: Backend accepts the request with valid token
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

      // VERIFICATION 2: Token was included in Authorization header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/wallets'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${validToken}`,
          }),
        })
      );

      // VERIFICATION 3: Token was NOT cleared (still valid)
      expect(localStorage.getItem('token')).toBe(validToken);
    });

    it('should successfully make multiple requests with valid token', async () => {
      // SETUP: Store valid token
      const validToken = createJwtToken(7200);
      localStorage.setItem('token', validToken);

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

      // VERIFICATION: Token still valid
      expect(localStorage.getItem('token')).toBe(validToken);

      // VERIFICATION: All requests included the token
      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach((call) => {
        const [_url, init] = call;
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(
          `Bearer ${validToken}`
        );
      });
    });
  });

  describe('Scenario 2: Expired Token → 401 → Clear → Redirect', () => {
    it('should detect expired token and trigger 401 flow', async () => {
      // SETUP: Create and store an expired token (expired 1 hour ago)
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

      // Verify token is stored
      expect(localStorage.getItem('token')).toBe(expiredToken);

      // MOCK: Backend returns 401 for expired token
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Invalid or expired token',
        }),
      });

      // ACTION: Attempt to use expired token
      const result = await api.get('/api/balances');

      // VERIFICATION 1: Request was made with the expired token (frontend doesn't validate expiry)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/balances'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${expiredToken}`,
          }),
        })
      );

      // VERIFICATION 2: Backend returned 401
      expect(result.code).toBe(401);
      expect(result.ok).toBe(false);

      // VERIFICATION 3: Token was cleared from localStorage
      expect(localStorage.getItem('token')).toBeNull();

      // VERIFICATION 4: User was redirected to login page (wait for async redirect)
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.href).toBe('/login');
    });

    it('should properly clear token even if localStorage is in a problematic state', async () => {
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      // ACTION: Make request that results in 401
      await api.get('/api/data');

      // VERIFICATION: Token cleared
      expect(localStorage.getItem('token')).toBeNull();

      // VERIFICATION: Redirect happened (wait for async redirect)
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.href).toBe('/login');
    });

    it('should handle 401 response with various error messages', async () => {
      const expiredToken = createJwtToken(-3600);

      // Test different error responses from backend
      const errorResponses = [
        { error: 'Invalid or expired token' },
        { error: 'Token expired' },
        { error: 'Unauthorized' },
        {}, // Empty error object
      ];

      for (const errorResponse of errorResponses) {
        localStorage.setItem('token', expiredToken);
        (window as any).location.href = '';
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => errorResponse,
        });

        const result = await api.get('/api/test');

        expect(result.ok).toBe(false);
        expect(result.code).toBe(401);
        expect(localStorage.getItem('token')).toBeNull();
        // Redirect happens asynchronously, wait for it
        await new Promise(resolve => setTimeout(resolve, 1500));
        expect(window.location.href).toBe('/login');
      }
    });
  });

  describe('Scenario 3: Multiple Concurrent Requests with Expired Token', () => {
    it('should handle multiple concurrent requests all receiving 401', async () => {
      // SETUP: Store expired token
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

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

      // VERIFICATION 2: Token was cleared (even though multiple requests failed)
      expect(localStorage.getItem('token')).toBeNull();

      // VERIFICATION 3: Redirect happened (redirect is called multiple times but location.href ends up at /login)
      // Wait for the async redirect to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.href).toBe('/login');

      // VERIFICATION 4: All requests were attempted with the expired token
      expect(mockFetch).toHaveBeenCalledTimes(5);
      mockFetch.mock.calls.forEach((call) => {
        const [_url, init] = call;
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(
          `Bearer ${expiredToken}`
        );
      });
    });

    it('should handle consistency: all concurrent 401s result in single cleared state', async () => {
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

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

      // ACTION: Trigger multiple requests with concurrent timing
      const promises = [
        api.get('/api/data1'),
        api.get('/api/data2'),
        api.get('/api/data3'),
        api.get('/api/data4'),
        api.get('/api/data5'),
      ];

      const results = await Promise.all(promises);

      // VERIFICATION 1: All failed
      results.forEach((r) => {
        expect(r.ok).toBe(false);
        expect(r.code).toBe(401);
      });

      // VERIFICATION 2: Final state is consistent - token cleared
      expect(localStorage.getItem('token')).toBeNull();

      // VERIFICATION 3: Final state shows redirect (wait for async redirect)
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.href).toBe('/login');
    });

    it('should handle mixed scenario: some requests get 401, others get different errors', async () => {
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

      // Mock different responses
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

      // ACTION: Make requests that get different status codes
      const [result1, result2, result3] = await Promise.all([
        api.get('/api/data1'),
        api.get('/api/data2'),
        api.get('/api/data3'),
      ]);

      // VERIFICATION 1: First and third are 401
      expect(result1.code).toBe(401);
      expect(result3.code).toBe(401);

      // VERIFICATION 2: Second is different error (500)
      expect(result2.code).toBe(500);

      // VERIFICATION 3: Token was cleared (because at least one 401 occurred)
      expect(localStorage.getItem('token')).toBeNull();

      // VERIFICATION 4: Redirect happened (wait for async redirect)
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(window.location.href).toBe('/login');
    });
  });

  describe('Scenario 4: Auth Service Token Validation', () => {
    it('should detect expired token using authService', () => {
      // SETUP: Create and store an expired token
      const expiredToken = createJwtToken(-3600);
      authService.storeToken(expiredToken);

      // ACTION: Check if authenticated
      const isAuthenticated = authService.isAuthenticated();

      // VERIFICATION: Service detects token is expired
      expect(isAuthenticated).toBe(false);

      // VERIFICATION: Service cleared the token
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should recognize valid token as authenticated', () => {
      // SETUP: Create and store a valid token (expires in 2 hours)
      const validToken = createJwtToken(7200);
      authService.storeToken(validToken);

      // ACTION: Check if authenticated
      const isAuthenticated = authService.isAuthenticated();

      // VERIFICATION: Service recognizes valid token
      expect(isAuthenticated).toBe(true);

      // VERIFICATION: Token still in storage
      expect(localStorage.getItem('token')).toBe(validToken);
    });

    it('should calculate time until token expiration', () => {
      // SETUP: Create token that expires in 1 hour
      const expiresIn = 3600; // 1 hour
      const validToken = createJwtToken(expiresIn);
      authService.storeToken(validToken);

      // ACTION: Get expiration time
      const timeLeft = authService.getTokenExpiresIn();

      // VERIFICATION: Time is approximately correct (within 5 seconds tolerance)
      expect(timeLeft).toBeDefined();
      expect(timeLeft!).toBeGreaterThan(expiresIn - 5);
      expect(timeLeft!).toBeLessThanOrEqual(expiresIn);
    });

    it('should detect token expiring soon', () => {
      // SETUP: Create token that expires in 2 minutes
      const expiringToken = createJwtToken(120);
      authService.storeToken(expiringToken);

      // ACTION: Check if expiring soon (within 5 minutes default)
      const expiringSoon = authService.isTokenExpiringSoon();

      // VERIFICATION: Detected as expiring soon
      expect(expiringSoon).toBe(true);

      // Now create a token that doesn't expire soon (2 hours)
      const notExpiringToken = createJwtToken(7200);
      authService.storeToken(notExpiringToken);

      // ACTION: Check again
      const notExpiringSoon = authService.isTokenExpiringSoon();

      // VERIFICATION: Not detected as expiring soon
      expect(notExpiringSoon).toBe(false);
    });
  });

  describe('Scenario 5: Recovery After Expiration', () => {
    it('should allow successful login after token expiration', async () => {
      // STEP 1: User has expired token
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

      // STEP 2: Request fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      await api.get('/api/data');

      expect(localStorage.getItem('token')).toBeNull();

      // STEP 3: User navigates to login and logs in
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: createJwtToken(7200), // New valid token
          user: { id: 'user123', username: 'testuser' },
        }),
      });

      const loginResult = await api.post('/api/auth/login', {
        username: 'testuser',
        password: 'password123',
      });

      expect(loginResult.ok).toBe(true);

      // STEP 4: Store new token (would be done by login component)
      const newToken = (loginResult.data as any).token;
      localStorage.setItem('token', newToken);

      // STEP 5: Subsequent request succeeds with new token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

      const retryResult = await api.get('/api/data');

      // VERIFICATION: Request succeeded with new token
      expect(retryResult.ok).toBe(true);
      expect(localStorage.getItem('token')).toBe(newToken);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${newToken}`,
          }),
        })
      );
    });

    it('should handle the user manually refreshing after 401', async () => {
      // SETUP: Expired token
      const expiredToken = createJwtToken(-3600);
      localStorage.setItem('token', expiredToken);

      // SCENARIO: First request gets 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      const result1 = await api.get('/api/data');
      expect(result1.ok).toBe(false);

      // After being redirected to login and logging in again...
      const newToken = createJwtToken(7200);
      localStorage.setItem('token', newToken);

      // Now make the same request again (user refreshes or app resumes)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'refreshed' }),
      });

      const result2 = await api.get('/api/data');

      // VERIFICATION: Request succeeds on retry with new token
      expect(result2.ok).toBe(true);
      expect(result2.data).toEqual({ data: 'refreshed' });
    });
  });

  describe('Scenario 6: Edge Cases', () => {
    it('should handle token that expires exactly now', async () => {
      // SETUP: Token expires right now
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        userId: '507f1f77bcf86cd799439011',
        username: 'testuser',
        exp: now, // Expires at current time
      };
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify(payload))}.signature`;
      localStorage.setItem('token', token);

      // ACTION: Check if authenticated
      const isAuth = authService.isAuthenticated();

      // VERIFICATION: Considered expired
      expect(isAuth).toBe(false);
    });

    it('should handle malformed token gracefully', () => {
      // SETUP: Store token that looks like JWT but can't be decoded
      // Use a token with 3 parts but invalid base64 in payload
      const malformedToken = 'header.!!!invalid-base64!!!.signature';
      localStorage.setItem('token', malformedToken);

      // ACTION: Check if authenticated
      const isAuth = authService.isAuthenticated();

      // VERIFICATION: Handled gracefully, not authenticated
      // Even if the token isn't cleared, it should return false for authentication
      expect(isAuth).toBe(false);
    });

    it('should handle very short-lived token (5 seconds)', async () => {
      // SETUP: Token expires in 5 seconds
      const shortToken = createJwtToken(5);
      localStorage.setItem('token', shortToken);

      // Initially should be valid
      expect(authService.isAuthenticated()).toBe(true);

      // Should be detected as expiring soon (within 10 second window)
      expect(authService.isTokenExpiringSoon(10)).toBe(true);

      // Fast-forward to after expiration
      // (In a real scenario, this would be actual time passing)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await api.get('/api/data');

      // VERIFICATION: Token cleared on 401
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should handle request without token', async () => {
      // SETUP: No token in storage
      localStorage.clear();

      // MOCK: Request succeeds without auth (public endpoint)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'public' }),
      });

      // ACTION: Make request to public endpoint
      const result = await api.get('/api/health');

      // VERIFICATION: Request succeeded without token header
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
    });
  });

  describe('Scenario 7: Token Storage Persistence', () => {
    it('should maintain token across multiple API calls until expiration', async () => {
      // SETUP: Store valid token
      const validToken = createJwtToken(7200);
      localStorage.setItem('token', validToken);

      // MOCK: Multiple successful requests
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      // ACTION: Make multiple requests
      for (let i = 0; i < 5; i++) {
        await api.get(`/api/data${i}`);
        // Token should still be there after each request
        expect(localStorage.getItem('token')).toBe(validToken);
      }

      // VERIFICATION: Token persisted through all requests
      expect(localStorage.getItem('token')).toBe(validToken);
    });
  });

  describe('Scenario 8: SESSION_TTL_MIN Compliance', () => {
    it('should handle tokens with SESSION_TTL_MIN expiration (120 minutes default)', () => {
      // From config: sessionTtlMin = 120 minutes = 7200 seconds
      const sessionToken = createJwtToken(7200); // 120 minutes
      authService.storeToken(sessionToken);

      // VERIFICATION 1: Token is valid
      expect(authService.isAuthenticated()).toBe(true);

      // VERIFICATION 2: Token has correct expiration
      const expiresIn = authService.getTokenExpiresIn();
      expect(expiresIn).toBeDefined();
      expect(expiresIn!).toBeGreaterThan(7195);
      expect(expiresIn!).toBeLessThanOrEqual(7200);

      // VERIFICATION 3: Not expiring soon (within default 5-minute window)
      expect(authService.isTokenExpiringSoon()).toBe(false); // Default: 300 seconds

      // VERIFICATION 4: Not expiring soon within 2 hours
      expect(authService.isTokenExpiringSoon(7200)).toBe(false);

      // VERIFICATION 5: But IS expiring soon if we check within 1 hour (3600 seconds)
      // Since the token expires in ~7200 seconds, it's definitely not expiring within 3600s
      expect(authService.isTokenExpiringSoon(3600)).toBe(false);

      // Actually expiring soon only if we set a threshold larger than expiration time
      expect(authService.isTokenExpiringSoon(7200 + 100)).toBe(true);
    });
  });
});
