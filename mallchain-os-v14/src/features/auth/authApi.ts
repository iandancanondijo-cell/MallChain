import { authService } from '../../services/auth';
import { store } from '../../store/store';

export type Result = { ok: boolean; message?: string };
export type SignInData = { email: string; password: string; remember: boolean };
export type SignUpData = { email: string; password: string; referral: string };

const API_BASE = '/api';

type AuthUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  role?: 'user' | 'admin' | 'superadmin';
  banned?: boolean;
  banReason?: string | null;
  kycLevel?: number;
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
  store.commit();
}

export const authApi = {
  async signIn(data: SignInData): Promise<Result> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (res.ok) {
        const loginBody = await res.json();
        if (typeof loginBody?.expiresAt === 'number') {
          authService.setSession(loginBody.expiresAt);
        }
        applyAuthUser(loginBody?.user);
        // Check KYC status after login
        const meRes = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (meRes.ok) {
          const meBody = await meRes.json();
          if (typeof meBody?.expiresAt === 'number') {
            authService.setSession(meBody.expiresAt);
          }
          if (meBody.user?.kycLevel === 1) {
            // KYC not completed — dashboard shows the KYC gate modal
            window.location.hash = "/";
            return { ok: true };
          }
          // KYC completed, go to dashboard
          window.location.hash = "/";
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
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (res.ok) {
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
