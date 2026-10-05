import { api } from './api';

export interface LoginActivity {
  _id: string;
  success: boolean;
  failureReason?: string | null;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  country: string;
  city: string;
  timestamp: string;
  riskScore: number;
  suspicious: boolean;
  suspiciousReasons: string[];
  loginMethod: string;
  mfaUsed: boolean;
}

export interface LoginActivityResponse {
  activities: LoginActivity[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
}

export interface FailedAttempt {
  _id: string;
  failureReason: string;
  ipAddress: string;
  country: string;
  timestamp: string;
  browser: string;
  os: string;
}

export interface FailedAttemptsResponse {
  failedAttempts: FailedAttempt[];
  total: number;
  limit: number;
  skip: number;
}

export interface SuspiciousAttempt {
  _id: string;
  riskScore: number;
  reasons: string[];
  ipAddress: string;
  country: string;
  timestamp: string;
  success: boolean;
}

export interface SuspiciousAttemptsResponse {
  suspiciousAttempts: SuspiciousAttempt[];
  total: number;
  limit: number;
  skip: number;
}

export interface RecentIP {
  ipAddress: string;
  country: string;
  city: string;
  lastSeen: string;
  loginCount: number;
}

export interface RecentIPsResponse {
  recentIPs: RecentIP[];
}

/**
 * Login Activity API service
 * Handles login attempt tracking and suspicious activity detection
 */
export const loginActivityApi = {
  /**
   * Get login attempt history for the current user
   * @param limit - Number of records to return (default 50)
   * @param skip - Number of records to skip for pagination (default 0)
   * @param status - Filter by status: 'all', 'success', or 'failed' (default 'all')
   */
  async getLoginActivity(limit = 50, skip = 0, status: 'all' | 'success' | 'failed' = 'all') {
    return api.get<LoginActivityResponse>('/api/login-activity?limit=' + limit + '&skip=' + skip + '&status=' + status);
  },

  /**
   * Get only failed login attempts
   * @param limit - Number of records to return (default 20)
   * @param skip - Number of records to skip for pagination (default 0)
   */
  async getFailedAttempts(limit = 20, skip = 0) {
    return api.get<FailedAttemptsResponse>('/api/login-activity/failed?limit=' + limit + '&skip=' + skip);
  },

  /**
   * Get suspicious login attempts
   * @param limit - Number of records to return (default 20)
   * @param skip - Number of records to skip for pagination (default 0)
   */
  async getSuspiciousAttempts(limit = 20, skip = 0) {
    return api.get<SuspiciousAttemptsResponse>('/api/login-activity/suspicious?limit=' + limit + '&skip=' + skip);
  },

  /**
   * Get recently used IP addresses
   */
  async getRecentIPs() {
    return api.get<RecentIPsResponse>('/api/login-activity/recent-ips');
  },
};
