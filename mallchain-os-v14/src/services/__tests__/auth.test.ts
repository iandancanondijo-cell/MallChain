/**
 * Unit tests for Authentication service (auth.ts)
 * Tests token storage, retrieval, expiration, and lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService, type JwtPayload } from '../auth';
import { store, OS_KEY } from '../../store/store';

describe('AuthService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('token storage', () => {
    it('should store token in localStorage', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ZjdhZGE4ZDdlOWQ4MDAwMTZhMWFiYzEiLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZXhwIjozMDAwMDAwMDAwfQ.lkmAkQR-YkpVCqXd8Y_DFhXr0VVMYbR5m8vGw6AUeLU';
      authService.storeToken(token);
      
      expect(localStorage.getItem('token')).toBe(token);
    });

    it('should throw error when storing empty token', () => {
      expect(() => {
        authService.storeToken('');
      }).toThrow();
    });

    it('should retrieve stored token', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ZjdhZGE4ZDdlOWQ4MDAwMTZhMWFiYzEiLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZXhwIjozMDAwMDAwMDAwfQ.lkmAkQR-YkpVCqXd8Y_DFhXr0VVMYbR5m8vGw6AUeLU';
      authService.storeToken(token);
      
      expect(authService.getToken()).toBe(token);
    });

    it('should return null when no token stored', () => {
      expect(authService.getToken()).toBeNull();
    });

    it('should clear token from localStorage', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ZjdhZGE4ZDdlOWQ4MDAwMTZhMWFiYzEiLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZXhwIjozMDAwMDAwMDAwfQ.lkmAkQR-YkpVCqXd8Y_DFhXr0VVMYbR5m8vGw6AUeLU';
      authService.storeToken(token);
      authService.clearToken();
      
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('authentication status', () => {
    it('should be unauthenticated when no token stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should be authenticated with valid unexpired token', () => {
      // Token with expiration 1 hour in the future
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: futureExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should be unauthenticated with expired token', () => {
      // Token with expiration 1 hour in the past
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: pastExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.isAuthenticated()).toBe(false);
      // Expired token should be cleared
      expect(authService.getToken()).toBeNull();
    });

    it('should be unauthenticated with malformed token', () => {
      authService.storeToken('invalid.token.format');
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('token expiration', () => {
    it('should calculate time until expiration', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: futureExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      const expiresIn = authService.getTokenExpiresIn();
      expect(expiresIn).not.toBeNull();
      expect(typeof expiresIn).toBe('number');
      if (expiresIn !== null) {
        // Should be approximately 3600 seconds (allowing small time drift)
        expect(expiresIn).toBeGreaterThan(3590);
        expect(expiresIn).toBeLessThanOrEqual(3600);
      }
    });

    it('should return null for expiration when no token', () => {
      expect(authService.getTokenExpiresIn()).toBeNull();
    });

    it('should return null for expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: pastExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.getTokenExpiresIn()).toBeNull();
    });

    it('should detect token expiring soon', () => {
      // Token expiring in 60 seconds
      const soonExp = Math.floor(Date.now() / 1000) + 60;
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: soonExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.isTokenExpiringSoon(300)).toBe(true);
    });

    it('should not flag token expiring soon if plenty of time', () => {
      // Token expiring in 1 hour
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: futureExp,
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.isTokenExpiringSoon(300)).toBe(false);
    });

    it('should treat missing token as expiring soon', () => {
      expect(authService.isTokenExpiringSoon()).toBe(true);
    });
  });

  describe('localStorage error handling', () => {
    // Note: happy-dom's localStorage is Proxy-backed — plain assignment like
    // `localStorage.setItem = fn` silently no-ops (the Proxy trap ignores it),
    // and Storage.prototype.* is also not what real calls resolve through.
    // vi.spyOn is the only thing that reliably intercepts calls here.
    it('should handle localStorage unavailable gracefully', () => {
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('localStorage is full');
      });

      expect(() => {
        authService.storeToken('test-token');
      }).toThrow();

      spy.mockRestore();
    });

    it('should handle localStorage getItem error gracefully', () => {
      const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      const token = authService.getToken();
      expect(token).toBeNull();

      spy.mockRestore();
    });

    it('should handle localStorage removeItem error gracefully', () => {
      const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      // Should not throw
      authService.clearToken();

      spy.mockRestore();
    });
  });

  describe('logout', () => {
    afterEach(() => {
      store.reset();
    });

    it('clears the token', () => {
      authService.storeToken(createMockToken({ userId: '1', username: 'x', exp: Math.floor(Date.now() / 1000) + 3600 }));
      authService.logout();
      expect(authService.getToken()).toBeNull();
    });

    it('fully resets the store, not just the auth flag', () => {
      store.state.balances.MALL = 500;
      store.state.user.authed = true;

      authService.logout();

      expect(store.state.user.authed).toBe(false);
      expect(store.state.balances.MALL).toBe(0);
    });

    it('navigates via the provided navigate function when given', () => {
      const navigate = vi.fn();
      authService.logout(navigate);
      expect(navigate).toHaveBeenCalledWith('/landing');
    });

    it('falls back to setting the hash directly when no navigate is provided', () => {
      window.location.hash = '#/wallet';
      authService.logout();
      expect(window.location.hash).toBe('#/landing');
    });

    it('removes OS_KEY from localStorage', () => {
      store.commit();
      expect(localStorage.getItem(OS_KEY)).not.toBeNull();
      authService.logout();
      // reset() removes then immediately re-persists an empty state, so the
      // key exists again — but its contents must be the fresh empty state.
      const persisted = JSON.parse(localStorage.getItem(OS_KEY)!);
      expect(persisted.user.authed).toBe(false);
      expect(persisted.balances.MALL).toBe(0);
    });
  });

  describe('token payload parsing', () => {
    it('should correctly parse valid JWT token', () => {
      const payload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };
      const token = createMockToken(payload);
      authService.storeToken(token);
      
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should reject token with invalid format', () => {
      authService.storeToken('not.a.jwt');
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should reject token with missing exp claim', () => {
      const invalidPayload = {
        userId: '5f7ada8d7e9d800016a1abc1',
        username: 'testuser',
      };
      // Create token without exp (will fail when parsed)
      const token = createMockToken(invalidPayload as any);
      authService.storeToken(token);
      
      // Should fail because exp is missing/undefined
      const expiresIn = authService.getTokenExpiresIn();
      expect(expiresIn).toBeNull();
    });
  });
});

/**
 * Helper function to create a mock JWT token with given payload
 * Note: This creates a token-like string; signature is not validated in these tests
 */
function createMockToken(payload: JwtPayload | Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  return `${header}.${payloadStr}.${signature}`;
}
