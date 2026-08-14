/**
 * Buy-Mallcoin-with-fiat API service — wraps the backend's M-Pesa STK-push
 * purchase flow. Maps to: GET /api/buy/config, POST /api/buy/reserve,
 * POST /api/buy/mpesa, GET /api/buy/status/{paymentId}, POST /api/buy/credit
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface BuyConfig {
  ok: boolean;
  provider: string;
  providerMode: 'live' | 'unconfigured';
  configured: { stkPush: boolean; b2cPayout: boolean };
}

export interface BuyQuote {
  quoteId: string;
  paymentId: string | null;
  walletAddress: string;
  phone: string;
  amountMlcns: number;
  amountKes: number;
  currency: string;
  status: string;
  reason: string | null;
  txHash: string | null;
  providerMode: string;
}

export interface ReserveResult {
  ok: boolean;
  quoteId: string;
  mpesaRef: string;
  fiatAmount: number;
  currency: string;
  providerMode: string;
  quote: BuyQuote;
}

export interface MpesaInitiateResult {
  ok: boolean;
  paymentId: string;
  status: string;
  quoteId: string;
  amountKes: number;
  amountMlcns: number;
}

export interface CreditResult {
  ok: boolean;
  success: boolean;
  txHash?: string;
  balance?: unknown;
}

class BuyApi {
  async getConfig(): Promise<ApiResult<BuyConfig>> {
    return api.get<BuyConfig>('/api/buy/config');
  }

  /** Reserve a fiat->MLCNS quote before initiating payment. */
  async reserve(params: {
    amount: number;
    fiat: string;
    currency: string;
    walletAddress: string;
    phone: string;
  }): Promise<ApiResult<ReserveResult>> {
    return api.post<ReserveResult>('/api/buy/reserve', params);
  }

  /** Trigger the Safaricom STK push prompt on the buyer's phone. */
  async initiateMpesa(params: {
    quoteId: string;
    phone: string;
    amount: number;
    description?: string;
  }): Promise<ApiResult<MpesaInitiateResult>> {
    return api.post<MpesaInitiateResult>('/api/buy/mpesa', params);
  }

  async getStatus(paymentId: string): Promise<ApiResult<BuyQuote>> {
    return api.get<BuyQuote>(`/api/buy/status/${paymentId}`);
  }

  /** Credit MLCNS on-chain once the reserved quote's payment is confirmed. */
  async credit(params: { quoteId: string }): Promise<ApiResult<CreditResult>> {
    return api.post<CreditResult>('/api/buy/credit', params);
  }
}

export const buyApi = new BuyApi();
