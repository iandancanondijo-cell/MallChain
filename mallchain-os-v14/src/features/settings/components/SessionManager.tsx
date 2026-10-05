import { useEffect, useState, useCallback } from 'react';
import { sessionApi, type Session } from '../../../services/sessionApi';
import { useStoreVersion, toast } from '../../../components/ui';

/**
 * SessionManager Component
 * Displays active user sessions and allows terminating specific sessions
 * or logging out all other sessions
 */
export function SessionManager() {
  useStoreVersion();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [terminating, setTerminating] = useState<string | null>(null);

  /**
   * Load active sessions from API
   */
  const loadSessions = useCallback(async () => {
    setLoading(true);
    const res = await sessionApi.listSessions();
    if (res.ok && res.data?.sessions) {
      setSessions(res.data.sessions);
    } else {
      toast(res.error || 'Failed to load sessions', false);
    }
    setLoading(false);
  }, []);

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /**
   * Logout a specific session
   */
  const logoutSession = async (sessionId: string) => {
    setTerminating(sessionId);
    const res = await sessionApi.logoutSession(sessionId);
    setTerminating(null);
    
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      toast('Session terminated');
    } else {
      toast(res.error || 'Failed to terminate session', false);
    }
  };

  /**
   * Logout all sessions except the current one
   */
  const logoutAllOthers = async () => {
    if (!window.confirm('Log out all other sessions? You\'ll need to log in again on those devices.')) return;
    
    setTerminating('all');
    const res = await sessionApi.logoutAllOthers();
    setTerminating(null);

    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast(`All other sessions terminated (${res.data?.loggedOut || 0} sessions)`);
    } else {
      toast(res.error || 'Failed to logout sessions', false);
    }
  };

  if (loading) {
    return <div className="tiny">Loading sessions…</div>;
  }

  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  // Get emoji for device type
  const getDeviceEmoji = (device: string) => {
    switch (device) {
      case 'mobile':
        return '📱';
      case 'tablet':
        return '📱';
      default:
        return '🖥️';
    }
  };

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Active Sessions</h2></div>
      <div className="tiny" style={{ marginBottom: 14, color: 'var(--txt-3)' }}>
        Manage your active sessions across devices. Terminate sessions you don't recognize.
      </div>

      {currentSession && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 8, fontWeight: 600 }}>
            Current Session
          </div>
          <div
            style={{
              padding: 12,
              border: '1px solid var(--outline)',
              borderRadius: 8,
              backgroundColor: 'var(--surface-alt)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 18, marginRight: 12 }}>
                {getDeviceEmoji(currentSession.device)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {currentSession.browser} on {currentSession.os}
                </div>
                <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 2 }}>
                  📍 {currentSession.city}, {currentSession.country} • This is your current session
                </div>
              </div>
              <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
                Active
              </span>
            </div>
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              Last active: {formatDate(currentSession.lastActivityAt)} • Created: {new Date(currentSession.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}

      {otherSessions.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 8, fontWeight: 600 }}>
            Other Sessions ({otherSessions.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {otherSessions.map((session) => (
              <div
                key={session._id}
                style={{
                  padding: 12,
                  border: '1px solid var(--outline)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ fontSize: 16, marginRight: 12 }}>
                    {getDeviceEmoji(session.device)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {session.browser} on {session.os}
                    </div>
                    <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 2 }}>
                      📍 {session.city}, {session.country}
                    </div>
                    <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 2 }}>
                      Last active: {formatDate(session.lastActivityAt)}
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => logoutSession(session._id)}
                  disabled={terminating !== null}
                  style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                >
                  {terminating === session._id && <span className="spin" />}
                  {terminating === session._id ? 'Logging out…' : 'Logout'}
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn btn-ghost btn-block"
            onClick={logoutAllOthers}
            disabled={terminating !== null}
          >
            {terminating === 'all' && <span className="spin" />}
            {terminating === 'all' ? 'Logging out…' : `Logout All ${otherSessions.length} Other Sessions`}
          </button>
        </div>
      ) : (
        <div className="tiny" style={{ color: 'var(--txt-3)', textAlign: 'center', padding: '12px 0' }}>
          No other active sessions
        </div>
      )}

      <div className="tiny" style={{ marginTop: 14, padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>💡 Tip:</strong> Sessions automatically expire after 24 hours of inactivity. Refresh this page to see the latest session data.
      </div>
    </div>
  );
}
