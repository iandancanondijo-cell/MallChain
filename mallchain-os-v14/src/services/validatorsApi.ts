/**
 * Real chain-validator API service — wraps the backend's Cosmos x/staking
 * validator endpoints (distinct from Mines Proof Reviewers, see minesApi.ts).
 * Maps to: GET/POST /api/validators/*
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface ChainValidator {
  id: string;
  operatorAddress: string;
  name: string;
  description: string;
  commission: number;
  apr: number;
  totalStaked: number;
  uptime: number;
  logo: string;
  status: string;
}

export interface ValidatorLeaderboardEntry {
  operatorAddress: string;
  name: string;
  identity: string;
  website: string;
  details: string;
  commission: string;
  totalStaked: number;
  votingPower: number;
  status: string;
  uptime: number;
  missedBlocks: number;
  jailed: boolean;
  tokens: number;
  reputationScore: number;
}

export interface ValidatorApplication {
  _id: string;
  applicantAddress: string;
  validatorAddress: string;
  moniker: string;
  website: string;
  details: string;
  selfDelegationAmount: string;
  denom: string;
  status: 'pending' | 'approved' | 'rejected';
  isActiveValidator: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewNotes?: string;
}

export interface ApplyPayload {
  applicantAddress: string;
  validatorAddress?: string;
  moniker: string;
  website?: string;
  details?: string;
  selfDelegationAmount?: string;
  denom?: string;
}

class ValidatorsApi {
  async list(): Promise<ApiResult<{ validators: ChainValidator[] }>> {
    return api.get('/api/validators/list');
  }

  async leaderboard(): Promise<ApiResult<{ validators: ValidatorLeaderboardEntry[] }>> {
    return api.get('/api/validators/leaderboard');
  }

  async getDetail(operatorAddress: string): Promise<ApiResult<{ validator: ValidatorLeaderboardEntry }>> {
    return api.get(`/api/validators/detail/${encodeURIComponent(operatorAddress)}`);
  }

  async apply(payload: ApplyPayload): Promise<ApiResult<{ application: ValidatorApplication }>> {
    return api.post('/api/validators/apply', payload);
  }

  async myApplication(address: string): Promise<ApiResult<{ application: ValidatorApplication | null }>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    return api.get('/api/validators/my-application', { address });
  }
}

export const validatorsApi = new ValidatorsApi();
