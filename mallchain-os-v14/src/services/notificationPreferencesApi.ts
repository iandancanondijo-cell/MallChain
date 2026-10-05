import { api } from './api';

export interface NotificationPreferences {
  _id: string;
  userId: string;
  enableNotifications: boolean;
  frequency: {
    transactions: 'immediate' | 'daily' | 'weekly' | 'disabled';
    campaigns: 'immediate' | 'daily' | 'weekly' | 'disabled';
    governance: 'immediate' | 'daily' | 'weekly' | 'disabled';
    security: 'immediate' | 'daily' | 'weekly' | 'disabled';
    marketing: 'immediate' | 'daily' | 'weekly' | 'disabled';
    badgeAlerts: 'immediate' | 'daily' | 'weekly' | 'disabled';
  };
  doNotDisturb: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
    days: string[];
  };
  channels: {
    email: boolean;
    push: boolean;
    sms: boolean;
    whatsapp: boolean;
    inApp: boolean;
  };
  unsubscribedCategories: string[];
  createdAt: string;
  updatedAt: string;
}

export const notificationPreferencesApi = {
  /**
   * Get user's notification preferences
   */
  async getPreferences() {
    return api.get<NotificationPreferences>('/api/notification-preferences');
  },

  /**
   * Update notification frequency settings
   */
  async updateFrequency(frequency: NotificationPreferences['frequency']) {
    return api.patch<NotificationPreferences>('/api/notification-preferences/frequency', {
      frequency,
    });
  },

  /**
   * Update do-not-disturb settings
   */
  async updateDoNotDisturb(doNotDisturb: NotificationPreferences['doNotDisturb']) {
    return api.patch<NotificationPreferences>('/api/notification-preferences/do-not-disturb', {
      doNotDisturb,
    });
  },

  /**
   * Update notification channels
   */
  async updateChannels(channels: NotificationPreferences['channels']) {
    return api.patch<NotificationPreferences>('/api/notification-preferences/channels', {
      channels,
    });
  },

  /**
   * Toggle all notifications on/off
   */
  async toggleGlobal(enableNotifications: boolean) {
    return api.patch<NotificationPreferences>('/api/notification-preferences/global-toggle', {
      enableNotifications,
    });
  },

  /**
   * Unsubscribe from a notification category
   */
  async unsubscribe(category: string) {
    return api.post<NotificationPreferences>('/api/notification-preferences/unsubscribe', {
      category,
    });
  },

  /**
   * Resubscribe to a notification category
   */
  async resubscribe(category: string) {
    return api.post<NotificationPreferences>('/api/notification-preferences/resubscribe', {
      category,
    });
  },
};
