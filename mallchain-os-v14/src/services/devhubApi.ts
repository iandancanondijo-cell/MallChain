/**
 * Developer Hub API — wraps backend/src/routes/devhub.js and the key-guarded
 * developer API at backend/src/routes/devhubApi.js (/api/devhub/v1).
 */
import { api, type ApiResult } from './api';
import { authService } from './auth';
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

export type EndpointAuth = 'x-api-key' | 'bearer' | false;

export interface DevEndpoint {
  path: string;
  method: string;
  description: string;
  auth: EndpointAuth;
}

export interface DevDocs {
  version: string;
  baseUrl: string;
  authentication: {
    developer: { header: string; prefix: string; description: string; permission: string; rateLimitPerMinute: number };
    user: { header: string; description: string };
  };
  endpoints: DevEndpoint[];
  notes: string[];
}

export interface KeyTestResult {
  valid: boolean;
  keyName: string;
  permissions: string[];
  used: number;
}

/** What a live "try it" call actually returned — status and timing included. */
export interface EndpointResponse {
  status: number;
  ms: number;
  body: unknown;
  /** Present on a v1 call: the per-key rate-limit headers the server sent. */
  rateLimit?: { limit: string | null; remaining: string | null };
}

interface Envelope<T> { ok: boolean; data?: T; error?: string }

async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) return { ok: false, error: result.data.error || 'Request failed' };
  return { ok: true, data: result.data?.data as T };
}

const base = () => config.apiBaseUrl.replace(/\/$/, '');

/** The API origin spelled out; a relative base is useless in a pasted cURL command. */
export const displayApiBase = () => base() || window.location.origin;

class DevHubApi {
  async listKeys(): Promise<ApiResult<DevApiKey[]>> {
    return unwrap(api.get('/api/devhub/keys'));
  }

  async createKey(name: string): Promise<ApiResult<DevApiKey>> {
    return unwrap(api.post('/api/devhub/keys', { name }));
  }

  async renameKey(id: string, name: string): Promise<ApiResult<DevApiKey>> {
    return unwrap(api.put(`/api/devhub/keys/${encodeURIComponent(id)}`, { name }));
  }

  async revokeKey(id: string): Promise<ApiResult<{ revoked: boolean }>> {
    return unwrap(api.del(`/api/devhub/keys/${encodeURIComponent(id)}`));
  }

  async usage(): Promise<ApiResult<UsageStats>> {
    return unwrap(api.get('/api/devhub/usage'));
  }

  async docs(): Promise<ApiResult<DevDocs>> {
    return unwrap(api.get('/api/devhub/docs'));
  }

  /**
   * Sends the key as the x-api-key header — that is what the backend checks,
   * not a bearer token or a body field — so this really validates the key and
   * increments its usage counter.
   */
  async testKey(key: string): Promise<ApiResult<KeyTestResult>> {
    return this.send('POST', '/api/devhub/test', {}, key).then((r) => {
      const body = r.body as Envelope<KeyTestResult> | null;
      if (r.status < 200 || r.status >= 300 || !body || body.ok === false) {
        return { ok: false as const, error: body?.error || `HTTP ${r.status}` };
      }
      return { ok: true as const, data: body.data as KeyTestResult };
    });
  }

  /**
   * Runs one documented endpoint for real. `params` fills the :placeholders in
   * the path; `query` becomes the query string. Used by the Endpoints tab so a
   * developer sees an actual response rather than a canned example.
   */
  async tryEndpoint(endpoint: DevEndpoint, params: Record<string, string>, key: string, query: Record<string, string> = {}): Promise<EndpointResponse> {
    let path = endpoint.path;
    for (const [name, value] of Object.entries(params)) {
      path = path.replace(`:${name}`, encodeURIComponent(value));
    }
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '')).toString();
    return this.send(endpoint.method, path + (qs ? `?${qs}` : ''), {}, endpoint.auth === 'x-api-key' ? key : '');
  }

  /**
   * Raw fetch so the caller gets the HTTP status, not just a success boolean.
   * With a key the request goes out cookie-less: that is the point of the
   * Endpoints tab — the response proves the key alone authenticated it, the
   * way it will from a server that has never logged in.
   */
  private async send(method: string, path: string, body: unknown, key: string): Promise<EndpointResponse> {
    const started = performance.now();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers['x-api-key'] = key;
    else if (method !== 'GET' && method !== 'DELETE') {
      const csrf = await authService.getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    try {
      const res = await fetch(`${base()}${path}`, {
        method,
        headers,
        credentials: key ? 'omit' : 'include',
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body),
      });
      const parsed = await res.json().catch(() => null);
      return {
        status: res.status,
        ms: Math.round(performance.now() - started),
        body: parsed,
        rateLimit: { limit: res.headers.get('X-RateLimit-Limit'), remaining: res.headers.get('X-RateLimit-Remaining') },
      };
    } catch (e) {
      return { status: 0, ms: Math.round(performance.now() - started), body: { ok: false, error: (e as Error).message } };
    }
  }
}

export const devhubApi = new DevHubApi();