import { api, RateLimitError } from './api';

interface BroadcastResponse {
  success: boolean;
  txHash: string;
  error?: string;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function isNetworkError(res: { ok: boolean; code?: number }): boolean {
  return !res.ok && !res.code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function broadcastWithRetry(
  path: string,
  body: Record<string, unknown>
): Promise<BroadcastResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await api.post<BroadcastResponse>(path, body);

    if (res.ok && res.data?.txHash) {
      return res.data;
    }

    if (!isNetworkError(res) || attempt === MAX_RETRIES) {
      // A 429 from financialLimiter carries the cool-down window — throw it
      // typed so the UI can disable the PIN gate instead of showing an error
      // (and re-prompting a PIN that burns attempts on every retry).
      if (res.code === 429 && res.rateLimit) {
        throw new RateLimitError(res.rateLimit.message, res.rateLimit.retryAfterSeconds);
      }
      const errorMsg = res.data?.error || res.error || 'Transaction failed during broadcast';
      throw new Error(errorMsg);
    }

    console.warn(`[broadcastWithRetry] network error on attempt ${attempt + 1}/${MAX_RETRIES + 1}, retrying in ${RETRY_DELAY_MS}ms...`);
    await delay(RETRY_DELAY_MS);
  }

  throw new Error('Transaction failed after retries');
}
