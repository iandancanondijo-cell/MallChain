import { authService } from '../../services/auth';
import { store } from '../../store/store';
import { isRateLimited, getRateLimitErrorMessage, resetRateLimit } from '../../services/rateLimit';
import { config } from '../../services/config';

export type Result = { ok: boolean; message?: string };
export type SignInData = { email: string; password: string; remember: boolean };
export type SignUpData = { email: string; password: string; referral: string };

const API_BASE = `${config.apiBaseUrl}/api`;

type AuthUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
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

        const loginBody = await res.json();
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
      return { ok: false, message: error.error || "Login failed" };
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
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (res.ok) {
        // Reset rate limit on success
        resetRateLimit(rateLimitKey);

        const body = await res.json();
        if (typeof body?.expiresAt === 'number') {
          authService.setSession(body.expiresAt);
        }
        applyAuthUser(body?.user);
        // After successful signup, go to dashboard (KYC gate modal handles verification)
        window.location.hash = "/";
        return { ok: true };
      }

      const error = await res.json();
      return { ok: false, message: error.error || "Registration failed" };
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
