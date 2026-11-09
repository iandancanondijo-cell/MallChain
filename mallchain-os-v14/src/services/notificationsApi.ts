/**
 * Real notifications API — wraps backend/src/routes/notifications.js.
 *
 * This service handles:
 * - Fetching user notifications from backend (paged, with the server's own
 *   unread count)
 * - Marking notifications as read
 * - Archiving (dismissing) notifications
 * - Sending new notifications through configured channels
 * - Checking provider status and configuration
 * - Sending test notifications for verification
 *
 * Live push arrives separately via the socket 'notification' event
 * (see services/socket.ts's onNotification/subscribeUser).
 *
 * Everything here is a thin, honest translation layer over the backend:
 * `type`/`message` in the wire format, `kind`/`body` in this client's
 * contract. Callers that need a single coherent feed should use
 * services/notificationFeed.ts rather than calling this directly, so the
 * badge, the list and the socket all agree on one copy of the truth.
 */
import { api } from './api';
import { type ApiResult } from './api';
import { notificationPreferencesApi } from './notificationPreferencesApi';
import { normalizeNotification, type AppNotification } from './notificationWire';

export {
  NOTIF_KINDS,
  NOTIF_KIND_LABEL,
  normalizeNotification,
  type AppNotification,
  type NotifKind,
} from './notificationWire';

export interface NotificationListOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export interface NotificationListResult {
  notifications: AppNotification[];
  /** Rows matching the query server-side, including ones beyond this page. */
  total: number;
  /** The server's own unread count for this account — not derived from this page. */
  unreadCount: number;
  limit: number;
  offset: number;
}

export interface NotificationProviderStatus {
  email: { provider: string; configured: boolean };
  sms: { provider: string; configured: boolean };
  whatsapp: { provider: string; configured: boolean };
  push: { provider: string; configured: boolean };
}

/**
 * The six preference categories `models/NotificationPreferences.js` and
 * `routes/notifications.js` agree on. Note they are plural here and singular
 * in the stored row's `type` enum — the backend maps one to the other.
 */
export type NotifCategory = 'transactions' | 'campaigns' | 'governance' | 'security' | 'marketing' | 'badgeAlerts';

export interface SendNotificationOptions {
  title: string;
  body: string;
  kind?: string;
  category?: NotifCategory;
  metadata?: Record<string, unknown>;
}

export interface SendNotificationResult {
  ok: boolean;
  notificationId?: string;
  /** Set when the server deliberately did not deliver (preferences, DND). */
  skipped?: boolean;
  reason?: string;
  channels?: Record<string, unknown>;
  deliveryStatus?: Record<string, unknown>;
}

export interface TestNotificationResult {
  ok: boolean;
  results: {
    email?: { success: boolean; message?: string };
    sms?: { success: boolean; message?: string };
    whatsapp?: { success: boolean; message?: string };
    inApp?: { success: boolean; message?: string };
  };
}

/** The `type`/`message` → `kind`/`body` mapper lives in notificationWire.ts. */

