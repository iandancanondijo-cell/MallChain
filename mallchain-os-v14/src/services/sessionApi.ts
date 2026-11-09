import { api, type ApiResult } from './api';

/**
 * Mirrors backend/src/routes/sessions.js. Every field is what the server
 * actually recorded for that session; null means it was never stated by the
 * request (there is no GeoIP lookup wired up, and the token does not carry a
 * login method), NOT "unknown place" or "unknown device".
 */
export interface Session {
  id: string;
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string | null;
  os: string | null;
  automatedClient: boolean;
  loginMethod: string | null;
  location: { country: string | null; city: string | null };
  ipAddress: string | null;
  startedAt: string;
  lastActivityAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SessionPolicy {
  /** Minutes a session lasts from sign-in — read from the server, never hardcoded here. */
  ttlMinutes: number;
  /** Sessions end at a fixed time; being active does not push it back. */
  renewsOnActivity: boolean;
  endsAt: string | null;
}

export interface SessionListResponse {
  sessions: Session[];
  policy: SessionPolicy;
  /** False when this token predates session tracking and so has no row. */
  currentSessionTracked: boolean;
}

export interface SessionVerification {
  ok: boolean;
  active: boolean;
  tracked: boolean;
  expiresAt: string | null;
  reason?: string;
}

export type ErrorCode = 'session_not_found' | 'current_session_not_terminable' | 'current_session_untracked' | string;

/** The stable `details.code` a failed sessions call came back with. */
export function sessionErrorCode(res: ApiResult): string | null {
  const details = res.details as { code?: string } | undefined;
  return details?.code ?? null;
}

export const sessionApi = {
  /** Every session the server still considers live for this account. */
  async listSessions() {
    return api.get<SessionListResponse>('/api/sessions');
  },

  /**
   * End one session by its id. The backend also revokes that session's token
   * (Redis denylist), so the other device is signed out rather than merely
   * removed from this list.
   */
  async logoutSession(sessionId: string) {
    return api.post<{ ok: boolean; terminated: boolean; id: string }>(
      `/api/sessions/${sessionId}/logout`
    );
  },

  /** End every session except the one making this request. */
  async logoutAllOthers() {
    return api.post<{ ok: boolean; loggedOut: number }>('/api/sessions/logout-all-others');
  },

  /**
   * Ask the server whether THIS session is still live and when it ends.
   * Replaces verifySession(sessionId), which let any caller stamp any other
   * user's session as active.
   */
  async verifyCurrentSession() {
    return api.post<SessionVerification>('/api/sessions/verify-current');
  },
};
