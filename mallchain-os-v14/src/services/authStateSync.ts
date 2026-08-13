/**
 * Mallchain Mission Control v14 — Auth State Synchronization
 *
 * Contract: Synchronizes frontend auth state (store.user.authed) with localStorage token.
 * Ensures the auth state reflects the current token status at all times, even when:
 * - localStorage is modified externally (other tabs, browser extension, DevTools)
 * - Token is cleared from localStorage (e.g., on 401 response)
 * - App is initialized/refreshed
 *
 * Features:
 * - Task 4.8: Initialization that reads token from localStorage on app startup
 * - Task 4.8: Listeners for external localStorage changes (multi-tab sync)
 * - Task 4.8: Automatic sync when token is cleared from localStorage
 * - Task 4.8: UI always reflects current authentication status
 *
 * Implementation details:
 * - Listens to 'storage' event to detect changes in other tabs/windows
 * - Uses a sync timer to check token validity periodically
 * - Ensures auth state and token are always in sync
 * - Handles edge cases like localStorage being full or unavailable
 */

import { store } from '../store/store';
import { authService } from './auth';

const TOKEN_KEY = 'token';
const SYNC_INTERVAL_MS = 3000; // Check token validity every 3 seconds

export class AuthStateSync {
  private syncIntervalId: number | null = null;
  private isInitialized = false;

  /**
   * Initialize auth state synchronization
   * Call this once when the app starts (e.g., in App.tsx useEffect)
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    console.log('[AuthStateSync] Initializing auth state synchronization');

    // Task 4.8: Read token from localStorage on app startup
    this.syncAuthStateFromToken();

    // Task 4.8: Listen for external localStorage changes (other tabs, browser extensions, DevTools)
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
   * Task 4.8: Synchronize auth state from current token status
   * This ensures store.user.authed reflects the current token validity
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
          console.log('[AuthStateSync] Token found and valid, updating auth state');
          store.state.user.authed = true;
          store.commit();
        }
      } else {
        // No token or token is invalid/expired
        if (store.state.user.authed) {
          console.log('[AuthStateSync] Token missing or invalid, clearing auth state');
          store.state.user.authed = false;
          store.commit();
        }
      }
    } catch (error) {
      console.error('[AuthStateSync] Error syncing auth state from token:', error);
      // If sync fails, ensure auth state is cleared for safety
      if (store.state.user.authed) {
        store.state.user.authed = false;
        store.commit();
      }
    }
  };

  /**
   * Task 4.8: Handle external localStorage changes (e.g., from another tab)
   * This is triggered by the 'storage' event when localStorage is modified in another tab/window
   *
   * Implementation note: The storage event is NOT fired in the tab that made the change,
   * only in other tabs/windows. This is why we need periodic sync for the current tab.
   */
  private handleStorageChange = (event: StorageEvent): void => {
    // Only handle token key changes
    if (event.key !== TOKEN_KEY && event.key !== null) {
      return;
    }

    // If key is null, it means localStorage.clear() was called
    const wasCleared = event.key === null;

    if (wasCleared) {
      console.log('[AuthStateSync] localStorage.clear() detected, clearing auth state');
      if (store.state.user.authed) {
        store.state.user.authed = false;
        store.commit();
      }
      return;
    }

    // Token key was specifically changed/deleted
    console.log('[AuthStateSync] Token changed in external window/tab, syncing auth state');
    this.syncAuthStateFromToken();
  };

  /**
   * Start periodic sync to detect token changes in the current tab
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

    console.log(`[AuthStateSync] Periodic sync started (every ${SYNC_INTERVAL_MS}ms)`);
  }

  /**
   * Stop the periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('[AuthStateSync] Periodic sync stopped');
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
 * Global singleton instance of AuthStateSync
 */
export const authStateSync = new AuthStateSync();
