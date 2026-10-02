/**
 * Dynamic gas estimation for client-signed transactions.
 * Calls the backend's /api/send/simulate endpoint to get accurate gas estimates
 * from chain simulation instead of using hardcoded values.
 */
import { api } from './api';

const DEFAULT_GAS_LIMIT = 200000;
const SAFETY_MARGIN = 1.3;
const MAX_GAS_LIMIT = 800000;

/**
 * Estimate gas for a transaction by simulating it on the backend.
 * Returns the estimated gas with a 1.3x safety margin, capped at MAX_GAS_LIMIT.
 * Falls back to DEFAULT_GAS_LIMIT if simulation fails.
 *
 * @param txBytes - Base64-encoded unsigned transaction bytes
 * @returns Estimated gas limit (with safety margin applied)
 */
export async function estimateGas(txBytes: string): Promise<number> {
  try {
    const res = await api.post<{ success: boolean; gasUsed: number; error?: string }>(
      '/api/send/simulate',
      { txBytes }
    );

    if (!res.ok || !res.data?.success || !res.data.gasUsed) {
      console.warn('[estimateGas] simulation failed, using default:', res.data?.error || res.error);
      return DEFAULT_GAS_LIMIT;
    }

    const estimatedWithMargin = Math.ceil(res.data.gasUsed * SAFETY_MARGIN);
    return Math.min(estimatedWithMargin, MAX_GAS_LIMIT);
  } catch (err) {
    console.warn('[estimateGas] simulation request failed, using default:', err);
    return DEFAULT_GAS_LIMIT;
  }
}
