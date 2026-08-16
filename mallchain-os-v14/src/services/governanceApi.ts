/** Real governance API — wraps backend/src/routes/governance.js (broadcast lives in governanceTx.ts). */
import { api } from './api';
import { type ApiResult } from './api';

export interface ProposalTally {
  yes: string;
  no: string;
  abstain: string;
  total: string;
  yesPct: number;
  noPct: number;
  abstainPct: number;
  vetoPct: number;
}

export interface Proposal {
  id: string;
  status: 'active' | 'passed' | 'rejected' | 'failed' | 'deposit' | 'unknown';
  statusRaw: string;
  title: string;
  summary: string;
  submitTime?: string;
  votingStartTime?: string;
  votingEndTime?: string;
  depositEndTime?: string;
  totalDeposit: Array<{ denom: string; amount: string }>;
  tally: ProposalTally;
  userVote?: { voted: boolean; option?: string };
}

export interface DepositParams {
  min_deposit: Array<{ denom: string; amount: string }>;
  max_deposit_period: string;
}

export interface VotingPower {
  address: string;
  totalStaked: string;
  denom: string;
  delegations: Array<{ validatorAddress: string; amount: string; denom: string }>;
}

class GovernanceApi {
  async listProposals(status?: string): Promise<ApiResult<{ proposals: Proposal[]; stats: { total: number; active: number } }>> {
    return api.get('/api/governance/proposals', status ? { status } : undefined);
  }

  async getProposal(id: string, voter?: string): Promise<ApiResult<{ proposal: Proposal }>> {
    return api.get(`/api/governance/proposal/${id}`, voter ? { voter } : undefined);
  }

  async getUserVote(id: string, voter: string): Promise<ApiResult<{ userVote: { voted: boolean; option?: string } }>> {
    return api.get(`/api/governance/proposal/${id}/vote/${voter}`);
  }

  async getDepositParams(): Promise<ApiResult<{ params: DepositParams }>> {
    return api.get('/api/governance/deposit-params');
  }

  async getVotingPower(address: string): Promise<ApiResult<VotingPower>> {
    return api.get(`/api/governance/voting-power/${address}`);
  }
}

export const governanceApi = new GovernanceApi();
