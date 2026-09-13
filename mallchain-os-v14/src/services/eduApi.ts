/**
 * EDU — user-posted educational resources others can browse and download.
 * Posting needs a dedicated fetch() call, not api.post(), because api.post()
 * (services/api.ts) unconditionally sets Content-Type: application/json,
 * which breaks a multipart FormData boundary — same reason kycApi.ts does
 * its own upload this way.
 */
import { config } from './config';
import { api, type ApiResult } from './api';
import { authService } from './auth';

export type EduCategory =
  | 'blockchain-basics'
  | 'tokenomics'
  | 'security'
  | 'governance'
  | 'validators'
  | 'general';

export interface EduChainInfo {
  status: 'pending' | 'registered' | 'failed';
  recordId: string;
  version: number;
  error?: string;
}

export interface EduResource {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  category: EduCategory;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  downloadCount: number;
  docId: string;
  previousResourceId: string | null;
  chain: EduChainInfo;
  createdAt: string;
  updatedAt: string;
}

export interface EduListResponse {
  resources: EduResource[];
  pagination: { page: number; limit: number; total: number; pages: number };
  categories: EduCategory[];
}

export interface EduVerifyResponse {
  verified: boolean;
  reason?: 'not-anchored' | 'chain-unreachable' | 'chain-record-missing';
  unmodifiedSinceUpload: boolean;
  currentHash: string;
  uploadedHash: string;
  chain: { status: EduChainInfo['status']; recordId?: string; version?: number; onChainHash?: string; error?: string };
}

function apiBase(): string {
  return config.apiBaseUrl.replace(/\/$/, '');
}

export const eduApi = {
  async list(opts: { page?: number; limit?: number; category?: EduCategory } = {}): Promise<ApiResult<EduListResponse>> {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.category) params.set('category', opts.category);
    const qs = params.toString();
    return api.get<EduListResponse>(`/api/edu${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<ApiResult<{ resource: EduResource }>> {
    return api.get<{ resource: EduResource }>(`/api/edu/${id}`);
  },

  async post(input: { file: File; title: string; description?: string; category: EduCategory; previousResourceId?: string }): Promise<ApiResult<{ resource: EduResource }>> {
    const csrfToken = await authService.getCsrfToken();
    const form = new FormData();
    form.append('file', input.file);
    form.append('title', input.title);
    form.append('description', input.description || '');
    form.append('category', input.category);
    if (input.previousResourceId) form.append('previousResourceId', input.previousResourceId);

    try {
      const res = await fetch(`${apiBase()}/api/edu`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error?.message || data.error || `Upload failed (${res.status})` };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Upload failed' };
    }
  },

  async remove(id: string): Promise<ApiResult<{ ok: true }>> {
    return api.del<{ ok: true }>(`/api/edu/${id}`);
  },

  /** Recomputes the file's current hash and checks it against the on-chain record. */
  async verify(id: string): Promise<ApiResult<EduVerifyResponse>> {
    return api.get<EduVerifyResponse>(`/api/edu/${id}/verify`);
  },

  /** This document's full version lineage, oldest-first. */
  async history(id: string): Promise<ApiResult<{ versions: EduResource[] }>> {
    return api.get<{ versions: EduResource[] }>(`/api/edu/${id}/history`);
  },

  /** Direct download URL — no auth needed, safe to navigate to or set as an <a href>. */
  downloadUrl(id: string): string {
    return `${apiBase()}/api/edu/${id}/download`;
  },
};
