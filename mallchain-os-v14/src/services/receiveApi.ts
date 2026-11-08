/**
 * Receive sessions client (backend/src/routes/receive.js).
 *
 * A receiver can STATE an amount when activating receive. Until the session
 * expires or is cancelled, any wallet→wallet transfer to that address must
 * send EXACTLY the stated amount — the backend rejects mismatches with 409
 * and the session fails for BOTH parties (anti-cheat). With no stated
 * amount, sends work as before with any amount.
 */
import { api, type ApiResult } from './api';

export interface ReceiveIntentView {
  id: string;
  walletAddress: string;
  amountMlcns: number;
  note: string | null;
  status: 'active' | 'satisfied' | 'failed' | 'cancelled';
  expiresAt: string;
  createdAt: string;
  failure: {
    reason: string;
    attemptedAmountMlcns: number;
    senderAddress: string | null;
    at: string;
  } | null;
  attempts: Array<{
    from: string | null;
    amountMlcns: number;
    expectedMicro: number;
    reason: string;
    at: string;
  }>;
}

export class ReceiveAmountMismatchError extends Error {
  readonly kind = 'receive_amount_mismatch' as const;
  expectedAmountMlcns: number;
  attemptedAmountMlcns: number;
  constructor(message: string, expectedAmountMlcns: number, attemptedAmountMlcns: number) {
    super(message);
    this.expectedAmountMlcns = expectedAmountMlcns;
    this.attemptedAmountMlcns = attemptedAmountMlcns;
  }
}

interface IntentResponse { success: boolean; intent?: ReceiveIntentView }
interface ActiveResponse { success: boolean; active: ReceiveIntentView | null }
interface SessionResponse { success: boolean; active: ReceiveIntentView | null; latest: ReceiveIntentView | null }

export const receiveApi = {
  /** Declare the exact amount this wallet expects to receive. */
  createIntent(amountMlcns: number, opts?: { note?: string; ttlMinutes?: number; walletAddress?: string }): Promise<ApiResult<IntentResponse>> {
    return api.post<IntentResponse>('/api/receive/intent', {
      amountMlcns,
      ...(opts?.note ? { note: opts.note } : {}),
      ...(opts?.ttlMinutes ? { ttlMinutes: opts.ttlMinutes } : {}),
      ...(opts?.walletAddress ? { walletAddress: opts.walletAddress } : {}),
    });
  },

  cancelIntent(walletAddress?: string): Promise<ApiResult<{ success: boolean; cancelled: boolean }>> {
    return api.post('/api/receive/intent/cancel', walletAddress ? { walletAddress } : {});
  },

  /** What a SENDER must honor for this recipient address (public). */
  getActive(address: string): Promise<ApiResult<ActiveResponse>> {
    return api.get<ActiveResponse>(`/api/receive/intent/active/${encodeURIComponent(address)}`);
  },

  /** Session view for the RECEIVER: active intent + latest finished one. */
  getSession(address: string): Promise<ApiResult<SessionResponse>> {
    return api.get<SessionResponse>(`/api/receive/session/${encodeURIComponent(address)}`);
  },
};
