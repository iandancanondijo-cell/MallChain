/**
 * Mallchain Mission Control v14 — Authentication service.
 *
 * Contract: Tracks client-visible session state and manages the CSRF token
 * used to protect cookie-authenticated mutating requests.
 *
 * The actual JWT lives in an httpOnly `auth_token` cookie set by the backend
 * (authController.js) — it is never readable by this code, which is the
 * entire point (an XSS payload can no longer exfiltrate a live session).
 * What this module keeps client-side is just a non-secret hint,
 * `{authedUntil}` (a unix-seconds timestamp echoed back by the backend on
 * login/register), used to drive UI state (e.g. "are we logged in") without
 * a round trip. It is never trusted for authorization — every real
 * request still lives or dies on the server validating the actual cookie.
 */

import { store } from '../store/store';
import { api } from './api';
import { chain, config } from './config';
import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino';
import { toBase64, toUtf8 } from '@cosmjs/encoding';
import { requestMnemonic } from './mnemonicAccess';

/** Exported so storeSync.ts can recognize this key in cross-tab 'storage' events without duplicating the literal. */
export const SESSION_KEY = 'session';

interface SessionMeta {
  /** Unix seconds — when the backend expects the auth cookie to expire. */
  authedUntil: number;
}

/** Must match backend/src/mallwallet/security/verifyAdr036.js's linkWalletMessage() exactly. */
function linkWalletMessage(address: string, timestamp: string): string {
  return `Link wallet ${address} to my Mallchain account at ${timestamp}`;
}

/**
 * Authentication service: session-state tracking + CSRF token management.
 */
class AuthService {
  /**
   * In-memory only — the CSRF secret cookie backing this token is itself
   * non-httpOnly by design (the whole double-submit scheme requires JS to
   * read it back), but there's no reason to also persist the token value
   * itself to localStorage: a fresh fetch on first use per page load is
   * cheap and avoids holding onto a stale token across tabs/reloads.
   */
  private csrfToken: string | null = null;
  private csrfFetchPromise: Promise<string | null> | null = null;

  /**
   * Record that the backend just authenticated us and set the session
   * cookie. `expiresAt` is the unix-seconds value the backend returns
   * alongside every login/register/OAuth response.
   */
  setSession(expiresAt: number): void {
    try {
      const meta: SessionMeta = { authedUntil: expiresAt };
      localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    } catch (error) {
      console.warn('[Auth] Failed to persist session marker:', (error as Error).message);
    }
  }

