/**
 * Unit tests for Auth State Synchronization (storeSync.ts)
 * Tests synchronization between store.user.authed and localStorage token
 * across app initialization, external changes, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeSync } from '../storeSync';
import { store, OS_KEY } from '../../store/store';
import { authService } from '../auth';

describe('StoreSync', () => {
  beforeEach(() => {
    // Clear localStorage and reset store before each test
    localStorage.clear();
    store.state.user.authed = false;
    storeSync.cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    store.state.user.authed = false;
    storeSync.cleanup();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(() => {
        storeSync.initialize();
      }).not.toThrow();
    });

    it('should not reinitialize if already initialized', () => {
      storeSync.initialize();
      const firstStatus = storeSync.getStatus();
      storeSync.initialize();
      const secondStatus = storeSync.getStatus();
      
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

      storeSync.initialize();

      // Auth state should now be synced to true
      expect(store.state.user.authed).toBe(true);
    });

    it('should keep auth state false when no token on initialization', () => {
      // No token in localStorage
      localStorage.clear();
      store.state.user.authed = false;

      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should clear auth state if token is invalid on initialization', () => {
      // Store an invalid token
      localStorage.setItem('token', 'invalid.token');
      store.state.user.authed = true; // Initially true

      storeSync.initialize();

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

      storeSync.initialize();

      // Auth state should be cleared
      expect(store.state.user.authed).toBe(false);
      // Expired token should also be cleared from localStorage
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('external storage changes (multi-tab sync)', () => {
    it('should sync when token is added from external source', () => {
      storeSync.initialize();
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
      storeSync.initialize();
      
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

    it('should ignore storage changes for unrelated keys', () => {
      storeSync.initialize();
      const initialAuthed = store.state.user.authed;

      // Trigger storage event for a key that's neither the token nor OS_KEY
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
      storeSync.initialize();
      
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

  describe('OS_KEY whole-state sync (multi-tab)', () => {
    it('applies a snapshot written by another tab without re-persisting it', () => {
      storeSync.initialize();
      const persistSpy = vi.spyOn(Storage.prototype, 'setItem');

      const snapshot = { ...store.state, balances: { ...store.state.balances, MALL: 4242 } };
      const event = new StorageEvent('storage', {
        key: OS_KEY,
        newValue: JSON.stringify(snapshot),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.balances.MALL).toBe(4242);
      // Applying an external snapshot must not write it straight back —
      // it's already on disk, and doing so would be a redundant round-trip.
      expect(persistSpy).not.toHaveBeenCalledWith(OS_KEY, expect.anything());

      persistSpy.mockRestore();
    });

    it('notifies subscribers when an external OS_KEY snapshot is applied', () => {
      storeSync.initialize();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      const snapshot = { ...store.state, balances: { ...store.state.balances, MALL: 7 } };
      const event = new StorageEvent('storage', {
        key: OS_KEY,
        newValue: JSON.stringify(snapshot),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });

    it('resets the local store when another tab clears OS_KEY', () => {
      storeSync.initialize();
      store.state.balances.MALL = 999;

      const event = new StorageEvent('storage', {
        key: OS_KEY,
        newValue: null,
        oldValue: 'irrelevant',
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.balances.MALL).toBe(0);
    });

    it('ignores a corrupted OS_KEY snapshot instead of throwing', () => {
      storeSync.initialize();
      store.state.balances.MALL = 123;

      const event = new StorageEvent('storage', {
        key: OS_KEY,
        newValue: '{not valid json',
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });

      expect(() => window.dispatchEvent(event)).not.toThrow();
      expect(store.state.balances.MALL).toBe(123);
    });

    it('ignores an OS_KEY snapshot with a mismatched version', () => {
      storeSync.initialize();
      store.state.balances.MALL = 55;

      const snapshot = { ...store.state, version: 1, balances: { ...store.state.balances, MALL: 999 } };
      const event = new StorageEvent('storage', {
        key: OS_KEY,
        newValue: JSON.stringify(snapshot),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.balances.MALL).toBe(55);
    });
  });

  describe('periodic sync', () => {
    it('should periodically sync auth state', () => {
      vi.useFakeTimers();
      storeSync.initialize();
      
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

      storeSync.initialize();
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
      
      storeSync.initialize();
      storeSync.cleanup();

      // Should have removed the storage event listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('should stop periodic sync on cleanup', () => {
      vi.useFakeTimers();
      
      storeSync.initialize();
      
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
      storeSync.cleanup();

      // Clear the token
      localStorage.removeItem('token');

      // Advance time past the previous sync interval - sync should NOT happen
      vi.advanceTimersByTime(5000);

      // Auth state should remain true (not synced again) since sync is stopped
      expect(store.state.user.authed).toBe(true);

      // Verify cleanup doesn't throw
      expect(() => storeSync.cleanup()).not.toThrow();

      vi.useRealTimers();
    });
  });

  describe('status reporting', () => {
    it('should report correct status when uninitialized', () => {
      const status = storeSync.getStatus();

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
      
      storeSync.initialize();
      const status = storeSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.tokenValid).toBe(true);
      expect(status.authStateMatches).toBe(true);
    });

    it('should report mismatched state when out of sync', () => {
      storeSync.initialize();
      
      // Manually set mismatched states
      store.state.user.authed = true;
      localStorage.removeItem('token');

      const status = storeSync.getStatus();

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

      storeSync.initialize();
      
      // Should not throw and auth state should be cleared for safety
      expect(store.state.user.authed).toBe(false);

      getItemSpy.mockRestore();
    });

    it('should handle authService errors gracefully', () => {
      storeSync.initialize();
      
      // Manually trigger an error scenario by storing malformed token
      localStorage.setItem('token', 'malformed.token.here');

      // Trigger sync (can happen through periodic check)
      const status = storeSync.getStatus();

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
      
      storeSync.initialize();
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
      const status = storeSync.getStatus();
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

      storeSync.initialize();
      expect(store.state.user.authed).toBe(true);

      // Simulate logout: clear token
      authService.clearToken();

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      // Trigger sync
      const status = storeSync.getStatus();
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

      storeSync.initialize();

      // Simulate 401 response clearing token
      authService.clearToken();

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      // Auth state should sync automatically
      const status = storeSync.getStatus();
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
      storeSync.initialize();

      // Auth state should be restored from localStorage
      expect(store.state.user.authed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty token string', () => {
      localStorage.setItem('token', '');
      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle token with invalid JWT format', () => {
      localStorage.setItem('token', 'not-a-valid-jwt');
      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle rapid successive storage events', () => {
      vi.useFakeTimers();
      storeSync.initialize();

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
