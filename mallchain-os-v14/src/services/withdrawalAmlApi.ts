/**
 * Withdrawal AML declaration — the "declare first, then sign" compliance
 * step for withdrawals crossing AML_WITHDRAWAL_THRESHOLD_KES (see
 * backend/src/routes/withdrawalAml.js). A dedicated fetch(), not api.post(),
 * for the document upload — same reason as kycApi.ts: api.post() forces
 * Content-Type: application/json, which breaks a multipart FormData
 * boundary.
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

export type FundsSource =
  | 'mining_staking_rewards' | 'mallpoints_conversion' | 'referral_bonus'
  | 'salary' | 'business_income' | 'gift' | 'asset_sale' | 'other';

export const NATIVE_EARNINGS_SOURCES: FundsSource[] = [
  'mining_staking_rewards', 'mallpoints_conversion', 'referral_bonus',
];

export interface UploadAmlDocumentResponse {
  ok: boolean;
  documentRef: string;
}

export interface AmlStatusResponse {
  ok: boolean;
  walletLinked: boolean;
  reviewStatus: 'none' | 'pending' | 'approved' | 'rejected';
  reviewId: string | null;
  reviewNotes?: string | null;
}

export interface DeclareResponse {
  ok: boolean;
  reviewId: string;
  status: 'pending';
}

export const withdrawalAmlApi = {
  async getStatus(): Promise<ApiResult<AmlStatusResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    try {
      const res = await fetch(`${base}/api/withdrawals/aml/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error?.message || data.error || `Failed to load status (${res.status})` };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load verification status' };
    }
  },

  async uploadDocument(file: File): Promise<ApiResult<UploadAmlDocumentResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    const form = new FormData();
    form.append('document', file);
    try {
      const res = await fetch(`${base}/api/withdrawals/aml/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error?.message || data.error || `Upload failed (${res.status})` };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Upload failed' };
    }
  },

  async declare(params: {
    fundsSource: FundsSource;
    narrative: string;
    documentRef?: string;
    estimatedKes: number;
  }): Promise<ApiResult<DeclareResponse>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    try {
      const res = await fetch(`${base}/api/withdrawals/aml/declare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = data.error?.details;
        const message = Array.isArray(details) && details.length ? details[0].message : (data.error?.message || data.error);
        return { ok: false, error: message || `Verification submission failed (${res.status})` };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Verification submission failed' };
    }
  },

  /** Fetches an uploaded AML document as a blob URL for admin review display (auth-gated, not a public link). */
  async fetchDocumentBlobUrl(reviewId: string, reason?: string): Promise<ApiResult<string>> {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const token = getToken();
    const qs = reason?.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : '';
    try {
      const res = await fetch(`${base}/api/withdrawals/aml/${reviewId}/document${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error?.message || data.error || `Failed to load document (${res.status})` };
      }
      const blob = await res.blob();
      return { ok: true, data: URL.createObjectURL(blob) };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Failed to load document' };
    }
  },
};
