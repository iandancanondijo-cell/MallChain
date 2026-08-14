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
}

export const notificationsApi = new NotificationsApi();
