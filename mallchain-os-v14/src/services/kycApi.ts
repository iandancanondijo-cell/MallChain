/**
 * KYC document upload — a dedicated fetch() call, not api.post(), because
 * api.post() (services/api.ts) unconditionally sets Content-Type:
 * application/json, which breaks a multipart FormData boundary.
 */
import { config } from './config';
import type { ApiResult } from './api';

function getToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export interface UploadDocumentResponse {
  ok: boolean;
  documentRef: string;
}

export interface KycStatusResponse {
  status: 'not_submitted' | 'pending' | 'approved' | 'rejected' | 'review';
  kycId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  submittedAt?: string;
  reviewedAt?: string | null;
  notes?: string;
  hasDocument?: boolean;
  personal?: { firstName: string; lastName: string; dateOfBirth: string; nationality: string };
  address?: { address: string; city: string; country: string; postalCode: string; phoneNumber: string };
  identity?: { idType: string; idNumber: string; idExpiry: string };
  financial?: { occupation: string; sourceOfFunds: string; annualIncome: string; politicalExposure: boolean };
}

export const kycApi = {
  async getStatus(): Promise<ApiResult<KycStatusResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    try {
      const res = await fetch(`${base}/api/kyc/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || `Failed to load KYC status (${res.status})` };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load KYC status' };
    }
  },

  async uploadDocument(file: File): Promise<ApiResult<UploadDocumentResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    const form = new FormData();
    form.append('document', file);

    try {
      const res = await fetch(`${base}/api/kyc/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || `Upload failed (${res.status})` };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Upload failed' };
    }
  },

  /** Fetches an uploaded document as a blob URL for display (auth-gated, not a public link). */
  async fetchDocumentBlobUrl(kycId: string, reason?: string): Promise<ApiResult<string>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    const qs = reason?.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : '';
    try {
      const res = await fetch(`${base}/api/kyc/document/${kycId}${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || `Failed to load document (${res.status})` };
      }
      const blob = await res.blob();
      return { ok: true, data: URL.createObjectURL(blob) };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load document' };
    }
  },
};
