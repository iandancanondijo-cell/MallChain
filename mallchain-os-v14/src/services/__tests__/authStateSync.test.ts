/**
 * Unit tests for Auth State Synchronization (authStateSync.ts)
 * Tests synchronization between store.user.authed and localStorage token
 * across app initialization, external changes, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authStateSync } from '../authStateSync';
import { store } from '../../store/store';
import { authService } from '../auth';

describe('AuthStateSync', () => {
  beforeEach(() => {
    // Clear localStorage and reset store before each test
    localStorage.clear();
    store.state.user.authed = false;
    authStateSync.cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    store.state.user.authed = false;
    authStateSync.cleanup();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(() => {
        authStateSync.initialize();
      }).not.toThrow();
    });

    it('should not reinitialize if already initialized', () => {
      authStateSync.initialize();
      const firstStatus = authStateSync.getStatus();
      authStateSync.initialize();
      const secondStatus = authStateSync.getStatus();
      
      expect(firstStatus.initialized).toBe(true);
      expect(secondStatus.initialized).toBe(true);
    });

    it('should sync auth state from token on initialization', () => {
      // Store a valid token in localStorage
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = false; // Initially false

      authStateSync.initialize();

      // Auth state should now be synced to true
      expect(store.state.user.authed).toBe(true);
    });

    it('should keep auth state false when no token on initialization', () => {
      // No token in localStorage
      localStorage.clear();
      store.state.user.authed = false;

      authStateSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should clear auth state if token is invalid on initialization', () => {
      // Store an invalid token
      localStorage.setItem('token', 'invalid.token');
      store.state.user.authed = true; // Initially true

      authStateSync.initialize();

      // Auth state should be cleared
      expect(store.state.user.authed).toBe(false);
    });

    it('should clear auth state if token is expired on initialization', () => {
      // Store an expired token
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: pastExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = true; // Initially true

      authStateSync.initialize();

      // Auth state should be cleared
      expect(store.state.user.authed).toBe(false);
      // Expired token should also be cleared from localStorage
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('external storage changes (multi-tab sync)', () => {
    it('should sync when token is added from external source', () => {
      authStateSync.initialize();
      store.state.user.authed = false;

      // Simulate another tab adding a token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      
      // Trigger storage event (simulating another tab)
      const event = new StorageEvent('storage', {
        key: 'token',
        newValue: token,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      // Auth state should be synced
      expect(store.state.user.authed).toBe(true);
    });

    it('should sync when token is removed from external source', () => {
      authStateSync.initialize();
      
      // Setup: add a valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = true;

      // Simulate another tab removing the token
      localStorage.removeItem('token');
      const event = new StorageEvent('storage', {
        key: 'token',
        newValue: null,
        oldValue: token,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      // Auth state should be cleared
      expect(store.state.user.authed).toBe(false);
    });

    it('should ignore storage changes for non-token keys', () => {
      authStateSync.initialize();
      const initialAuthed = store.state.user.authed;

      // Trigger storage event for different key
      const event = new StorageEvent('storage', {
        key: 'some_other_key',
        newValue: 'some-value',
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      // Auth state should not change
      expect(store.state.user.authed).toBe(initialAuthed);
    });

    it('should sync when localStorage is cleared from external source', () => {
      authStateSync.initialize();
      
      // Setup: add a valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = true;

      // Simulate another tab clearing localStorage (key is null)
      localStorage.clear();
      const event = new StorageEvent('storage', {
        key: null, // null means localStorage was cleared
        newValue: null,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      // Auth state should be cleared
      expect(store.state.user.authed).toBe(false);
    });
  });

  describe('periodic sync', () => {
    it('should periodically sync auth state', () => {
      vi.useFakeTimers();
      authStateSync.initialize();
      
      // Add a valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);

      // Advance time past one sync interval
      vi.advanceTimersByTime(3001);

      // Auth state should be synced
      expect(store.state.user.authed).toBe(true);

      vi.useRealTimers();
    });

    it('should detect token expiration through periodic sync', () => {
      vi.useFakeTimers();
      
      // Start with a token expiring in 2 seconds
      const nearFutureExp = Math.floor(Date.now() / 1000) + 2;
      let token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: nearFutureExp,
      });
      localStorage.setItem('token', token);
      authService.storeToken(token);
      store.state.user.authed = true;

      authStateSync.initialize();
      expect(store.state.user.authed).toBe(true);

      // Advance time past token expiration
      vi.advanceTimersByTime(3000);

      // Auth state should be cleared due to expiration
      expect(store.state.user.authed).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      authStateSync.initialize();
      authStateSync.cleanup();

      // Should have removed the storage event listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('should stop periodic sync on cleanup', () => {
      vi.useFakeTimers();
      
      authStateSync.initialize();
      
      // Add a valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      
      // Advance time past the first sync interval to ensure sync happens
      vi.advanceTimersByTime(3001);
      expect(store.state.user.authed).toBe(true);

      // Cleanup
      authStateSync.cleanup();

      // Clear the token
      localStorage.removeItem('token');

      // Advance time past the previous sync interval - sync should NOT happen
      vi.advanceTimersByTime(5000);

      // Auth state should remain true (not synced again) since sync is stopped
      expect(store.state.user.authed).toBe(true);

      // Verify cleanup doesn't throw
      expect(() => authStateSync.cleanup()).not.toThrow();

      vi.useRealTimers();
    });
  });

  describe('status reporting', () => {
    it('should report correct status when uninitialized', () => {
      const status = authStateSync.getStatus();

      expect(status.initialized).toBe(false);
    });

    it('should report correct status when initialized with valid token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      
      authStateSync.initialize();
      const status = authStateSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.tokenValid).toBe(true);
      expect(status.authStateMatches).toBe(true);
    });

    it('should report mismatched state when out of sync', () => {
      authStateSync.initialize();
      
      // Manually set mismatched states
      store.state.user.authed = true;
      localStorage.removeItem('token');

      const status = authStateSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.tokenValid).toBe(false);
      expect(status.authStateMatches).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle localStorage errors gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      authStateSync.initialize();
      
      // Should not throw and auth state should be cleared for safety
      expect(store.state.user.authed).toBe(false);

      getItemSpy.mockRestore();
    });

    it('should handle authService errors gracefully', () => {
      authStateSync.initialize();
      
      // Manually trigger an error scenario by storing malformed token
      localStorage.setItem('token', 'malformed.token.here');

      // Trigger sync (can happen through periodic check)
      const status = authStateSync.getStatus();

      // Should handle gracefully
      expect(status.initialized).toBe(true);
      expect(status.tokenValid).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle login flow: no token → valid token', () => {
      vi.useFakeTimers();
      localStorage.clear();
      store.state.user.authed = false;
      
      authStateSync.initialize();
      expect(store.state.user.authed).toBe(false);

      // Simulate login: add token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      authService.storeToken(token);

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      // Trigger periodic sync
      const status = authStateSync.getStatus();
      expect(status.tokenValid).toBe(true);
      expect(store.state.user.authed).toBe(true);
      
      vi.useRealTimers();
    });

    it('should handle logout flow: valid token → no token', () => {
      vi.useFakeTimers();
      // Setup: logged in with valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = true;

      authStateSync.initialize();
      expect(store.state.user.authed).toBe(true);

      // Simulate logout: clear token
      authService.clearToken();

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      // Trigger sync
      const status = authStateSync.getStatus();
      expect(status.tokenValid).toBe(false);
      expect(store.state.user.authed).toBe(false);
      
      vi.useRealTimers();
    });

    it('should handle 401 response clearing token', () => {
      vi.useFakeTimers();
      // Setup: logged in with valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);
      store.state.user.authed = true;

      authStateSync.initialize();

      // Simulate 401 response clearing token
      authService.clearToken();

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      // Auth state should sync automatically
      const status = authStateSync.getStatus();
      expect(store.state.user.authed).toBe(false);
      
      vi.useRealTimers();
    });

    it('should persist across page refresh', () => {
      // Setup: logged in with valid token
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });
      localStorage.setItem('token', token);

      // Simulate page refresh by creating new store and reinitializing
      store.state.user.authed = false; // Reset as would happen on page load

      // On app startup (as would happen after refresh)
      authStateSync.initialize();

      // Auth state should be restored from localStorage
      expect(store.state.user.authed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty token string', () => {
      localStorage.setItem('token', '');
      authStateSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle token with invalid JWT format', () => {
      localStorage.setItem('token', 'not-a-valid-jwt');
      authStateSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle rapid successive storage events', () => {
      vi.useFakeTimers();
      authStateSync.initialize();

      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        userId: '123',
        username: 'testuser',
        exp: futureExp,
      });

      // Trigger multiple storage events rapidly
      for (let i = 0; i < 5; i++) {
        localStorage.setItem('token', token);
        const event = new StorageEvent('storage', {
          key: 'token',
          newValue: token,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href,
        });
        window.dispatchEvent(event);
      }

      // Advance time to allow potential sync
      vi.advanceTimersByTime(100);

      // Should handle gracefully without errors
      expect(store.state.user.authed).toBe(true);
      
      vi.useRealTimers();
    });
  });
});

/**
 * Helper function to create a mock JWT token with given payload
 * Note: This creates a token-like string; signature is not validated in these tests
 */
function createMockToken(payload: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  return `${header}.${payloadStr}.${signature}`;
}
