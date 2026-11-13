/**
 * Contracts API — wraps backend/src/routes/contracts.js. Records persist
 * server-side per user.
 *
 * Deploy and interact report the real chain values (the instantiate hash, the
 * execute hash), and the backend verifies each one against the node before it
 * stores anything. That means a record can legitimately carry `address: null`:
 * the draft exists, the metadata is real, but nothing was ever put on-chain.
 * Nothing here fabricates a receipt — a null has to be shown as a null.
 */
import { api } from './api';
import { type ApiResult } from './api';

/**
 * '' is the state a contract that was never shared sits in, which is different
 * from 'revoked' (offered, then withdrawn) — the UI words them differently.
 */
export type ContractOfferStatus = '' | 'offered' | 'accepted' | 'declined' | 'revoked';

export interface ContractRecord {
  _id: string;
  name: string;
  type: string;
  code: string;
  description: string;
  /** null when the record has no contract on-chain behind it. */
  address: string | null;
  /** null for the same reason: nothing was broadcast, so there is no receipt. */
  txHash: string | null;
  deployedAt: string;
  txs: number;
  status: 'active' | 'paused';
  // Sharing. counterpartyAddress is what the owner typed; offerStatus is where
  // that offer stands. party only travels on the detail/share/accept responses
  // and says which side of the offer this account is on.
  counterpartyAddress?: string;
  counterpartyUserId?: string | null;
  offerStatus?: ContractOfferStatus;
  offerNote?: string;
  offeredAt?: string | null;
  respondedAt?: string | null;
  /** Only on the offers read: the deployer's own linked address, so you know
   * who is asking. Empty when that account has not linked a wallet. */
  ownerAddress?: string;
  party?: 'owner' | 'counterparty';
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

  async interact(id: string, method: string, params?: unknown, txHash?: string): Promise<ApiResult<{
    txHash: string | null;
    status: 'recorded' | 'not_broadcast';
    result: unknown;
  }>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/interact`, { method, params, txHash }));
  }

  async broadcast(txBytes: string): Promise<ApiResult<{ txHash: string; txResponse: unknown }>> {
    return unwrap(api.post('/api/contracts/broadcast', { txBytes }));
  }

  /** Everything shared with this account, answered or not, newest offer first. */
  async offers(): Promise<ApiResult<ContractRecord[]>> {
    return unwrap(api.get('/api/contracts/offers'));
  }

  async share(id: string, address: string, note?: string): Promise<ApiResult<ContractRecord>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/share`, { address, note }));
  }

  async accept(id: string): Promise<ApiResult<ContractRecord>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/accept`, {}));
  }

  async decline(id: string): Promise<ApiResult<ContractRecord>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/decline`, {}));
  }

  async revoke(id: string): Promise<ApiResult<ContractRecord>> {
    return unwrap(api.post(`/api/contracts/${encodeURIComponent(id)}/revoke`, {}));
  }

  async remove(id: string): Promise<ApiResult<{ deleted: boolean }>> {
    return unwrap(api.del(`/api/contracts/${encodeURIComponent(id)}`));
  }
}

export const contractsApi = new ContractsApi();
