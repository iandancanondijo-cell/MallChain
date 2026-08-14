/**
 * Mallchain Mission Control v14 — cross-tab store synchronization.
 *
 * Contract: keeps the in-memory `store.state` consistent with what's on disk
 * when another tab/window changes it, and keeps `store.user.authed` in sync
 * with the JWT token specifically. Ensures the UI reflects reality even when:
 * - localStorage is modified externally (other tabs, browser extension, DevTools)
 * - The token is cleared (e.g., on 401 response, logout in another tab)
 * - The whole app state (OS_KEY) is changed in another tab — balances, wallet,
 *   in-progress flows, everything, not just the login flag
 * - App is initialized/refreshed
 *
 * Historically this only watched the `token` key, so two tabs would agree on
 * "am I logged in" but silently diverge on everything else (balances, wallet
 * address, KYC state, cart, in-progress wizards...) until a manual reload.
 * It now also watches OS_KEY (the whole serialized AppState) and applies
 * externally-written snapshots via `store.applyExternalState`, which merges
 * into memory and notifies subscribers WITHOUT re-persisting (the snapshot is
 * already on disk — re-persisting would just be a redundant write).
 *
 * Merge semantics: whole-document last-write-wins. `store.commit()` always
 * persists the entire AppState on every mutation (no field-level diffing
 * exists anywhere in this app), so every `storage` event's `newValue` is
 * already a complete, internally-consistent snapshot as of the other tab's
 * most recent commit — the same last-write-wins behavior every slice already
 * implicitly has today (two tabs mutating the same slice already have the
 * second commit win). Not worth building conflict resolution for a
 * single-user wallet app.
 *
 * Implementation details:
 * - Listens to 'storage' event to detect changes in other tabs/windows
 * - Uses a sync timer to check *token* validity periodically, since JWT
 *   expiry isn't something the browser fires an event for, and the `storage`
 *   event never fires in the tab that made the change
 */

import { store, OS_KEY, type AppState } from '../store/store';
import { authService } from './auth';

const TOKEN_KEY = 'token';
const SYNC_INTERVAL_MS = 3000; // Check token validity every 3 seconds

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

    console.log('[StoreSync] Initializing cross-tab store synchronization');

    // Read token from localStorage on app startup
    this.syncAuthStateFromToken();

    // Listen for external localStorage changes (other tabs, browser extensions, DevTools)
    window.addEventListener('storage', this.handleStorageChange);

    // Start periodic sync to catch token expiration and validity changes
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
   * Synchronize auth state from current token status.
   * This ensures store.user.authed reflects the current token validity.
   *
   * Cases handled:
   * 1. Valid token in localStorage → set user.authed = true
   * 2. No token in localStorage → set user.authed = false
   * 3. Expired/invalid token → set user.authed = false and clear token
   */
  private syncAuthStateFromToken = (): void => {
    try {
      const token = authService.getToken();
      const isAuth = authService.isAuthenticated();

      if (isAuth && token) {
        // Token exists and is valid
        if (!store.state.user.authed) {
          console.log('[StoreSync] Token found and valid, updating auth state');
          store.state.user.authed = true;
          store.commit();
        }
      } else {
        // No token or token is invalid/expired
        if (store.state.user.authed) {
          console.log('[StoreSync] Token missing or invalid, clearing auth state');
          store.state.user.authed = false;
          store.commit();
        }
      }
    } catch (error) {
      console.error('[StoreSync] Error syncing auth state from token:', error);
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
      console.log('[StoreSync] OS_KEY cleared in another tab, resetting local store');
      store.reset();
      return;
    }

    try {
      const parsed = JSON.parse(newValue) as AppState;
      if (parsed && parsed.version === 14) {
        console.log('[StoreSync] OS_KEY changed in another tab, applying snapshot');
        store.applyExternalState(parsed);
      }
    } catch (error) {
      console.warn('[StoreSync] Ignoring corrupted OS_KEY snapshot from another tab:', (error as Error).message);
    }
  };

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
      console.log('[StoreSync] localStorage.clear() detected, resetting local store');
      store.reset();
      return;
    }

    if (event.key === OS_KEY) {
      this.syncStoreFromOsKey(event.newValue);
      return;
    }

    if (event.key === TOKEN_KEY) {
      console.log('[StoreSync] Token changed in external window/tab, syncing auth state');
      this.syncAuthStateFromToken();
    }
  };

  /**
   * Start periodic sync to detect token changes in the current tab.
   * This catches cases like:
   * - Token expiration
   * - Programmatic token changes in DevTools
   * - Token being manually modified via localStorage API
   */
  private startPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      return; // Already running
    }

    this.syncIntervalId = window.setInterval(() => {
      this.syncAuthStateFromToken();
    }, SYNC_INTERVAL_MS);

    console.log(`[StoreSync] Periodic sync started (every ${SYNC_INTERVAL_MS}ms)`);
  }

  /**
   * Stop the periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('[StoreSync] Periodic sync stopped');
    }
  }

  /**
   * Get current sync status (useful for debugging)
   */
  getStatus(): {
    initialized: boolean;
    tokenValid: boolean;
    authStateMatches: boolean;
  } {
    const token = authService.getToken();
    const isAuth = authService.isAuthenticated();
    const stateAuthed = store.state.user.authed;

    return {
      initialized: this.isInitialized,
      tokenValid: isAuth && !!token,
      authStateMatches: isAuth === stateAuthed,
    };
  }
}

/**
 * Global singleton instance of StoreSync
 */
export const storeSync = new StoreSync();
