/**
 * Mallchain Mission Control v14 — cross-tab store synchronization.
 *
 * Contract: keeps the in-memory `store.state` consistent with what's on disk
 * when another tab/window changes it, and keeps `store.user.authed` in sync
 * with the session marker specifically. Ensures the UI reflects reality even when:
 * - localStorage is modified externally (other tabs, browser extension, DevTools)
 * - The session ends (e.g., on 401 response, logout in another tab)
 * - The whole app state (OS_KEY) is changed in another tab — balances, wallet,
 *   in-progress flows, everything, not just the login flag
 * - App is initialized/refreshed
 *
 * Historically this only watched a raw JWT in the `token` key; the JWT now
 * lives in an httpOnly cookie this code can't read at all, so what's watched
 * instead is authService's non-secret `{authedUntil}` session marker
 * (SESSION_KEY) — same role (a same-origin hint for cross-tab UI sync), just
 * backed by a value that was never actually a bearer credential.
 * It also watches OS_KEY (the whole serialized AppState) and applies
 * externally-written snapshots via `store.applyExternalState`, which merges
 * into memory and notifies subscribers WITHOUT re-persisting (the snapshot is
 * already on disk — re-persisting would just be a redundant write).
 *
 * Merge semantics: whole-document last-write-wins, with one exception — a
 * snapshot that claims a different signed-in account than this tab's verified
 * identity is dropped rather than applied (see `claimsAnotherAccount`). Every
 * `storage` event's `newValue` is already a complete, internally-consistent
 * snapshot as of the other tab's most recent commit (`store.commit()` persists
 * the entire AppState on every mutation; there is no field-level diffing
 * anywhere in this app), so nothing is gained by building conflict resolution
 * for a single-user wallet app.
 *
 * Implementation details:
 * - Listens to 'storage' event to detect changes in other tabs/windows
 * - Uses a sync timer to check session validity periodically, since cookie
 *   expiry isn't something the browser fires an event for, and the `storage`
 *   event never fires in the tab that made the change
 */

import { store, OS_KEY, type AppState } from '../store/store';
import { authService, SESSION_KEY } from './auth';

const SYNC_INTERVAL_MS = 3000; // Check session validity every 3 seconds

export class StoreSync {
  private syncIntervalId: number | null = null;
  private isInitialized = false;

  /**
   * Initialize store synchronization.
   * Call this once when the app starts (e.g., in App.tsx useEffect)
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Read session marker from localStorage on app startup
    this.syncAuthStateFromSession();

    // Listen for external localStorage changes (other tabs, browser extensions, DevTools)
    window.addEventListener('storage', this.handleStorageChange);

    // Start periodic sync to catch session expiration and validity changes
    this.startPeriodicSync();

    this.isInitialized = true;
  }

  /**
   * Clean up resources
   * Call this on app shutdown or when appropriate
   */
  cleanup(): void {
    window.removeEventListener('storage', this.handleStorageChange);
    this.stopPeriodicSync();
    this.isInitialized = false;
  }

  /**
   * Synchronize auth state from the current session marker.
   * This ensures store.user.authed reflects the current session validity.
   *
   * Cases handled:
   * 1. Valid session marker → set user.authed = true
   * 2. No session marker → set user.authed = false
   * 3. Expired session marker → set user.authed = false and clear it
   */
  private syncAuthStateFromSession = (): void => {
    try {
      // Session policy (2026-11): 30 minutes of use → hard logout → 15-minute
      // sign-in cooldown. The old silent auto-renew (refreshSession() fired
      // from here whenever <10 minutes remained) defeated that policy by
      // sliding the session forever, so it is REMOVED — the manual
      // authService.refreshSession() remains available for explicit use.
      //
      // This tick does NOT arm the client-side cooldown any more. It used to
      // write a 15-minute `login_cooldown_until` the moment the marker passed
      // its expiry while the store still believed it was authed, but the
      // backend only puts an account in cooldown when a request actually
      // arrives on the expired token (see
      // backend/src/middleware/sessionCooldown.js). A tab that was closed over
      // the expiry, or a background tab whose polling is paused, reaches this
      // line with no server-side lockout at all — and AuthPage replaces the
      // sign-in form with a countdown whenever that marker exists, so the
      // guess turned into a 15-minute lockout the user was not under, with no
      // way to sign in. The mirror is now written only from the server's own
      // answers: the 401 `session_expired` (errorHandler.ts) and the 423 on an
      // early sign-in (authApi.ts).
      const isAuth = authService.isAuthenticated();

      if (isAuth) {
        if (!store.state.user.authed) {
          store.state.user.authed = true;
          store.commit();
        }
      } else {
        if (store.state.user.authed) {
          store.state.user.authed = false;
          store.commit();
        }
      }
    } catch (error) {
      console.error('[StoreSync] Error syncing auth state from session:', error);
      // If sync fails, ensure auth state is cleared for safety
      if (store.state.user.authed) {
        store.state.user.authed = false;
        store.commit();
      }
    }
  };

