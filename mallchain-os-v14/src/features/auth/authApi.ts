import { authService } from '../../services/auth';
import { store } from '../../store/store';
import { isRateLimited, getRateLimitErrorMessage, resetRateLimit } from '../../services/rateLimit';
import { config } from '../../services/config';

export type Result = { ok: boolean; message?: string; /** Set on a 423 login_cooldown response — seconds until sign-in is allowed again. */ cooldownSeconds?: number };
export type SignInData = { email: string; password: string; remember: boolean };
export type SignUpData = { email: string; password: string; referral: string };

const API_BASE = `${config.apiBaseUrl}/api`;

/**
 * Turn a failed auth response body into a message a human can act on, instead
 * of surfacing the raw machine code. The backend returns:
 *   - { error: 'validation_failed', details: [{ field, message }] }  → 400
 *   - { error: 'rate_limit_exceeded', message: '…' }                 → 429
 * The previous `error.error || 'Registration failed'` showed the literal code
 * ("validation_failed"), which read like a generic failure and hid *why*
 * (e.g. "Invalid email format"). Fall back to the code only when nothing
 * friendlier is available.
 */
function describeAuthError(error: any, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  if (error.error === 'validation_failed' && Array.isArray(error.details) && error.details.length) {
    const msgs = error.details
      .map((d: any) => (typeof d?.message === 'string' ? d.message.replace(/^[a-zA-Z]+: /, '') : ''))
      .filter(Boolean);
    if (msgs.length) return msgs.join('. ');
  }
  // For rate limits and other structured errors, prefer the human 'message'
  // field over the 'error' code.
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  if (typeof error.error === 'string' && error.error !== 'validation_failed' && error.error !== 'rate_limit_exceeded') {
    return error.error;
  }
  return fallback;
}

type AuthUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  role?: 'user' | 'admin' | 'superadmin';
  banned?: boolean;
  banReason?: string | null;
  kycLevel?: number;
  // Set on the /api/auth/login + /api/auth/me responses when the user is a
  // category admin. null for superadmin/users. AdminApp uses it to land
  // the user directly in their category window.
  adminCategory?: 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports' | null;
};

// signIn/signUp navigate via hash change, so App's initializeAuth /me sync
// never re-runs — without this the previous session's persisted identity
// (or "Guest") stays in the TopBar until the next full page reload.
function applyAuthUser(u?: AuthUser | null) {
  if (!u) return;
  const name = u.name || u.username || u.email?.split('@')[0] || '';
  store.state.user.authed = true;
  store.state.user.id = u.id || '';
  store.state.user.email = u.email || '';
  store.state.user.name = name;
  store.state.user.avatarInitial = name[0]?.toUpperCase() || 'C';
  store.state.user.avatarUrl = u.avatarUrl || null;
  store.state.user.role = u.role || 'user';
  store.state.user.kycLevel = u.kycLevel ?? 1;
  store.state.user.frozen = !!u.banned;
  store.state.user.frozenReason = u.banned ? (u.banReason || null) : null;
  // adminCategory is null for superadmin (sees all) and for non-admins.
  // Category admins get their category set here so AdminApp can land them
  // in the correct window on first paint.
  store.state.user.adminCategory = u.role === 'admin' ? (u.adminCategory || null) : null;
  store.commit();
}

