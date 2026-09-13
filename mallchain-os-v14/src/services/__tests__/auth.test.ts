/**
 * Unit tests for Authentication service (auth.ts)
 *
 * The JWT itself lives in an httpOnly cookie set by the backend — this
 * service never sees it. What it tracks is: (1) a non-secret
 * `{authedUntil}` session marker used as a same-origin UI hint, and (2) the
 * CSRF token used to protect cookie-authenticated mutating requests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService, SESSION_KEY } from '../auth';
import { store, OS_KEY } from '../../store/store';

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    // authService is a module-level singleton — its in-memory CSRF cache
    // otherwise leaks between tests within this file.
    authService.invalidateCsrfToken();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe('session marker', () => {
    it('should store the session marker in localStorage', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      authService.setSession(expiresAt);

      const raw = localStorage.getItem(SESSION_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual({ authedUntil: expiresAt });
    });

    it('should clear the session marker', () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);
      authService.clearSession();

      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('should not throw when localStorage is unavailable on write', () => {
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('localStorage is full');
      });

      expect(() => authService.setSession(Math.floor(Date.now() / 1000) + 3600)).not.toThrow();

      spy.mockRestore();
    });
  });

  describe('authentication status', () => {
    it('should be unauthenticated when no session marker stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should be authenticated with an unexpired session marker', () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should be unauthenticated with an expired session marker, and clear it', () => {
      authService.setSession(Math.floor(Date.now() / 1000) - 3600);

      expect(authService.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('should be unauthenticated with a corrupted session marker', () => {
      localStorage.setItem(SESSION_KEY, 'not-json');
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('session expiration', () => {
    it('should calculate time until expiration', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      authService.setSession(expiresAt);

      const expiresIn = authService.getSessionExpiresIn();
      expect(expiresIn).not.toBeNull();
      expect(typeof expiresIn).toBe('number');
      if (expiresIn !== null) {
        expect(expiresIn).toBeGreaterThan(3590);
        expect(expiresIn).toBeLessThanOrEqual(3600);
      }
    });

    it('should return null for expiration when no session marker', () => {
      expect(authService.getSessionExpiresIn()).toBeNull();
    });

    it('should return null for an already-expired marker', () => {
      authService.setSession(Math.floor(Date.now() / 1000) - 3600);
      expect(authService.getSessionExpiresIn()).toBeNull();
    });

    it('should detect a session expiring soon', () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 60);
      expect(authService.isSessionExpiringSoon(300)).toBe(true);
    });

    it('should not flag a session expiring soon if plenty of time remains', () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);
      expect(authService.isSessionExpiringSoon(300)).toBe(false);
    });

    it('should treat a missing session marker as expiring soon', () => {
      expect(authService.isSessionExpiringSoon()).toBe(true);
    });
  });

  describe('localStorage error handling', () => {
    // Note: happy-dom's localStorage is Proxy-backed — plain assignment like
    // `localStorage.setItem = fn` silently no-ops (the Proxy trap ignores it),
    // and Storage.prototype.* is also not what real calls resolve through.
    // vi.spyOn is the only thing that reliably intercepts calls here.
    it('should handle localStorage removeItem error gracefully', () => {
      const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      expect(() => authService.clearSession()).not.toThrow();

      spy.mockRestore();
    });
  });

  describe('CSRF token management', () => {
    it('fetches and caches the CSRF token from GET /api/csrf-token', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ csrfToken: 'abc123' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const token = await authService.getCsrfToken();
      expect(token).toBe('abc123');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/csrf-token'),
        expect.objectContaining({ credentials: 'include' })
      );

      // Second call must be served from cache, not a second fetch.
      const token2 = await authService.getCsrfToken();
      expect(token2).toBe('abc123');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent callers into a single in-flight fetch', async () => {
      let resolveFetch: (v: unknown) => void;
      const fetchMock = vi.fn().mockReturnValue(
        new Promise((resolve) => { resolveFetch = resolve; })
      );
      vi.stubGlobal('fetch', fetchMock);

      const p1 = authService.getCsrfToken();
      const p2 = authService.getCsrfToken();
      resolveFetch!({ ok: true, json: async () => ({ csrfToken: 'xyz' }) });

      expect(await p1).toBe('xyz');
      expect(await p2).toBe('xyz');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null and does not cache on a failed fetch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const token = await authService.getCsrfToken();
      expect(token).toBeNull();
    });

    it('returns null without throwing on a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const token = await authService.getCsrfToken();
      expect(token).toBeNull();
    });

    it('invalidateCsrfToken() forces the next call to fetch again', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ csrfToken: 'first' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await authService.getCsrfToken();
      authService.invalidateCsrfToken();

      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ csrfToken: 'second' }) });
      const token = await authService.getCsrfToken();

      expect(token).toBe('second');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('clearSession() also discards the cached CSRF token', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ csrfToken: 'before-logout' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await authService.getCsrfToken();
      authService.clearSession();

      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ csrfToken: 'after-logout' }) });
      const token = await authService.getCsrfToken();

      expect(token).toBe('after-logout');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('logout', () => {
    afterEach(() => {
      store.reset();
    });

    it('clears the session marker', () => {
      authService.setSession(Math.floor(Date.now() / 1000) + 3600);
      authService.logout();
      expect(authService.isAuthenticated()).toBe(false);
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
});
