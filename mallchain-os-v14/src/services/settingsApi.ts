/** Real user settings API — wraps backend/src/routes/settings.js. */
import { api } from './api';
import { type ApiResult } from './api';

export interface UserSettingsData {
  prefs: { accent: string; currency: string; lang: string; theme: string };
  notifications: {
    email: { transactions: boolean; campaigns: boolean; governance: boolean; marketing: boolean; security: boolean };
    push: { transactions: boolean; campaigns: boolean; governance: boolean; marketing: boolean; security: boolean };
    frequency: string;
  };
  security: {
    twoFactorEnabled: boolean;
    sessionTimeout: number;
    loginNotifications: boolean;
    deviceManagement: boolean;
    trustedDevices: string[];
  };
  privacy: { profileVisibility: string; showActivity: boolean; showBalance: boolean; allowMessages: boolean; dataSharing: boolean };
  display: { compactMode: boolean; showBalances: boolean; defaultView: string; itemsPerPage: number };
}

interface Envelope<T> { ok: boolean; data?: T; error?: string; }
async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) return { ok: false, error: result.data.error || 'Request failed' };
  return { ok: true, data: result.data?.data as T };
}

class SettingsApi {
  async get(): Promise<ApiResult<UserSettingsData>> {
    return unwrap(api.get('/api/settings'));
  }

  async update(patch: Partial<UserSettingsData>): Promise<ApiResult<UserSettingsData>> {
    return unwrap(api.put('/api/settings', patch));
  }

  async reset(): Promise<ApiResult<UserSettingsData>> {
    return unwrap(api.post('/api/settings/reset', {}));
  }

  async enable2fa(code: string): Promise<ApiResult<{ enabled: boolean; backupCodes: string[] }>> {
    return unwrap(api.post('/api/settings/security/2fa/enable', { code }));
  }

  async disable2fa(): Promise<ApiResult<{ enabled: boolean }>> {
    return unwrap(api.post('/api/settings/security/2fa/disable', {}));
  }
}

export const settingsApi = new SettingsApi();
