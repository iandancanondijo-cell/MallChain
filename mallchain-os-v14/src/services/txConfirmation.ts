import { api } from './api';

export interface TxConfirmationResult {
  code?: number;
  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

export class TxConfirmationError extends Error {}

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 1500;

export async function waitForConfirmation(
  txHash: string,
  options?: { attempts?: number; delayMs?: number }
): Promise<TxConfirmationResult> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  for (let i = 0; i < attempts; i++) {
    const res = await api.get<{
      success: boolean;
      status: string;
      code?: number;
      events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
    }>(`/api/send/status/${txHash}`);

    if (res.ok && res.data?.status === 'confirmed') {
      if (res.data.code && res.data.code !== 0) {
        throw new TxConfirmationError('Transaction failed on-chain');
      }
      return { code: res.data.code, events: res.data.events };
    }
    if (res.ok && res.data?.status === 'failed') {
      throw new TxConfirmationError('Transaction failed on-chain');
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new TxConfirmationError('Timed out waiting for transaction to confirm');
}