export const authApi = {
  async signIn(data: SignInData): Promise<Result> {
    // Rate limit: max 3 attempts per minute per email
    const rateLimitKey = `signin_${data.email}`;
    if (isRateLimited(rateLimitKey, 3, 60000)) {
      return { ok: false, message: getRateLimitErrorMessage(rateLimitKey) };
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (res.ok) {
        // Reset rate limit on success
        resetRateLimit(rateLimitKey);
        // Cooldown is over as far as the server is concerned — drop any
        // stale client-side countdown so AuthPage never shows it again after
        // a successful sign-in.
        authService.clearCooldown();

        const loginBody = await res.json();
        // Signing in over an account that is still live in this browser must
        // not inherit its wallet, vault or address book. Same-account re-login
        // keeps them, so a personal device doesn't lose its encrypted phrase.
        const incomingId = loginBody?.user?.id;
        if (incomingId && store.state.user.id && store.state.user.id !== incomingId) {
          store.reset();
        }
        if (typeof loginBody?.expiresAt === 'number') {
          authService.setSession(loginBody.expiresAt);
        }
        applyAuthUser(loginBody?.user);
        
        // Determine redirect based on role — admin/superadmin go to admin panel,
        // regular users go to dashboard
        const role = store.state.user.role;
        const adminRedirect = (role === 'admin' || role === 'superadmin') ? '/admin' : '/';
        
        // Check KYC status after login
        const meRes = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (meRes.ok) {
          const meBody = await meRes.json();
          if (typeof meBody?.expiresAt === 'number') {
            authService.setSession(meBody.expiresAt);
          }
          if (meBody.user?.kycLevel === 1 && role === 'user') {
            // KYC not completed for regular user — dashboard shows the KYC gate modal
            window.location.hash = "/";
            return { ok: true };
          }
          // KYC completed or admin/superadmin (they bypass KYC gate), go to role-based destination
          window.location.hash = adminRedirect;
        } else {
          // /me failed but login succeeded — still redirect based on role
          window.location.hash = adminRedirect;
        }
        return { ok: true };
      }

      const error = await res.json();
      // Session-expiry cooldown (backend middleware/sessionCooldown.js):
      // structured 423 — arm the client countdown from the server's own
      // remaining seconds and let AuthPage render the lockout card.
      if (res.status === 423 && error?.error === 'login_cooldown' && typeof error.retryAfterSeconds === 'number') {
        authService.setCooldownUntil(Date.now() + error.retryAfterSeconds * 1000);
        return { ok: false, message: error.error, cooldownSeconds: error.retryAfterSeconds };
      }
      return { ok: false, message: describeAuthError(error, "Login failed") };
    } catch (err) {
      return { ok: false, message: "Network error. Please try again." };
    }
  },

  async signUp(data: SignUpData): Promise<Result> {
    // Rate limit: max 3 attempts per minute per email
    const rateLimitKey = `signup_${data.email}`;
    if (isRateLimited(rateLimitKey, 3, 60000)) {
      return { ok: false, message: getRateLimitErrorMessage(rateLimitKey) };
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The form field is called `referral` but the backend register
        // controller reads `referralCode` (authController.assignReferralCode);
        // sending `referral` left it undefined so referrers were never credited.
        // An empty referral must be OMITTED, not sent as "" — the backend
        // schema rejected "" with "referral code is not allowed to be empty",
        // failing every signup without an invite code (live bug 2026-11-02).
        body: JSON.stringify({ email: data.email, password: data.password, referralCode: data.referral.trim() || undefined }),
        credentials: "include",
      });

      if (res.ok) {
        // Reset rate limit on success
        resetRateLimit(rateLimitKey);

        const body = await res.json();
        // A fresh account must not inherit the previous device user's store:
        // without this the dashboard mounts with the old wallet address and the
        // cipher wall offers to decrypt a mnemonic that was never theirs.
        store.reset();
        if (typeof body?.expiresAt === 'number') {
          authService.setSession(body.expiresAt);
        }
        applyAuthUser(body?.user);
        // After successful signup, go to dashboard (KYC gate modal handles verification)
        window.location.hash = "/";
        return { ok: true };
      }

      const error = await res.json();
      return { ok: false, message: describeAuthError(error, "Registration failed") };
    } catch (err) {
      return { ok: false, message: "Network error. Please try again." };
    }
  },

  async google(): Promise<Result> {
    // Start Google OAuth flow - backend will handle the redirect
    try {
      // Get any referral code from URL
      const ref = new URLSearchParams(window.location.hash.split("?")[1] || "").get("ref");
      const googleUrl = `${API_BASE}/auth/google${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
      
      // Redirect to Google OAuth endpoint
      window.location.href = googleUrl;
      return { ok: true };
    } catch (err) {
      return { ok: false, message: "Could not start Google login" };
    }
  },

  async forgot(): Promise<Result> {
    // TODO: Open your password reset flow here.
    return { ok: true };
  },
};
