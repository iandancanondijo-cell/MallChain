/**
 * Federated search — wraps GET /api/search?q=... (backend/src/routes/search.js).
 * Blocks/txs reuse explorerApi.ts's raw envelope shapes since the backend
 * proxies explorerService.getBlock/getTransaction verbatim.
 */
import { api } from './api';

export interface SearchValidator {
  operatorAddress: string;
  name: string;
  commission: number;
  status: string;
}

export interface SearchCampaign {
  id: string;
  title: string;
  description?: string;
  platform?: string;
  rate_per_task: number;
  budget_remaining: number;
}

interface RawBlockEnvelope {
  block: {
    height: number;
    hash: string | null;
    blockTime: { iso: string | null; unix: number | null };
    proposer: string;
    txCount: number;
  };
}

interface RawTxEnvelope {
  transaction: {
    txHash: string;
    height: number;
    time: string;
    success: boolean;
  };
}

export interface SearchResults {
  query: string;
  blocks: RawBlockEnvelope[];
  txs: RawTxEnvelope[];
  validators: SearchValidator[];
  campaigns: SearchCampaign[];
}

export async function search(q: string): Promise<{ ok: boolean; data?: SearchResults; error?: string }> {
  const result = await api.get<SearchResults>('/api/search', { q });
  if (result.ok && result.data) return { ok: true, data: result.data };
  return { ok: false, error: result.error || 'Search failed' };
}
