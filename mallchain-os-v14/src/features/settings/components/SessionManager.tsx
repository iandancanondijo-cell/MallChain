import { useCallback, useEffect, useState } from 'react';
import {
  sessionApi,
  sessionErrorCode,
  type Session,
  type SessionPolicy,
} from '../../../services/sessionApi';
import { EmptyState, toast, useStoreVersion } from '../../../components/ui';

/**
 * SessionManager — the devices the server says are signed in as you.
 *
 * Everything on screen comes from GET /api/sessions: the rows, which row is
 * "you", and how long a session lasts. It used to render a hardcoded
 * "sessions automatically expire after 24 hours of inactivity" note above a
 * table that could never contain anything, because nothing wrote a session
 * row and the "which one is mine" check read an Authorization header that a
 * cookie-authenticated frontend never sends. The policy line below is now
 * derived from the same SESSION_TTL_MIN the token is signed with, and it says
 * plainly that activity does not extend a session — because it does not.
 */
export function SessionManager() {
  useStoreVersion();
  // null = never successfully loaded (distinct from [] = loaded, nothing else
  // signed in). The old component collapsed both into "No other active
  // sessions", which made a server error look like a clean account.
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [policy, setPolicy] = useState<SessionPolicy | null>(null);
  const [tracked, setTracked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [terminating, setTerminating] = useState<string | null>(null);
  // Ticks so "ends in 23 min" and "active 2m ago" stay honest without a
  // refetch every half-minute.
  const [now, setNow] = useState(() => Date.now());

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await sessionApi.listSessions();
    if (res.ok && res.data) {
      setSessions(res.data.sessions ?? []);
      setPolicy(res.data.policy ?? null);
      setTracked(res.data.currentSessionTracked !== false);
    } else {
      setSessions(null);
      setLoadError(res.error || 'Could not load your active sessions.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const endSession = async (session: Session) => {
    setTerminating(session.id);
    const res = await sessionApi.logoutSession(session.id);
    setTerminating(null);

    if (res.ok) {
      setSessions((prev) => (prev || []).filter((s) => s.id !== session.id));
      toast('That device is signed out. Its token is revoked, so it stops working immediately.');
      return;
    }
    if (sessionErrorCode(res) === 'current_session_not_terminable') {
      toast(res.error || 'That is the session you are using now — use Sign out instead.', false);
      loadSessions();
      return;
    }
    toast(res.error || 'Could not end that session. Try again in a moment.', false);
  };

  const endAllOthers = async () => {
    const others = (sessions || []).filter((s) => !s.isCurrent).length;
    if (!others) return;
    if (!window.confirm(`Sign out the other ${others} session${others === 1 ? '' : 's'}? Each device will have to sign in again.`)) return;

    setTerminating('all');
    const res = await sessionApi.logoutAllOthers();
    setTerminating(null);

    if (res.ok) {
      setSessions((prev) => (prev || []).filter((s) => s.isCurrent));
      const closed = res.data?.loggedOut ?? 0;
      toast(
        closed
          ? `Signed out ${closed} other session${closed === 1 ? '' : 's'}.`
          : 'No other session was still open — this list was already up to date.'
      );
      return;
    }
    toast(res.error || 'Could not sign out your other sessions. Try again in a moment.', false);
  };

  const current = sessions?.find((s) => s.isCurrent) || null;
  const others = (sessions || []).filter((s) => !s.isCurrent);

  if (loading && sessions === null) {
    return (
      <div className="card mb">
        <div className="sec-title">
          <h2>Active sessions</h2>
          <span className="sub">Checking which devices are signed in…</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer" style={{ height: 58, borderRadius: 10, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card mb">
        <div className="sec-title">
          <h2>Active sessions</h2>
        </div>
        <EmptyState
          icon="⚠️"
          title="Sessions could not be loaded"
          message={loadError}
          cta={
            <button className="btn btn-ghost btn-sm" onClick={loadSessions} disabled={loading}>
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="card mb">
      <div className="sec-title">
        <h2>Active sessions</h2>
        <span className="sub">
          {sessions === null
            ? 'Not loaded'
            : `${sessions.length} signed in${policy ? ` · sessions last ${policy.ttlMinutes} min` : ''}`}
        </span>
        <button
          className="sec-link"
          onClick={loadSessions}
          disabled={loading}
          title="Reload from the server"
        >
          {loading ? <span className="spin" /> : null}
          Refresh
        </button>
      </div>

      {!tracked && (
        <div
          className="tiny"
          style={{
            marginBottom: 14,
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--gold)',
            color: 'var(--txt-2)',
          }}
        >
          This sign-in predates session tracking, so it cannot be told apart from your other
          devices and per-device controls are disabled for it. Signing out and back in fixes that.
        </div>
      )}

      {current && (
        <div style={{ marginBottom: 16 }}>
          <div className="card-label" style={{ marginBottom: 8 }}>
            This device
          </div>
          <div
            style={{
              padding: 12,
              border: '1px solid var(--outline)',
              borderRadius: 10,
              backgroundColor: 'var(--surface-alt)',
            }}
          >
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 18, lineHeight: '20px' }}>{deviceGlyph(current.device)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{deviceLine(current)}</div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {describeSession(current, now)}
                </div>
              </div>
              <span className="chip green">In use</span>
            </div>
            {policy?.endsAt && (() => {
              const remaining = minutesUntil(policy.endsAt, now);
              return (
                <div className="tiny" style={{ marginTop: 10, color: 'var(--txt-2)' }}>
                  Signs out automatically at {clockTime(policy.endsAt)}
                  {remaining !== null ? ` — about ${Math.abs(remaining)} min from now` : ''}
                  {remaining !== null && remaining <= 0 ? ' (this session has ended; sign in again to continue)' : ''}.
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {sessions === null ? null : others.length > 0 ? (
        <div>
          <div className="card-label" style={{ marginBottom: 8 }}>
            Other devices ({others.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {others.map((session) => (
              <div
                key={session.id}
                style={{
                  padding: 12,
                  border: '1px solid var(--outline)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div className="row" style={{ gap: 10, flex: 1, minWidth: 200, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 18, lineHeight: '20px' }}>{deviceGlyph(session.device)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{deviceLine(session)}</div>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {describeSession(session, now)}
                    </div>
                    {session.automatedClient && (
                      <div className="tiny" style={{ marginTop: 2, color: 'var(--gold)' }}>
                        A command-line or scripted client, not a browser.
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => endSession(session)}
                  disabled={terminating !== null}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {terminating === session.id && <span className="spin" />}
                  {terminating === session.id ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn btn-ghost btn-block"
            onClick={endAllOthers}
            disabled={terminating !== null || !tracked}
          >
            {terminating === 'all' && <span className="spin" />}
            {terminating === 'all'
              ? 'Signing out…'
              : `Sign out all ${others.length} other session${others.length === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : (
        <div className="tiny" style={{ color: 'var(--txt-3)', textAlign: 'center', padding: '12px 0' }}>
          No other device is signed in to this account.
        </div>
      )}

      <div
        className="tiny"
        style={{
          marginTop: 14,
          padding: 10,
          backgroundColor: 'var(--surface-alt)',
          borderRadius: 8,
          color: 'var(--txt-3)',
          lineHeight: 1.5,
        }}
      >
        <strong>How long a session lasts:</strong> {policy ? `${policy.ttlMinutes} minutes from sign-in` : 'a fixed time from sign-in'},
        then it ends on its own and you sign in again.{' '}
        {policy && policy.renewsOnActivity === false
          ? 'Using the app does not extend it.'
          : 'Whether activity extends it is not reported by this server.'}{' '}
        Signing a device out here revokes its token immediately rather than waiting for that
        time — so if you do not recognise a device above, sign it out and change your password.
      </div>
    </div>
  );
}

const DEVICE_GLYPH: Record<Session['device'], string> = {
  desktop: '🖥️',
  mobile: '📱',
  tablet: '📱',
  // 'unknown' means the request stated nothing usable — showing a desktop
  // monitor for it would be a guess presented as a fact.
  unknown: '•',
};

function deviceGlyph(device: Session['device']) {
  return DEVICE_GLYPH[device] ?? '•';
}

function deviceLine(session: Session) {
  const parts = [session.browser, session.os].filter(Boolean);
  return parts.length ? parts.join(' on ') : 'Browser not stated by the device';
}

function locationPart(session: Session) {
  const parts = [session.location?.city, session.location?.country].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(', ');
}

function clockTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minutesUntil(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 60000);
}

function describeSession(session: Session, now: number) {
  const bits: string[] = [];
  const place = locationPart(session);
  // No location was ever resolved for these sessions, so say what IS known
  // instead of the old '📍 Unknown, Unknown'.
  bits.push(place ? `📍 ${place}` : '📍 Location not recorded');
  if (session.ipAddress) bits.push(session.ipAddress);
  if (session.loginMethod === 'google') bits.push('via Google');
  if (session.loginMethod === 'refresh') bits.push('renewed without signing in again');
  bits.push(`active ${relativeTime(session.lastActivityAt, now)}`);
  bits.push(`signed in ${relativeTime(session.startedAt, now)}`);
  return bits.join(' · ');
}

function relativeTime(iso: string, now: number) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
