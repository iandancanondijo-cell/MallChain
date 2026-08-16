/** Real DevHub API-key management — wraps backend/src/routes/devhub.js. */
import { api } from './api';
import { type ApiResult } from './api';
import { config } from './config';

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

  /** Sends the key as the x-api-key header (not a bearer token/body field — that's what the backend actually checks) to really validate it and increment its usage counter. */
  async testKey(key: string): Promise<ApiResult<{ valid: boolean; keyName: string; used: number }>> {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/devhub/test`, {
        method: 'POST',
        headers: { 'x-api-key': key },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) return { ok: false, error: json?.error || `HTTP ${res.status}` };
      return { ok: true, data: json.data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

export const devhubApi = new DevHubApi();