class NotificationsApi {
  /**
   * List notifications for the current user.
   *
   * Backend (routes/notifications.js) serves GET /api/notifications — there
   * is no /me — and answers `{notifications, total, unreadCount, limit,
   * offset}`. `unreadCount` is a count over the whole account, so the badge
   * must read it instead of counting the rows in this page (a 50-row cap
   * silently capped a user with 200 unread at 50).
   */
  async list(opts: NotificationListOptions = {}): Promise<ApiResult<NotificationListResult>> {
    const params: Record<string, string | number> = {
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    };
    if (opts.unreadOnly) params.unreadOnly = 'true';
    const res = await api.get<{
      notifications?: Array<Record<string, unknown>>;
      total?: number;
      unreadCount?: number;
      limit?: number;
      offset?: number;
    }>('/api/notifications', params);
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error, code: res.code };
    }
    return {
      ok: true,
      data: {
        notifications: (res.data.notifications || []).map(normalizeNotification),
        total: Number(res.data.total ?? 0),
        unreadCount: Number(res.data.unreadCount ?? 0),
        limit: Number(res.data.limit ?? params.limit),
        offset: Number(res.data.offset ?? params.offset),
      },
    };
  }

  /**
   * Unread count on its own — GET /api/notifications/unread-count. Used to
   * refresh the bell without re-paging the whole feed (and after a socket
   * push, where the row itself is already known).
   */
  async getUnreadCount(): Promise<ApiResult<number>> {
    const res = await api.get<{ count?: number }>('/api/notifications/unread-count');
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error, code: res.code };
    }
    return { ok: true, data: Number(res.data.count ?? 0) };
  }

  /**
   * Mark a single notification as read — backend is PATCH /:id/read
   * (there is no POST /read/:id).
   */
  async markRead(id: string): Promise<ApiResult<{ ok: boolean }>> {
    const res = await api.patch(`/api/notifications/${encodeURIComponent(id)}/read`);
    return { ok: res.ok, data: { ok: res.ok }, error: res.error, code: res.code };
  }

  /**
   * Mark all notifications as read — backend is PATCH /read-all.
   */
  async markAllRead(): Promise<ApiResult<{ ok: boolean; modifiedCount: number }>> {
    const res = await api.patch<{ modifiedCount?: number }>('/api/notifications/read-all');
    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code, data: { ok: false, modifiedCount: 0 } };
    }
    return { ok: true, data: { ok: true, modifiedCount: Number(res.data?.modifiedCount ?? 0) } };
  }

  /**
   * Dismiss a notification for good — backend is DELETE /:id, which sets
   * `archived: true` and hides the row from every subsequent list.
   *
   * This existed on the server all along while both UIs' "dismiss" buttons
   * called markRead instead: the row stayed in the feed (list has no
   * unread filter), so a dismissed notification came back on the next fetch
   * or page load. That is what made dismissing feel like it did nothing.
   */
  async archive(id: string): Promise<ApiResult<{ ok: boolean }>> {
    const res = await api.del<{ success?: boolean }>(`/api/notifications/${encodeURIComponent(id)}`);
    return { ok: res.ok, data: { ok: res.ok }, error: res.error, code: res.code };
  }

  /**
   * Get configured notification providers and their status
   * Does not expose sensitive API keys
   */
  async getProviderStatus(): Promise<ApiResult<NotificationProviderStatus>> {
    return api.get('/api/notifications/providers');
  }

  /**
   * Send a test notification across all enabled channels
   * Respects user's preferences (frequency, channels, DND)
   */
  async sendTestNotification(): Promise<ApiResult<TestNotificationResult>> {
    return api.post('/api/notifications/test', {});
  }

  /**
   * Send a notification through configured channels based on user preferences
   *
   * @param opts - Notification content and channel options
   *
   * The client only does the checks that stop a request that the server would
   * certainly discard anyway — global off, unsubscribed category, category set
   * to 'disabled'. Everything past that point belongs to the server:
   * `services/notificationDispatcher.js` reads the same preferences document
   * to pick channels, apply the frequency digest and honour the DND window.
   *
   * An earlier version of this method also mirrored DND and channel selection
   * locally. Its DND branch was a bare expression statement that threw away
   * the computed value, so it changed nothing except the reading; and the
   * `channels`/`frequency` it so carefully built were fields `POST /send`
   * never looked at. Both are gone, because a client that appears to enforce
   * a rule it does not enforce is worse than one that plainly delegates.
   */
  async send(opts: SendNotificationOptions): Promise<ApiResult<SendNotificationResult>> {
    const body = {
      title: opts.title,
      body: opts.body,
      kind: opts.kind || opts.category || 'system',
      category: opts.category,
      metadata: opts.metadata,
    };

    let prefs;
    try {
      const prefsRes = await notificationPreferencesApi.getPreferences();
      prefs = prefsRes.ok ? prefsRes.data : undefined;
    } catch {
      // Preferences unreachable — the server still gates on them, so let the
      // send through rather than dropping the event client-side.
      prefs = undefined;
    }

    if (prefs && !prefs.enableNotifications) {
      return { ok: false, error: 'Notifications are disabled', data: { ok: false, skipped: true, reason: 'notifications_disabled' } };
    }
    if (opts.category && prefs?.unsubscribedCategories?.includes(opts.category)) {
      return { ok: false, error: `You are unsubscribed from ${opts.category} notifications`, data: { ok: false, skipped: true, reason: 'unsubscribed' } };
    }
    if (opts.category && prefs?.frequency?.[opts.category] === 'disabled') {
      return { ok: false, error: `${opts.category} notifications are disabled`, data: { ok: false, skipped: true, reason: 'category_disabled' } };
    }

    return api.post('/api/notifications/send', body);
  }
}

export const notificationsApi = new NotificationsApi();