  /**
   * Apply a whole-state snapshot written by another tab to OS_KEY.
   */
  private syncStoreFromOsKey = (newValue: string | null): void => {
    if (newValue == null) {
      // Another tab called store.reset() — mirror that locally.
      store.reset();
      return;
    }

    try {
      const parsed = JSON.parse(newValue) as AppState;
      if (parsed && parsed.version === 14) {
        if (this.claimsAnotherAccount(parsed)) {
          console.warn('[StoreSync] Ignored a snapshot from another tab that is signed in as a different account.');
          return;
        }
        store.applyExternalState(parsed);
      }
    } catch (error) {
      console.warn('[StoreSync] Ignoring corrupted OS_KEY snapshot from another tab:', (error as Error).message);
    }
  };

  /**
   * A snapshot only describes the same session when it agrees about who is
   * signed in. Any same-origin tab can write OS_KEY — an older published
   * bundle under /downloads/node/, or a second account signed in side by side —
   * and last-write-wins on the whole document would paste that session's
   * identity, wallet and balances over a tab whose identity the server just
   * confirmed. A signed-out snapshot (no id, not authed) is still allowed
   * through: that is what another tab's logout looks like, and the session
   * marker carries the expiry regardless.
   */
  private claimsAnotherAccount(snapshot: AppState): boolean {
    const local = store.state.user;
    if (!local.authed || !local.id) return false;
    const incoming = snapshot.user;
    if (!incoming) return false;
    if (incoming.id === local.id) return false;
    return !!incoming.authed || !!incoming.id;
  }

  /**
   * Handle external localStorage changes (e.g., from another tab).
   * This is triggered by the 'storage' event when localStorage is modified in another tab/window.
   *
   * Implementation note: The storage event is NOT fired in the tab that made the change,
   * only in other tabs/windows. This is why we need periodic sync for the current tab's token.
   */
  private handleStorageChange = (event: StorageEvent): void => {
    // localStorage.clear() fires a single event with key === null — treat it as
    // both a token clear and an OS_KEY clear.
    if (event.key === null) {
      store.reset();
      return;
    }

    if (event.key === OS_KEY) {
      this.syncStoreFromOsKey(event.newValue);
      return;
    }

    if (event.key === SESSION_KEY) {
      this.syncAuthStateFromSession();
    }
  };

  /**
   * Start periodic sync to detect session changes in the current tab.
   * This catches cases like:
   * - Session expiration
   * - Programmatic changes in DevTools
   * - Session marker being manually modified via localStorage API
   */
  private startPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      return; // Already running
    }

    this.syncIntervalId = window.setInterval(() => {
      this.syncAuthStateFromSession();
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Stop the periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Get current sync status (useful for debugging)
   */
  getStatus(): {
    initialized: boolean;
    sessionValid: boolean;
    authStateMatches: boolean;
  } {
    const isAuth = authService.isAuthenticated();
    const stateAuthed = store.state.user.authed;

    return {
      initialized: this.isInitialized,
      sessionValid: isAuth,
      authStateMatches: isAuth === stateAuthed,
    };
  }
}

/**
 * Global singleton instance of StoreSync
 */
export const storeSync = new StoreSync();
