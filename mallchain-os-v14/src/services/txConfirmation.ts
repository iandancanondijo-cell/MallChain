import { api, RateLimitError, type RateLimitInfo } from './api';

export interface TxConfirmationResult {
  code?: number;
  /** Block height the tx was included at (REST tx_response.height). */
  height?: string;
  /** Block timestamp reported by the node for the included tx. */
  timestamp?: string;
  txHash?: string;
  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

export type TxConfirmationErrorKind = 'timeout' | 'failed';

export class TxConfirmationError extends Error {
  kind: TxConfirmationErrorKind;
  constructor(message: string, kind: TxConfirmationErrorKind = 'failed') {
    super(message);
    this.name = 'TxConfirmationError';
    this.kind = kind;
  }
}

interface StatusResponse {
  success: boolean;
  status: string;
  code?: number;
  height?: string;
  timestamp?: string;
  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 1500;
/** Consecutive 429s tolerated before the poll gives up and surfaces the rate limit. */
const MAX_RATE_LIMIT_WAITS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toResult(txHash: string, data: StatusResponse): TxConfirmationResult {
  return { code: data.code, height: data.height, timestamp: data.timestamp, txHash, events: data.events };
}

/** Interpret one status poll. Throws for an on-chain failure, returns null while still pending. */
function interpret(txHash: string, res: { ok: boolean; data?: StatusResponse }): TxConfirmationResult | null {
  if (res.ok && res.data?.status === 'confirmed') {
    if (res.data.code && res.data.code !== 0) {
      throw new TxConfirmationError('Transaction failed on-chain');
    }
    return toResult(txHash, res.data);
  }
  if (res.ok && res.data?.status === 'failed') {
    throw new TxConfirmationError('Transaction failed on-chain');
  }
  return null;
}

export async function waitForConfirmation(
  txHash: string,
  options?: { attempts?: number; delayMs?: number }
): Promise<TxConfirmationResult> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  const poll = () => api.get<StatusResponse>(`/api/send/status/${txHash}`);

  let attempt = 0;
  let rateLimitWaits = 0;

  while (attempt < attempts) {
    const res = await poll();

    // A 429 from the status readLimiter is NOT a confirmation failure — the
    // tx may already be on chain. Wait out Retry-After (falling back to 2s
    // when the header is unavailable) WITHOUT consuming one of the real
    // attempts, so transient throttling can no longer burn the 12s budget
    // and produce a bogus "Timed out" error after a successful send.
    if (res.code === 429) {
      rateLimitWaits += 1;
      if (rateLimitWaits > MAX_RATE_LIMIT_WAITS) {
        const info: RateLimitInfo | undefined = res.rateLimit;
        throw new RateLimitError(
          info?.message || 'Too many requests. Please try again later.',
          info?.retryAfterSeconds ?? 30
        );
      }
      await sleep((res.rateLimit?.retryAfterSeconds ?? 2) * 1000);
      continue;
    }

    const done = interpret(txHash, res);
    if (done) return done;

    attempt += 1;
    if (attempt < attempts) await sleep(delayMs);
  }

  // Attempts exhausted: one final fallback check. The backend status handler
  // resolves a REST miss through RPC :26657/tx_search before answering, so
  // this last poll also covers the node's slow single-tx REST index.
  const fallback = await poll();
  if (fallback.code !== 429) {
    const done = interpret(txHash, fallback);
    if (done) return done;
  }

  throw new TxConfirmationError('Timed out waiting for transaction to confirm', 'timeout');
}
