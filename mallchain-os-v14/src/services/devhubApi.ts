/** Real DevHub API-key management — wraps backend/src/routes/devhub.js. */
import { api } from './api';
import { type ApiResult } from './api';

export interface DevApiKey {
  _id: string;
  name: string;
  key: string;
  permissions: string[];
  used: number;
  created: string;
  lastUsed: string | null;
  revoked: boolean;
}

export interface UsageStats {
  totalRequests: number;
  keysActive: number;
  keysTotal: number;
  usage: Array<{ keyId: string; keyName: string; total: number; lastUsed: string | null }>;
  lastUpdated: string;
}

interface Envelope<T> { ok: boolean; data?: T; error?: string; }
async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) return { ok: false, error: result.data.error || 'Request failed' };
  return { ok: true, data: result.data?.data as T };
}

class DevHubApi {
  async listKeys(): Promise<ApiResult<DevApiKey[]>> {
    return unwrap(api.get('/api/devhub/keys'));
  }

  async createKey(name: string, permissions?: string[]): Promise<ApiResult<DevApiKey>> {
    return unwrap(api.post('/api/devhub/keys', { name, permissions }));
  }

  async revokeKey(id: string): Promise<ApiResult<{ revoked: boolean }>> {
    return unwrap(api.del(`/api/devhub/keys/${encodeURIComponent(id)}`));
  }

  async usage(): Promise<ApiResult<UsageStats>> {
    return unwrap(api.get('/api/devhub/usage'));
  }
}

export const devhubApi = new DevHubApi();
