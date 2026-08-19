/** Real marketplace escrow query API — wraps backend/src/routes/marketplace.js. */
import { api } from './api';
import { type ApiResult } from './api';

export interface ChainEscrow {
  id: string;
  buyer: string;
  seller: string;
  amount: string;
  denom: string;
  description: string;
  status: string;
  lockedFunds: string;
  createdAt: number;
  releaseTime: number;
  disputeWindow: number;
}

class MarketplaceApi {
  async getEscrow(escrowId: string): Promise<ApiResult<{ escrow: ChainEscrow }>> {
    return api.get(`/api/marketplace/escrow/${escrowId}`);
  }

  async listEscrows(params?: { buyer?: string; seller?: string }): Promise<ApiResult<{ escrows: ChainEscrow[] }>> {
    return api.get('/api/marketplace/escrow', params as Record<string, string>);
  }
}

export const marketplaceApi = new MarketplaceApi();
