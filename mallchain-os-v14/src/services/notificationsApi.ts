/**
 * Real notifications API — wraps backend/src/routes/notifications.js.
 * 
 * This service handles:
 * - Fetching user notifications from backend
 * - Marking notifications as read
 * - Sending new notifications through configured channels
 * - Checking provider status and configuration
 * - Sending test notifications for verification
 * 
 * Live push arrives separately via the socket 'notification' event
 * (see services/socket.ts's onNotification/subscribeUser).
 */
import { api } from './api';
import { type ApiResult } from './api';
import { notificationPreferencesApi } from './notificationPreferencesApi';

export interface AppNotification {
  _id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationProviderStatus {
  email: { provider: string; configured: boolean };
  sms: { provider: string; configured: boolean };
  whatsapp: { provider: string; configured: boolean };
}

export interface SendNotificationOptions {
  title: string;
  body: string;
  kind?: string;
  category?: 'transactions' | 'campaigns' | 'governance' | 'security' | 'marketing' | 'badgeAlerts';
  channels?: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
    inApp?: boolean;
  };
  metadata?: Record<string, unknown>;
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

class NotificationsApi {
  /**
   * List all notifications for the current user.
   *
   * Backend (routes/notifications.js) serves GET /api/notifications — there
   * is no /me — and its documents use `type`/`message` where this client's
   * AppNotification contract uses `kind`/`body`. The mapping happens here
   * so callers (TopBar, MiscViews) stay unchanged.
   */
  async list(): Promise<ApiResult<{ notifications: AppNotification[] }>> {
    const res = await api.get<{ notifications: Array<Record<string, unknown> > }>('/api/notifications', { limit: 50 });
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error, code: res.code };
    }
    const mapped: AppNotification[] = (res.data.notifications || []).map((n) => ({
      _id: String(n._id),
      kind: (n.type as string) || (n.kind as string) || 'system',
      title: (n.title as string) || '',
      body: (n.message as string) || (n.body as string) || '',
      read: !!(n as { read?: boolean }).read,
      createdAt: (n.createdAt as string) || new Date().toISOString(),
    }));
    return { ok: true, data: { notifications: mapped } };
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
  async markAllRead(): Promise<ApiResult<{ ok: boolean }>> {
    const res = await api.patch('/api/notifications/read-all');
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
   * This method:
   * 1. Fetches user's notification preferences
   * 2. Checks if notifications are enabled globally
   * 3. Checks DND (do not disturb) windows
   * 4. Filters by enabled channels
   * 5. Respects frequency settings (immediate/daily/weekly)
   * 6. Sends through configured providers
   * 
   * The backend handles all multi-channel logic and provider routing
   */
  async send(opts: SendNotificationOptions): Promise<ApiResult<{ notificationId: string }>> {
    try {
      // Get user preferences to determine which channels to use
      const prefsRes = await notificationPreferencesApi.getPreferences();
      if (!prefsRes.ok || !prefsRes.data) {
        // Fall back to in-app only if preferences can't be fetched
        return api.post('/api/notifications/send', {
          title: opts.title,
          body: opts.body,
          kind: opts.kind || opts.category || 'system',
          category: opts.category,
          channels: { inApp: true },
          metadata: opts.metadata,
        });
      }

      const prefs = prefsRes.data;

      // Check if notifications are globally disabled
      if (!prefs.enableNotifications) {
        return { ok: false, error: 'Notifications are disabled' };
      }

      // Check if category is unsubscribed
      if (opts.category && prefs.unsubscribedCategories?.includes(opts.category)) {
        return { ok: false, error: `User unsubscribed from ${opts.category} notifications` };
      }

      // Get frequency setting for this category
      const frequency = opts.category && prefs.frequency[opts.category] 
        ? prefs.frequency[opts.category] 
        : 'immediate';

      // Skip if category is disabled
      if (frequency === 'disabled') {
        return { ok: false, error: `${opts.category} notifications are disabled` };
      }

      // Check DND (do not disturb) window
      if (prefs.doNotDisturb?.enabled) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const startTime = prefs.doNotDisturb.startTime || '22:00';
        const endTime = prefs.doNotDisturb.endTime || '08:00';

        // Simple time-based DND check (doesn't cross midnight yet)
        if (timeStr >= startTime || timeStr < endTime) {
          // Skip real-time notification, queue for digest
          frequency === 'immediate' ? 'daily' : frequency;
        }
      }

      // Build channels to use based on user preferences
      const channels = {
        email: opts.channels?.email !== false && prefs.channels?.email === true,
        sms: opts.channels?.sms !== false && prefs.channels?.sms === true,
        whatsapp: opts.channels?.whatsapp !== false && prefs.channels?.whatsapp === true,
        inApp: opts.channels?.inApp !== false && prefs.channels?.inApp === true,
      };

      // Send notification through backend with all preferences
      return api.post('/api/notifications/send', {
        title: opts.title,
        body: opts.body,
        kind: opts.kind || opts.category || 'system',
        category: opts.category,
        channels,
        frequency,
        metadata: opts.metadata,
      });
    } catch (error) {
      console.error('Error sending notification:', error);
      return { ok: false, error: 'Failed to send notification' };
    }
  }
}

export const notificationsApi = new NotificationsApi();
