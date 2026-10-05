/**
 * Contracts API — wraps backend/src/routes/contracts.js. Records persist
 * server-side per user. Deploy/interact accept optional real chain tx data
 * (txHash, on-chain address) so the record reflects actual wasm operations.
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface ContractRecord {
  _id: string;
  name: string;
  type: string;
  code: string;
  description: string;
  address: string;
  txHash?: string;
  deployedAt: string;
  txs: number;
  status: 'active' | 'paused';
}

interface Envelope<T> { ok: boolean; data?: T; error?: string; }
async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) return { ok: false, error: result.data.error || 'Request failed' };
  return { ok: true, data: result.data?.data as T };
}

class ContractsApi {
  async list(): Promise<ApiResult<ContractRecord[]>> {
    return unwrap(api.get('/api/contracts'));
  }

  async deploy(payload: {
    name: string;
    type: string;
    code: string;
    description?: string;
    txHash?: string;
    address?: string;
  }): Promise<ApiResult<ContractRecord>> {
    return unwrap(api.post('/api/contracts/deploy', payload));
  }

  async interact(id: string, method: string, params?: unknown, txHash?: string): Promise<ApiResult<{ txHash: string; status: string; result: unknown }>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/interact`, { method, params, txHash }));
  }

  async broadcast(txBytes: string): Promise<ApiResult<{ txHash: string; txResponse: unknown }>> {
    return unwrap(api.post('/api/contracts/broadcast', { txBytes }));
  }

  async remove(id: string): Promise<ApiResult<{ deleted: boolean }>> {
    return unwrap(api.del(`/api/contracts/${encodeURIComponent(id)}`));
  }
}

export const contractsApi = new ContractsApi();
