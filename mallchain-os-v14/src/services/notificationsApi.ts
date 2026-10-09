/**
 * Real notifications API — wraps backend/src/routes/notifications.js.
 * Live push arrives separately via the socket 'notification' event
 * (see services/socket.ts's onNotification/subscribeUser).
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface AppNotification {
  _id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** Per-channel provider selection + whether it's actually configured. */
export interface NotificationProviders {
  email: { provider: string; configured: boolean };
  sms: { provider: string; configured: boolean };
  whatsapp: { provider: string; configured: boolean };
}

/** Per-channel result of a test send. */
export interface TestNotificationResult {
  ok: boolean;
  results: { email: boolean; sms: boolean; whatsapp: boolean };
}

class NotificationsApi {
  async list(): Promise<ApiResult<{ notifications: AppNotification[] }>> {
    return api.get('/api/notifications/me');
  }

  async markRead(id: string): Promise<ApiResult<{ ok: boolean }>> {
    return api.post(`/api/notifications/read/${encodeURIComponent(id)}`, {});
  }

  async markAllRead(): Promise<ApiResult<{ ok: boolean }>> {
    return api.post('/api/notifications/read-all', {});
  }

  /** Which provider backs each channel and whether it's configured (secret-free). */
  async providers(): Promise<ApiResult<NotificationProviders>> {
    return api.get('/api/notifications/providers');
  }

  /** Send a one-off test notification across the caller's available channels. */
  async sendTest(): Promise<ApiResult<TestNotificationResult>> {
    return api.post('/api/notifications/test', {});
  }
}

export const notificationsApi = new NotificationsApi();
