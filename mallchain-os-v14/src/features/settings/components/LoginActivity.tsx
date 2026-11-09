import { useCallback, useEffect, useState } from 'react';
import { loginActivityApi, type LoginActivity } from '../../../services/loginActivityApi';
import { EmptyState, toast, useStoreVersion } from '../../../components/ui';

type FilterStatus = 'all' | 'success' | 'failed';

const PAGE_SIZE = 10;

/**
 * LoginActivity — sign-in history as the server recorded it.
 *
 * Two claims this panel used to make that nothing supported: it promised
 * "recent login attempts and account access history" while no code had ever
 * written a LoginActivity row (the only writer was a POST endpoint no client
 * called), and it turned a bare `riskScore` number into a "High/Medium/Low
 * risk" verdict the backend never issued. The list is now written by
 * services/sessionRegistry.js at the moment a token is issued or a credential
 * is rejected, and the only verdict shown is the server's own `suspicious`
 * flag with the reasons behind it.
 */
export function LoginActivityComponent() {
  useStoreVersion();
  // null = never loaded successfully; [] = loaded and there is nothing to show
  const [activities, setActivities] = useState<LoginActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const loadActivity = useCallback(
    async (newPage = 0) => {
      setLoading(true);
      setLoadError(null);
      const res = await loginActivityApi.getLoginActivity(PAGE_SIZE, newPage * PAGE_SIZE, filterStatus);

      if (res.ok && res.data) {
        const rows = res.data.activities || [];
        setActivities((prev) => (newPage === 0 || prev === null ? rows : [...prev, ...rows]));
        setHasMore(Boolean(res.data.hasMore));
        setPage(newPage);
      } else if (newPage === 0) {
        // A failed first page replaces the list, so it needs its own state;
        // a failed "show older" leaves the list on screen and only needs a
        // toast, or the whole panel would disappear over one bad page.
        setLoadError(res.error || 'Could not load your sign-in history.');
        setActivities(null);
      } else {
        toast(res.error || 'Could not load older sign-ins. Try again.', false);
      }
      setLoading(false);
    },
    [filterStatus]
  );

  useEffect(() => {
    loadActivity(0);
  }, [loadActivity]);

  const flag = (activity: LoginActivity) =>
    activity.success
      ? { text: 'Signed in', tone: 'var(--green)' }
      : { text: 'Rejected', tone: 'var(--red)' };

  return (
    <div className="card mb">
      <div className="sec-title">
        <h2>Login activity</h2>
        <span className="sub">
          {activities === null && !loading
            ? 'Not loaded'
            : filterStatus === 'failed'
              ? 'Rejected sign-ins · newest first'
              : filterStatus === 'success'
                ? 'Successful sign-ins · newest first'
                : 'Every recorded attempt · newest first'}
        </span>
        <button className="sec-link" onClick={() => loadActivity(page)} disabled={loading}>
          {loading ? <span className="spin" /> : null}
          Refresh
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {(['all', 'success', 'failed'] as const).map((status) => (
          <button
            key={status}
            className={`btn btn-sm ${filterStatus === status ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setFilterStatus(status);
              setActivities(null);
              setPage(0);
            }}
            disabled={loading}
          >
            {status === 'all' ? 'Everything' : status === 'success' ? 'Signed in' : 'Rejected'}
          </button>
        ))}
      </div>

      {loading && activities === null ? (
        <>
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer" style={{ height: 52, borderRadius: 10, marginBottom: 10 }} />
          ))}
          <div className="tiny" style={{ color: 'var(--txt-3)' }}>Loading sign-in history…</div>
        </>
      ) : loadError && activities === null ? (
        <EmptyState
          icon="⚠️"
          title="Sign-in history unavailable"
          message={loadError}
          cta={
            <button className="btn btn-ghost btn-sm" onClick={() => loadActivity(0)} disabled={loading}>
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          }
        />
      ) : activities && activities.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.map((activity) => {
            const isExpanded = expandedId === activity.id;
            const badge = flag(activity);
            const place = [activity.city, activity.country].filter(Boolean).join(', ');

            return (
              <div
                key={activity.id}
                className="card-hover"
                style={{
                  border: '1px solid var(--outline)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  backgroundColor: activity.suspicious ? 'rgba(239, 68, 68, 0.04)' : undefined,
                }}
                onClick={() => setExpandedId(isExpanded ? null : activity.id)}
              >
                <div
                  style={{
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div className="row" style={{ gap: 10, flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 18, lineHeight: '20px' }}>{deviceGlyph(activity.device)}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{deviceLine(activity)}</div>
                      <div className="tiny" style={{ marginTop: 2 }}>
                        {formatRelativeTime(activity.timestamp)}
                        {place ? ` · ${place}` : ' · location not recorded'}
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    {activity.suspicious && (
                      <span className="chip red" title="Flagged by this server's rules">
                        ⚠ Flagged
                      </span>
                    )}
                    <span className="chip" style={{ color: badge.tone, borderColor: badge.tone }}>
                      {activity.success ? '✓' : '✕'} {badge.text}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--outline)',
                      padding: 12,
                      backgroundColor: 'var(--surface-alt)',
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <Detail label="Network address" value={activity.ipAddress || 'Not stated by the request'} mono />
                    <Detail label="Location" value={place || 'Not resolved — no IP-to-location lookup is configured'} />
                    <Detail label="Method" value={methodLabel(activity.loginMethod)} />
                    <Detail
                      label="Second factor"
                      value={
                        activity.mfaUsed
                          ? 'Verified with your authenticator or a backup code'
                          : 'Not used for this attempt'
                      }
                    />
                    {!activity.success && <Detail label="Why it was rejected" value={reasonLabel(activity.failureReason)} />}
                    <Detail label="Risk score" value={`${activity.riskScore}/100 on this server's scale`} />
                    {activity.suspicious && activity.suspiciousReasons.length > 0 && (
                      <div>
                        <div className="tiny" style={{ fontWeight: 600, color: 'var(--txt-3)', marginBottom: 4 }}>
                          FLAGGED BECAUSE
                        </div>
                        <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                          {activity.suspiciousReasons.map((reason, idx) => (
                            <li key={idx} className="tiny" style={{ marginBottom: 2, color: 'var(--txt-2)' }}>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button className="btn btn-ghost btn-block" onClick={() => loadActivity(page + 1)} disabled={loading}>
              {loading ? <span className="spin" /> : null}
              {loading ? 'Loading…' : 'Show 10 older'}
            </button>
          )}
        </div>
      ) : (
        <EmptyState
          icon="🗒️"
          title={filterStatus === 'failed' ? 'No rejected sign-ins' : 'No sign-ins recorded yet'}
          message={
            filterStatus === 'failed'
              ? 'Every sign-in attempt stored for your account succeeded.'
              : 'Sign-in history begins with the first session issued to your account on this server.'
          }
        />
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
        <strong>If you do not recognise an entry:</strong> sign out the other devices in Active
        sessions above, then change your password — an entry here is a token this server issued, so
        ending that session stops it working immediately. Entries are kept for 90 days.
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="tiny" style={{ fontWeight: 600, color: 'var(--txt-3)' }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: mono ? 12 : 13,
          fontWeight: 600,
          marginTop: 2,
          fontFamily: mono ? 'monospace' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const DEVICE_GLYPH: Record<string, string> = {
  desktop: '🖥️',
  mobile: '📱',
  tablet: '📱',
  // 'unknown' = the request stated nothing usable; a desktop icon would be a
  // guess drawn as a fact.
  unknown: '•',
};

function deviceGlyph(device: string) {
  return DEVICE_GLYPH[device] ?? '•';
}

function deviceLine(activity: LoginActivity) {
  const parts = [activity.browser, activity.os].filter(Boolean);
  return parts.length ? parts.join(' on ') : 'Device did not identify itself';
}

function methodLabel(method: string | null) {
  switch (method) {
    case 'password':
      return 'Password';
    case 'google':
      return 'Google account';
    case null:
      return 'Not recorded';
    default:
      return method;
  }
}

const REASONS: Record<string, string> = {
  invalid_credentials: 'The password did not match this account',
  mfa_failed: 'The password matched, but the second factor did not',
  account_locked: 'Sign-ins are paused on this account after repeated failures',
  login_cooldown: 'A session had just ended, so sign-in is paused briefly',
  unknown: 'A rejection was recorded without a reason',
};

function reasonLabel(reason: string | null) {
  if (!reason) return REASONS.unknown;
  return REASONS[reason] ?? reason;
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Time not recorded';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
