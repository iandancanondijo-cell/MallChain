/**
 * KYC document upload — a dedicated fetch() call, not api.post(), because
 * api.post() (services/api.ts) unconditionally sets Content-Type:
 * application/json, which breaks a multipart FormData boundary.
 *
 * Auth is the httpOnly auth_token cookie (credentials: 'include'); the
 * mutating call additionally carries an X-CSRF-Token header, same as
 * api.ts — see its comment for why cookie auth needs that.
 */
import { config } from './config';
import { authService } from './auth';
import type { ApiResult } from './api';

export interface UploadDocumentResponse {
  ok: boolean;
  documentRef: string;
}

export interface KycStatusResponse {
  /** 'draft' = only wizard progress saved via PATCH /kyc/draft, nothing submitted yet */
  status: 'not_submitted' | 'draft' | 'pending' | 'approved' | 'rejected' | 'review';
  kycId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  submittedAt?: string;
  reviewedAt?: string | null;
  notes?: string;
  /** Legacy single-document submissions (deprecated schema) — usually false now. */
  hasDocument?: boolean;
  /** Front of the ID (new dual-side submissions — what new users upload). */
  hasFrontDocument?: boolean;
  /** Back of the ID. */
  hasBackDocument?: boolean;
  personal?: { firstName: string; lastName: string; dateOfBirth: string; nationality: string };
  address?: { address: string; city: string; country: string; postalCode: string; phoneNumber: string };
  identity?: { idType: string; idNumber: string; idExpiry: string };
  financial?: { occupation: string; sourceOfFunds: string; annualIncome: string; politicalExposure: boolean };
}

export const kycApi = {
  async getStatus(): Promise<ApiResult<KycStatusResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/kyc/status`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawError = data?.error;
        const errorMessage = typeof rawError === 'string' ? rawError : rawError?.message || `Failed to load KYC status (${res.status})`;
        return { ok: false, error: errorMessage };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load KYC status' };
    }
  },

  /**
   * Upload one ID image (front OR back). Both sides go through the same
   * endpoint — multer doesn't need to know which — but we send a `side`
   * field so the backend can record it for audit (helps spot when a user
   * uploads two fronts by mistake).
   */
  async uploadDocument(file: File, side: 'front' | 'back' | 'document' = 'document'): Promise<ApiResult<UploadDocumentResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const csrfToken = await authService.getCsrfToken();
    const form = new FormData();
    form.append('document', file);
    form.append('side', side);

    try {
      const res = await fetch(`${base}/api/kyc/document`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawError = data?.error;
        const errorMessage = typeof rawError === 'string' ? rawError : rawError?.message || `Upload failed (${res.status})`;
        return { ok: false, error: errorMessage };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Upload failed' };
    }
  },

  /** Fetches an uploaded document as a blob URL for display (auth-gated, not a public link).
   *  side defaults to 'front'. Pass 'back' / 'document' for the other side. */
  async fetchDocumentBlobUrl(kycId: string, side: 'front' | 'back' | 'document' = 'front', reason?: string): Promise<ApiResult<string>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('side', side);
    if (reason?.trim()) params.set('reason', reason.trim());
    const qs = `?${params.toString()}`;
    try {
      const res = await fetch(`${base}/api/kyc/document/${kycId}${qs}`, { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Backend returns AppError as {error: {code, message, statusCode, ...}} or flat {error: "message"}
        const rawError = data?.error;
        const errorMessage = typeof rawError === 'string' ? rawError : rawError?.message || `Failed to load document (${res.status})`;
        return { ok: false, error: errorMessage };
      }
      const blob = await res.blob();
      return { ok: true, data: URL.createObjectURL(blob) };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load document' };
    }
  },

  async submit(data: Record<string, unknown>): Promise<ApiResult<{ ok: boolean }>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const csrfToken = await authService.getCsrfToken();
    try {
      const res = await fetch(`${base}/api/kyc/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawError = result?.error;
        const errorMessage = typeof rawError === 'string' ? rawError : rawError?.message || `Failed to submit KYC (${res.status})`;
        return { ok: false, error: errorMessage };
      }
      return { ok: true, data: { ok: true } };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to submit KYC' };
    }
  },
};
