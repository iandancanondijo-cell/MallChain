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
import { requestMnemonic } from './mnemonicAccess';

/** Exported so storeSync.ts can recognize this key in cross-tab 'storage' events without duplicating the literal. */
export const SESSION_KEY = 'session';

/**
 * Post-expiry sign-in cooldown (platform security policy: 30-minute session
 * → logout → 15 minutes before signing in again, showing the remaining
 * time). Client-side mirror only — the server's 423 login_cooldown response
 * is authoritative; this drives the AuthPage countdown so the user sees the
 * lockout the moment the session ends instead of after a rejected attempt.
 * Kept in its OWN localStorage key because clearSession()/logout() delete
 * SESSION_KEY wholesale (and the cooldown must survive exactly that).
 */
export const COOLDOWN_KEY = 'login_cooldown_until';
export const DEFAULT_COOLDOWN_MINUTES = 15;

interface SessionMeta {
  /** Unix seconds — when the backend expects the auth cookie to expire. */
  authedUntil: number;
}

/** Outcome of linkWallet() — see its doc comment. `reason` is machine-readable (`pin_cancelled`, `not_signed_in`, a backend error string…) for logging; callers show their own human message. */
export type LinkWalletResult = { ok: true } | { ok: false; reason: string };

/** Outcome of getServerWalletLink(): `address` is the account's server-side linked wallet, or null when none is linked. */
export type ServerWalletLinkResult =
  | { ok: true; address: string | null }
  | { ok: false; reason: string };

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

  /**
   * The raw `authedUntil` (unix seconds) from the session marker, WITHOUT
   * the expiry-driven clear that isAuthenticated() performs — callers
   * (handle401Error, storeSync) need to distinguish "the session ended on
   * schedule" from "the server rejected a still-unexpired token" before the
   * marker is wiped.
   */
  getAuthedUntil(): number | null {
    return this.readSession()?.authedUntil ?? null;
  }

  /** Cooldown end (epoch ms) from localStorage, or null. Past values are cleared. */
  getCooldownUntil(): number | null {
    try {
      const raw = localStorage.getItem(COOLDOWN_KEY);
      if (!raw) return null;
      const until = Number(raw);
      if (!Number.isFinite(until)) return null;
      if (until <= Date.now()) {
        localStorage.removeItem(COOLDOWN_KEY);
        return null;
      }
      return until;
    } catch {
      return null;
    }
  }

  /** Arm the client-side cooldown countdown (takes epoch ms). */
  setCooldownUntil(untilMs: number): void {
    try {
      localStorage.setItem(COOLDOWN_KEY, String(untilMs));
    } catch (error) {
      console.warn('[Auth] Failed to persist cooldown marker:', (error as Error).message);
    }
  }

  clearCooldown(): void {
    try {
      localStorage.removeItem(COOLDOWN_KEY);
    } catch {
      /* non-critical */
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

  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Silently renews the session — POSTs to /api/auth/refresh, which issues
   * a fresh httpOnly cookie server-side, and updates the local
   * `{authedUntil}` marker from the real expiresAt it returns.
   *
   * NOTE (session policy 2026-11): kept for explicit, user-initiated
   * renewal only. storeSync.ts's automatic call from its periodic check was
   * removed — silently sliding the session forever defeated the
   * 30-minute-session / 15-minute-cooldown security policy. The backend
   * re-stamps its current-session marker on refresh, which is what prevents
   * a later natural expiry (or stale tabs) from locking the wrong session.
   *
   * Concurrent callers share one in-flight request instead of each firing
   * their own refresh.
   */
  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const res = await api.post<{ expiresAt: number }>('/api/auth/refresh', {});
        if (res.ok && res.data?.expiresAt) {
          this.setSession(res.data.expiresAt);
          return true;
        }
        return false;
      } catch (error) {
        console.warn('[Auth] Failed to refresh session:', (error as Error).message);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
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
   * requestMnemonic() to produce it — unless a `mnemonic` was already
   * decrypted by the caller (avoids double PIN prompts in flows like
   * WalletSend that need the phrase anyway).
   *
   * Returns a discriminated result instead of swallowing failures: callers
   * that genuinely need the link to exist (Send, badge purchase) can await
   * this and surface `{ ok: false, reason }` to the user; App.tsx's
   * best-effort background sync simply logs the failure. On success, marks
   * `store.state.wallet.linkedOnServer` so the "Connected" badges and the
   * pre-send check stop re-verifying.
   */
  async linkWallet(address: string, opts?: { mnemonic?: string }): Promise<LinkWalletResult> {
    if (!address) return { ok: false, reason: 'no_wallet_address' };
    if (!this.isAuthenticated()) return { ok: false, reason: 'not_signed_in' };
    try {
      const mnemonic = opts?.mnemonic ?? (await requestMnemonic());
      if (!mnemonic) return { ok: false, reason: 'pin_cancelled' };

      // @cosmjs/amino + @cosmjs/encoding are ~250 KB gzipped and only needed
      // when the user actually links an on-chain wallet — pulling them in
      // statically forced every visitor of the landing page to download them
      // before first paint. Dynamic import keeps them in the txConfirmation
      // chunk (already lazy-loaded for other signing flows).
      const [{ Secp256k1HdWallet, makeSignDoc }, { toBase64, toUtf8 }] = await Promise.all([
        import('@cosmjs/amino'),
        import('@cosmjs/encoding'),
      ]);
      const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: chain.addressPrefix });
      const timestamp = new Date().toISOString();
      const msg = {
        type: 'sign/MsgSignData',
        value: { signer: address, data: toBase64(toUtf8(linkWalletMessage(address, timestamp))) },
      };
      const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
      const { signature } = await wallet.signAmino(address, signDoc);

      const res = await api.post('/api/auth/link-wallet', {
        address,
        timestamp,
        pubKey: signature.pub_key.value,
        signature: signature.signature,
      });
      if (!res.ok) {
        const reason = res.error || 'link_rejected_by_server';
        console.warn('[Auth] link-wallet rejected:', reason);
        return { ok: false, reason };
      }
      if (store.state.wallet.address === address) {
        store.state.wallet.linkedOnServer = true;
        store.commit();
      }
      return { ok: true };
    } catch (error) {
      console.warn('[Auth] Failed to link wallet address:', (error as Error).message);
      return { ok: false, reason: (error as Error).message };
    }
  }

  /**
   * Ask the backend which wallet address is currently linked to the signed-in
   * account (GET /api/auth/me → user.walletAddress). This is the only
   * authoritative check — /api/send/* relays reject broadcasts whose `from`
   * isn't the account's server-side linked address (403 wallet_not_linked).
   * Never throws: an unreachable/c rejected backend comes back as
   * `{ ok: false, reason }` so callers can distinguish "server says unlinked"
   * from "couldn't confirm at all".
   */
  async getServerWalletLink(): Promise<ServerWalletLinkResult> {
    try {
      const res = await api.get<{ user?: { walletAddress?: string | null } }>('/api/auth/me');
      if (!res.ok) return { ok: false, reason: res.error || 'Could not confirm the wallet link with the server' };
      return { ok: true, address: res.data?.user?.walletAddress ?? null };
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
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
    // Only attempt server-side session revocation if we have a valid local
    // session marker. Without it, the POST would just get a 401 and trigger
    // the same logout handler again (infinite loop on unauthenticated pages).
    if (this.isAuthenticated()) {
      api.post('/api/auth/logout', {}).catch(() => {
        // best-effort — local state is cleared either way
      });
    }
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
