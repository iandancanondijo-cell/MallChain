import { api } from './api';

export interface Session {
  _id: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  lastActivityAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface SessionListResponse {
  sessions: Session[];
}

export interface LogoutResponse {
  success: boolean;
  loggedOut?: number;
}

/**
 * Session management API service
 * Handles user session listing, logout, and verification
 */
export const sessionApi = {
  /**
   * Get all active sessions for the current user
   */
  async listSessions() {
    return api.get<SessionListResponse>('/api/sessions');
  },

  /**
   * Logout a specific session
   * @param sessionId - The session ID to logout
   */
  async logoutSession(sessionId: string) {
    return api.post<LogoutResponse>(`/api/sessions/${sessionId}/logout`);
  },

  /**
   * Logout all other sessions except the current one
   */
  async logoutAllOthers() {
    return api.post<LogoutResponse>('/api/sessions/logout-all-others');
  },

  /**
   * Verify a session is still active (update lastActivityAt)
   * @param sessionId - The session ID to verify
   */
  async verifySession(sessionId: string) {
    return api.post<{ success: boolean }>(`/api/sessions/${sessionId}/verify`);
  },
};
