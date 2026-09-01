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
  rates: { buyPriceKes: number; sellPriceKes: number };
  directBuy: { locked: boolean; thresholdKes: number; reserveKes: number | null };
  chainSettlement: {
    buyCreditRoute: string;
    withdrawSellRoute: string;
    cashoutReceiverAddress: string | null;
  };
}

export interface SellPreview {
  ok: boolean;
  amount: number;
  estimatedKes: number;
  sellPriceKes: number;
  burnPercentage: number;
  burnAmount: number;
  treasuryAmount: number;
  payoutConfigured: boolean;
  note: string;
  minimum: { ok: boolean; minimumKes: number; shortfallKes: number | null };
  rateLimit: { ok: boolean; count: number; limit: number; nextAvailableAt: string | null };
  aml: {
    required: boolean;
    thresholdKes: number;
    walletLinked: boolean;
    reviewStatus: 'none' | 'pending' | 'approved' | 'rejected';
  };
  liquidity: { ok: boolean; reserveKes: number | null; error: string | null; wouldQueue: boolean };
  /** @deprecated use liquidity.ok — kept for one release since this was read directly before the `liquidity` object existed. */
  liquidityOk: boolean;
  /** @deprecated use liquidity.error */
  liquidityError: string | null;
}

export interface SellResult {
  success?: boolean;
  saleId: string;
  withdrawalId: string;
  txHash?: string | null;
  payoutRef?: string | null;
  burnAmount?: number;
  treasuryAmount?: number;
  burnPercentage?: number;
  burnTxHash?: string | null;
  providerMode?: string;
  /** Present when the withdrawal was held instead of settled immediately — see `code`. */
  queued?: boolean;
  code?: 'queued_liquidity';
  message?: string;
}

export interface SellStatus {
  saleId: string;
  sellerAddress: string;
  amountMlcns: number;
  phone: string | null;
  status: string;
  overallStatus: string;
  txHash: string | null;
  burnAmount: number;
  treasuryAmount: number;
  burnPercentage: number;
  burnTxHash: string | null;
  payoutRef: string | null;
  payoutStatus: string | null;
  payoutError: string | null;
  payoutAmountKes: number | null;
  providerMode: string;
  createdAt: string;
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

  /**
   * Reserve a fiat->MLCNS quote before initiating payment. Carries a fresh
   * Idempotency-Key (backend/src/middleware/idempotency.js, required on
   * this route) so a double-tap or a retried network request can't reserve
   * two quotes for the same intent — a double STK push is exactly the kind
   * of thing a user retrying after a slow response would otherwise trigger.
   */
  async reserve(params: {
    amount: number;
    fiat: string;
    currency: string;
    walletAddress: string;
    phone: string;
  }): Promise<ApiResult<ReserveResult>> {
    return api.post<ReserveResult>('/api/buy/reserve', params, { 'Idempotency-Key': crypto.randomUUID() });
  }

  /** Trigger the Safaricom STK push prompt on the buyer's phone. Idempotency-keyed for the same reason as reserve() above. */
  async initiateMpesa(params: {
    quoteId: string;
    phone: string;
    amount: number;
    description?: string;
  }): Promise<ApiResult<MpesaInitiateResult>> {
    return api.post<MpesaInitiateResult>('/api/buy/mpesa', params, { 'Idempotency-Key': crypto.randomUUID() });
  }

  async getStatus(paymentId: string): Promise<ApiResult<BuyQuote>> {
    return api.get<BuyQuote>(`/api/buy/status/${paymentId}`);
  }

  /** Credit MLCNS on-chain once the reserved quote's payment is confirmed. */
  async credit(params: { quoteId: string }): Promise<ApiResult<CreditResult>> {
    return api.post<CreditResult>('/api/buy/credit', params);
  }

  /**
   * Read-only preview for a cash-out, before the user signs anything —
   * surfaces the minimum-amount, weekly-limit, AML, and liquidity checks
   * all four rules the /sell route itself gates on, in one call.
   */
  async sellPreview(amount: number, sellerAddress?: string): Promise<ApiResult<SellPreview>> {
    return api.get<SellPreview>('/api/buy/sell/preview', sellerAddress ? { amount, sellerAddress } : { amount });
  }

  /** Submit a client-signed MLCNS transfer to be broadcast, burned, and cashed out via M-Pesa. */
  async sell(params: {
    sellerAddress: string;
    amount: number;
    txBytes: string;
    phone: string;
  }): Promise<ApiResult<SellResult>> {
    return api.post<SellResult>('/api/buy/sell', params);
  }

  /** Re-signs a withdrawal that went stale while held in the liquidity queue (status `resign_required`). */
  async resign(saleId: string, txBytes: string): Promise<ApiResult<{ ok: boolean; saleId: string; withdrawalId: string; status: string }>> {
    return api.post(`/api/buy/sell/${saleId}/resign`, { txBytes });
  }

  async getSellStatus(saleId: string): Promise<ApiResult<SellStatus>> {
    return api.get<SellStatus>(`/api/buy/sell/status/${saleId}`);
  }
}

export const buyApi = new BuyApi();