  private readSession(): SessionMeta | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SessionMeta;
      return typeof parsed?.authedUntil === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Clears the local session marker and CSRF token. Does not by itself revoke the server-side session — see logout(). */
  clearSession(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to clear session marker:', (error as Error).message);
    }
    this.csrfToken = null;
    this.csrfFetchPromise = null;
  }

  /**
   * Check if the browser believes it holds a live session. This is a UI
   * hint only (derived from the non-secret `authedUntil` marker) — it
   * cannot be spoofed into granting access, since every actual request is
   * authorized server-side against the real (httpOnly) cookie.
   */
  isAuthenticated(): boolean {
    const session = this.readSession();
    if (!session) return false;

    const now = Math.floor(Date.now() / 1000);
    if (session.authedUntil <= now) {
      this.clearSession();
      return false;
    }
    return true;
  }

  /** Seconds until the session marker says the cookie should expire, or null if not authenticated. */
  getSessionExpiresIn(): number | null {
    const session = this.readSession();
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = session.authedUntil - now;
    return expiresIn > 0 ? expiresIn : null;
  }

  /** Whether the session marker says the cookie will expire within timeoutSeconds. */
  isSessionExpiringSoon(timeoutSeconds: number = 300): boolean {
    const expiresIn = this.getSessionExpiresIn();
    if (expiresIn === null) return true;
    return expiresIn < timeoutSeconds;
  }

  /**
   * Returns the CSRF token to attach as `X-CSRF-Token` on a mutating
   * request, fetching (and caching) it from GET /api/csrf-token on first
   * use. That endpoint also establishes the CSRF secret cookie the backend
   * validates the token against (@dr.pogodin/csurf's double-submit
   * scheme) — so this call matters even the first time a mutating request
   * happens right after login.
   *
   * Deduplicates concurrent callers into a single in-flight fetch rather
   * than racing multiple requests for the same token.
   */
  async getCsrfToken(): Promise<string | null> {
    if (this.csrfToken) return this.csrfToken;
    if (this.csrfFetchPromise) return this.csrfFetchPromise;

    this.csrfFetchPromise = (async () => {
      try {
        const base = config.apiBaseUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/api/csrf-token`, { credentials: 'include' });
        if (!res.ok) return null;
        const data = (await res.json()) as { csrfToken?: string };
        this.csrfToken = data.csrfToken || null;
        return this.csrfToken;
      } catch (error) {
        console.warn('[Auth] Failed to fetch CSRF token:', (error as Error).message);
        return null;
      } finally {
        this.csrfFetchPromise = null;
      }
    })();

    return this.csrfFetchPromise;
  }

  /** Discards the cached CSRF token so the next mutating request fetches a fresh one — used after a 403 EBADCSRFTOKEN response, in case the secret cookie rotated or expired. */
  invalidateCsrfToken(): void {
    this.csrfToken = null;
  }

  /**
   * Check if browser supports biometric authentication (WebAuthn)
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      return await Promise.resolve(
        typeof window !== 'undefined' &&
        'PublicKeyCredential' in window
      );
    } catch {
      return false;
    }
  }

  /**
   * POST /api/auth/link-wallet — tells the backend which on-chain address
   * this login owns. Nothing else ever sets User.walletAddress server-side,
   * and both the account's `hasBadge` flag (GET /api/auth/me) and the
   * monthly free-badge cron job key off that field — without this call,
   * a user could earn or buy a real on-chain badge and it would never show
   * up anywhere in their account (confirmed live: the badge existed on
   * -chain, but /me kept reporting hasBadge:false because the account's
   * walletAddress was never populated). Safe to call repeatedly — the
   * backend treats re-linking the same address as a no-op.
   *
   * The backend requires an ADR-036 signature proving control of `address`
   * (a well-formed address alone used to be enough, letting anyone link a
   * stranger's address to their own account). Prompts for the wallet PIN via
   * requestMnemonic() to produce it; if the user cancels or no PIN challenge
   * host is mounted, this just no-ops like any other failure here — linking
   * is best-effort background sync, never something that should block the UI.
   */
  async linkWallet(address: string): Promise<void> {
    if (!address || !this.isAuthenticated()) return;
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) return;

      const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: chain.addressPrefix });
      const timestamp = new Date().toISOString();
      const msg = {
        type: 'sign/MsgSignData',
        value: { signer: address, data: toBase64(toUtf8(linkWalletMessage(address, timestamp))) },
      };
      const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
      const { signature } = await wallet.signAmino(address, signDoc);

      await api.post('/api/auth/link-wallet', {
        address,
        timestamp,
        pubKey: signature.pub_key.value,
        signature: signature.signature,
      });
    } catch (error) {
      console.warn('[Auth] Failed to link wallet address:', (error as Error).message);
    }
  }

  /**
   * Canonical logout: revokes the session (server clears the cookie and
   * denylists the JWT's jti), clears the local session marker, fully
   * resets the app store (balances, wallet, in-progress flows —
   * everything), and navigates to the landing page. The single source of
   * truth for both manual "sign out" actions and forced logout on a 401.
   * Pass `navigate` when called from within a routed component; otherwise
   * falls back to setting the hash directly (the app's router is itself
   * just a `hashchange` listener, so this is equivalent).
   *
   * The revocation call is fired in the background (not awaited): the
   * local sign-out must happen instantly regardless of network conditions,
   * and there's nothing left to roll back once local state is cleared here.
   */
  logout(navigate?: (path: string) => void): void {
    api.post('/api/auth/logout', {}).catch(() => {
      // best-effort — local state is cleared either way
    });
    this.clearSession();
    store.reset();
    if (navigate) {
      navigate('/landing');
    } else {
      window.location.hash = '#/landing';
    }
  }

  /**
   * "Sign out everywhere": revokes every token issued to this account (not
   * just the calling device's), then performs the same local logout as
   * above. Awaited (unlike logout()) so the caller can show the result of
   * the revocation itself succeeding or failing, rather than assuming it did.
   */
  async logoutEverywhere(navigate?: (path: string) => void): Promise<boolean> {
    const res = await api.post('/api/auth/logout-everywhere', {});
    this.logout(navigate);
    return res.ok;
  }
}

/**
 * Global singleton instance of AuthService
 */
export const authService = new AuthService();
