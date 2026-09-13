/**
 * Unit tests for cross-tab store/auth synchronization (storeSync.ts)
 * Tests synchronization between store.user.authed and the session marker
 * (authService's non-secret `{authedUntil}` localStorage value) across app
 * initialization, external changes, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeSync } from '../storeSync';
import { store, OS_KEY } from '../../store/store';
import { authService, SESSION_KEY } from '../auth';

function futureExpiry(seconds = 3600): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe('StoreSync', () => {
  beforeEach(() => {
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

    it('should sync auth state from the session marker on initialization', () => {
      authService.setSession(futureExpiry());
      store.state.user.authed = false; // Initially false

      storeSync.initialize();

      expect(store.state.user.authed).toBe(true);
    });

    it('should keep auth state false when no session marker on initialization', () => {
      localStorage.clear();
      store.state.user.authed = false;

      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should clear auth state if the session marker is malformed on initialization', () => {
      localStorage.setItem(SESSION_KEY, 'not-json');
      store.state.user.authed = true; // Initially true

      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should clear auth state if the session marker is expired on initialization', () => {
      authService.setSession(futureExpiry(-3600));
      store.state.user.authed = true; // Initially true

      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
      // Expired marker should also be cleared from localStorage
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  describe('external storage changes (multi-tab sync)', () => {
    it('should sync when a session marker is added from external source', () => {
      storeSync.initialize();
      store.state.user.authed = false;

      // Simulate another tab logging in
      const meta = JSON.stringify({ authedUntil: futureExpiry() });
      localStorage.setItem(SESSION_KEY, meta);

      const event = new StorageEvent('storage', {
        key: SESSION_KEY,
        newValue: meta,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.user.authed).toBe(true);
    });

    it('should sync when the session marker is removed from external source', () => {
      storeSync.initialize();

      authService.setSession(futureExpiry());
      store.state.user.authed = true;

      // Simulate another tab logging out
      localStorage.removeItem(SESSION_KEY);
      const event = new StorageEvent('storage', {
        key: SESSION_KEY,
        newValue: null,
        oldValue: 'irrelevant',
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.user.authed).toBe(false);
    });

    it('should ignore storage changes for unrelated keys', () => {
      storeSync.initialize();
      const initialAuthed = store.state.user.authed;

      const event = new StorageEvent('storage', {
        key: 'some_other_key',
        newValue: 'some-value',
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      });
      window.dispatchEvent(event);

      expect(store.state.user.authed).toBe(initialAuthed);
    });

    it('should sync when localStorage is cleared from external source', () => {
      storeSync.initialize();

      authService.setSession(futureExpiry());
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

      authService.setSession(futureExpiry());

      // Advance time past one sync interval
      vi.advanceTimersByTime(3001);

      expect(store.state.user.authed).toBe(true);

      vi.useRealTimers();
    });

    it('should detect session expiration through periodic sync', () => {
      vi.useFakeTimers();

      // Start with a session marker expiring in 2 seconds
      authService.setSession(futureExpiry(2));
      store.state.user.authed = true;

      storeSync.initialize();
      expect(store.state.user.authed).toBe(true);

      // Advance time past expiration
      vi.advanceTimersByTime(3000);

      expect(store.state.user.authed).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      storeSync.initialize();
      storeSync.cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('should stop periodic sync on cleanup', () => {
      vi.useFakeTimers();

      storeSync.initialize();

      authService.setSession(futureExpiry());

      // Advance time past the first sync interval to ensure sync happens
      vi.advanceTimersByTime(3001);
      expect(store.state.user.authed).toBe(true);

      storeSync.cleanup();

      // Clear the session marker
      authService.clearSession();

      // Advance time past the previous sync interval - sync should NOT happen
      vi.advanceTimersByTime(5000);

      // Auth state should remain true (not synced again) since sync is stopped
      expect(store.state.user.authed).toBe(true);

      expect(() => storeSync.cleanup()).not.toThrow();

      vi.useRealTimers();
    });
  });

  describe('status reporting', () => {
    it('should report correct status when uninitialized', () => {
      const status = storeSync.getStatus();

      expect(status.initialized).toBe(false);
    });

    it('should report correct status when initialized with a valid session marker', () => {
      authService.setSession(futureExpiry());

      storeSync.initialize();
      const status = storeSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.sessionValid).toBe(true);
      expect(status.authStateMatches).toBe(true);
    });

    it('should report mismatched state when out of sync', () => {
      storeSync.initialize();

      // Manually set mismatched states
      store.state.user.authed = true;
      authService.clearSession();

      const status = storeSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.sessionValid).toBe(false);
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

      // Manually trigger a malformed-marker scenario
      localStorage.setItem(SESSION_KEY, 'malformed-not-json');

      const status = storeSync.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.sessionValid).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle login flow: no session → valid session', () => {
      vi.useFakeTimers();
      localStorage.clear();
      store.state.user.authed = false;

      storeSync.initialize();
      expect(store.state.user.authed).toBe(false);

      // Simulate login
      authService.setSession(futureExpiry());

      // Advance time for periodic sync to detect the change
      vi.advanceTimersByTime(3001);

      const status = storeSync.getStatus();
      expect(status.sessionValid).toBe(true);
      expect(store.state.user.authed).toBe(true);

      vi.useRealTimers();
    });

    it('should handle logout flow: valid session → no session', () => {
      vi.useFakeTimers();
      authService.setSession(futureExpiry());
      store.state.user.authed = true;

      storeSync.initialize();
      expect(store.state.user.authed).toBe(true);

      // Simulate logout
      authService.clearSession();

      vi.advanceTimersByTime(3001);

      const status = storeSync.getStatus();
      expect(status.sessionValid).toBe(false);
      expect(store.state.user.authed).toBe(false);

      vi.useRealTimers();
    });

    it('should handle 401 response clearing the session', () => {
      vi.useFakeTimers();
      authService.setSession(futureExpiry());
      store.state.user.authed = true;

      storeSync.initialize();

      // Simulate 401 response clearing the session (errorHandler.ts's handle401Error)
      authService.clearSession();

      vi.advanceTimersByTime(3001);

      expect(store.state.user.authed).toBe(false);

      vi.useRealTimers();
    });

    it('should persist across page refresh', () => {
      authService.setSession(futureExpiry());

      // Simulate page refresh
      store.state.user.authed = false; // Reset as would happen on page load

      storeSync.initialize();

      // Auth state should be restored from the session marker
      expect(store.state.user.authed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle an empty session marker string', () => {
      localStorage.setItem(SESSION_KEY, '');
      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle a malformed session marker', () => {
      localStorage.setItem(SESSION_KEY, 'not-a-valid-marker');
      storeSync.initialize();

      expect(store.state.user.authed).toBe(false);
    });

    it('should handle rapid successive storage events', () => {
      vi.useFakeTimers();
      storeSync.initialize();

      const meta = JSON.stringify({ authedUntil: futureExpiry() });

      // Trigger multiple storage events rapidly
      for (let i = 0; i < 5; i++) {
        localStorage.setItem(SESSION_KEY, meta);
        const event = new StorageEvent('storage', {
          key: SESSION_KEY,
          newValue: meta,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href,
        });
        window.dispatchEvent(event);
      }

      vi.advanceTimersByTime(100);

      expect(store.state.user.authed).toBe(true);

      vi.useRealTimers();
    });
  });
});
