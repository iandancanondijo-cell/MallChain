/** Real staking summary API — wraps backend/src/routes/staking.js (GET side; broadcast lives in stakingTx.ts). */
import { api } from './api';
import { type ApiResult } from './api';

export interface StakeRecord {
  stakeId: string;
  stakedAmount: number;
  stakeDate: number;
  rewardsEarned: number;
  isActive: boolean;
  unlockHeight: number;
}

export interface StakingSummary {
  address: string;
  displayDenom: string;
  totalStaked: number;
  totalRewardsClaimed: number;
  active: StakeRecord[];
  history: StakeRecord[];
}

class StakingApi {
  async getSummary(address: string): Promise<ApiResult<{ summary: StakingSummary }>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    return api.get(`/api/staking/summary/${address}`);
  }
}

export const stakingApi = new StakingApi();
