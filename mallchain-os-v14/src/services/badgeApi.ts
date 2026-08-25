/**
 * Badge API service — wraps the backend's KSh 17 M-Pesa STK-push badge
 * purchase flow. Maps to: GET /api/badge/config, POST /api/badge/reserve,
 * POST /api/badge/mpesa, GET /api/badge/status/{quoteId}, POST /api/badge/issue
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface BadgeConfig {
  priceKes: number;
  providerMode: 'live' | 'unconfigured';
}

export interface BadgeQuote {
  ok: boolean;
  quoteId: string;
  status: string;
  fiatAmount: number;
  currency: string;
  badgeTxHash: string | null;
  reason: string | null;
}

export interface BadgeReserveResult {
  ok: boolean;
  quoteId: string;
  fiatAmount: number;
  currency: string;
  providerMode: string;
}

export interface BadgeMpesaInitiateResult {
  ok: boolean;
  paymentId: string;
  status: string;
  quoteId: string;
  amountKes: number;
}

export interface BadgeIssueResult {
  ok: boolean;
  success: boolean;
  txHash?: string;
  message?: string;
}

class BadgeApi {
  async getConfig(): Promise<ApiResult<BadgeConfig>> {
    return api.get<BadgeConfig>('/api/badge/config');
  }

  async reserve(params: { walletAddress: string; phone: string }): Promise<ApiResult<BadgeReserveResult>> {
    return api.post<BadgeReserveResult>('/api/badge/reserve', params);
  }

  /** Trigger the Safaricom STK push prompt on the buyer's phone. */
  async initiateMpesa(params: { quoteId: string; phone: string }): Promise<ApiResult<BadgeMpesaInitiateResult>> {
    return api.post<BadgeMpesaInitiateResult>('/api/badge/mpesa', params);
  }

  async getStatus(quoteId: string): Promise<ApiResult<BadgeQuote>> {
    return api.get<BadgeQuote>(`/api/badge/status/${quoteId}`);
  }

  /** Issues the badge on-chain once the reserved quote's payment is confirmed. */
  async issue(params: { quoteId: string; walletAddress: string }): Promise<ApiResult<BadgeIssueResult>> {
    return api.post<BadgeIssueResult>('/api/badge/issue', params);
  }
}

export const badgeApi = new BadgeApi();
