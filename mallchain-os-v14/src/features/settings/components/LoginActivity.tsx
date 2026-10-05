import { useEffect, useState, useCallback } from 'react';
import { loginActivityApi, type LoginActivity } from '../../../services/loginActivityApi';
import { useStoreVersion, toast } from '../../../components/ui';

type FilterStatus = 'all' | 'success' | 'failed';

/**
 * LoginActivity Component
 * Displays login attempt history with filtering and details
 */
export function LoginActivityComponent() {
  useStoreVersion();
  const [activities, setActivities] = useState<LoginActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const ITEMS_PER_PAGE = 10;

  /**
   * Load login activity from API
   */
  const loadActivity = useCallback(
    async (newPage = 0) => {
      setLoading(true);
      const res = await loginActivityApi.getLoginActivity(
        ITEMS_PER_PAGE,
        newPage * ITEMS_PER_PAGE,
        filterStatus
      );

      if (res.ok && res.data) {
        if (newPage === 0) {
          setActivities(res.data?.activities || []);
        } else {
          setActivities((prev) => [...prev, ...(res.data?.activities || [])]);
        }
        setHasMore(res.data?.hasMore || false);
        setPage(newPage);
      } else {
        toast(res.error || 'Failed to load login activity', false);
      }
      setLoading(false);
    },
    [filterStatus]
  );

  // Load activity on mount and when filter changes
  useEffect(() => {
    loadActivity(0);
  }, [loadActivity]);

  const handleLoadMore = () => {
    loadActivity(page + 1);
  };

  // Get risk level text and color
  const getRiskLevel = (riskScore: number) => {
    if (riskScore >= 50) return { text: 'High', color: 'var(--red)' };
    if (riskScore >= 25) return { text: 'Medium', color: 'var(--gold)' };
    if (riskScore >= 10) return { text: 'Low', color: 'var(--green)' };
    return { text: 'Very Low', color: 'var(--txt-3)' };
  };

  // Get status badge text and color
  const getStatusBadge = (success: boolean) => {
    return success
      ? { text: 'Success', color: 'var(--green)', emoji: '✓' }
      : { text: 'Failed', color: 'var(--red)', emoji: '✕' };
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  // Get device emoji
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

  if (loading && activities.length === 0) {
    return <div className="tiny">Loading login activity…</div>;
  }

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Login Activity</h2></div>
      <div className="tiny" style={{ marginBottom: 14, color: 'var(--txt-3)' }}>
        View your recent login attempts and account access history.
      </div>

      {/* Filter buttons */}
      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'success', 'failed'] as const).map((status) => (
          <button
            key={status}
            className={`btn btn-sm ${filterStatus === status ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setFilterStatus(status);
              setActivities([]);
              setPage(0);
            }}
          >
            {status === 'all' ? 'All' : status === 'success' ? 'Successful' : 'Failed'}
          </button>
        ))}
      </div>

      {/* Activity list */}
      {activities.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.map((activity) => {
            const isExpanded = expandedId === activity._id;
            const riskLevel = getRiskLevel(activity.riskScore);
            const statusBadge = getStatusBadge(activity.success);

            return (
              <div
                key={activity._id}
                style={{
                  border: '1px solid var(--outline)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setExpandedId(isExpanded ? null : activity._id)}
              >
                {/* Summary row */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 18 }}>{getDeviceEmoji(activity.device)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {activity.browser} on {activity.os}
                      </div>
                      <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 2 }}>
                        {formatRelativeTime(activity.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {activity.suspicious && (
                      <span className="chip" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                        ⚠ Suspicious
                      </span>
                    )}
                    <span
                      className="chip"
                      style={{ color: statusBadge.color, borderColor: statusBadge.color }}
                    >
                      {statusBadge.emoji} {statusBadge.text}
                    </span>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--outline)', padding: 12, backgroundColor: 'var(--surface-alt)' }}>
                    {/* Location & Device Info */}
                    <div style={{ marginBottom: 12 }}>
                      <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                        📍 LOCATION & DEVICE
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div className="tiny" style={{ color: 'var(--txt-3)' }}>IP Address</div>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>
                            {activity.ipAddress}
                          </div>
                        </div>
                        <div>
                          <div className="tiny" style={{ color: 'var(--txt-3)' }}>Country</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                            {activity.country}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Security Info */}
                    <div style={{ marginBottom: 12 }}>
                      <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                        🔒 SECURITY
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div className="tiny" style={{ color: 'var(--txt-3)' }}>Risk Level</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: riskLevel.color }}>
                            {riskLevel.text} ({activity.riskScore}/100)
                          </div>
                        </div>
                        <div>
                          <div className="tiny" style={{ color: 'var(--txt-3)' }}>MFA Used</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: 'var(--green)' }}>
                            {activity.mfaUsed ? '✓ Yes' : '✕ No'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Login Method */}
                    <div style={{ marginBottom: 12 }}>
                      <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                        LOGIN METHOD
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {activity.loginMethod === 'password' ? '🔐 Password' : activity.loginMethod}
                      </div>
                    </div>

                    {/* Failure reason (if failed) */}
                    {!activity.success && activity.failureReason && (
                      <div style={{ marginBottom: 12 }}>
                        <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                          ✕ FAILURE REASON
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
                          {activity.failureReason}
                        </div>
                      </div>
                    )}

                    {/* Suspicious reasons (if flagged) */}
                    {activity.suspicious && activity.suspiciousReasons.length > 0 && (
                      <div>
                        <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                          ⚠️ SUSPICIOUS REASONS
                        </div>
                        <ul style={{ margin: '0 0 0 20px', padding: 0 }}>
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
        </div>
      ) : (
        <div className="tiny" style={{ color: 'var(--txt-3)', textAlign: 'center', padding: '20px 0' }}>
          {filterStatus === 'failed' ? 'No failed login attempts' : 'No login activity found'}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <button
          className="btn btn-ghost btn-block"
          onClick={handleLoadMore}
          disabled={loading}
          style={{ marginTop: 12 }}
        >
          {loading ? 'Loading…' : 'Load More'}
        </button>
      )}

      {/* Security tip */}
      <div className="tiny" style={{ marginTop: 14, padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>💡 Security Tip:</strong> If you see login attempts you don't recognize, change your password immediately and enable MFA if you haven't already.
      </div>
    </div>
  );
}
