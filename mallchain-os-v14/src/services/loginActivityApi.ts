import { api } from './api';

/**
 * Mirrors backend/src/routes/loginActivity.js, which reads the rows written
 * by services/sessionRegistry.js. A null here means the request never stated
 * the value (or no GeoIP lookup is wired up) — the panel must not render it
 * as if it were an observation, which is what the old 'Unknown' strings were.
 */
export interface LoginActivity {
  id: string;
  success: boolean;
  failureReason: string | null;
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  timestamp: string;
  riskScore: number;
  suspicious: boolean;
  suspiciousReasons: string[];
  loginMethod: string | null;
  mfaUsed: boolean;
}

export interface LoginActivityResponse {
  activities: LoginActivity[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
}

export interface FailedAttemptsResponse {
  failedAttempts: LoginActivity[];
  total: number;
  limit: number;
  skip: number;
}

export interface SuspiciousAttemptsResponse {
  suspiciousAttempts: LoginActivity[];
  total: number;
  limit: number;
  skip: number;
}

export interface RecentIP {
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  lastSeen: string;
  loginCount: number;
}

export interface RecentIPsResponse {
  recentIPs: RecentIP[];
}

export const loginActivityApi = {
  /** Sign-in history, newest first. `status` filters server-side. */
  async getLoginActivity(limit = 50, skip = 0, status: 'all' | 'success' | 'failed' = 'all') {
    return api.get<LoginActivityResponse>(
      `/api/login-activity?limit=${limit}&skip=${skip}&status=${status}`
    );
  },

  async getFailedAttempts(limit = 20, skip = 0) {
    return api.get<FailedAttemptsResponse>(`/api/login-activity/failed?limit=${limit}&skip=${skip}`);
  },

  async getSuspiciousAttempts(limit = 20, skip = 0) {
    return api.get<SuspiciousAttemptsResponse>(`/api/login-activity/suspicious?limit=${limit}&skip=${skip}`);
  },

  async getRecentIPs() {
    return api.get<RecentIPsResponse>('/api/login-activity/recent-ips');
  },
};
