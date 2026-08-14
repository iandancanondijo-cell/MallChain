/**
 * Mines "Proof Reviewer" API service — the real content-review game: random
 * 6-reviewer assignment, reputation-weighted voting, reviewer-specific
 * staking. Wraps the backend's /api/task-assignment/* endpoints (see
 * routes/taskAssignment.js + services/minesReviewService.js). Distinct from
 * validatorsApi.ts, which covers real Cosmos x/staking chain validators.
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface AssignedTask {
  _id: string;
  miner_id: string;
  title?: string;
  description?: string;
  proof_url?: string;
  campaign_id?: string;
  assignment_status: string;
  votes_required: number;
  votes_yes: number;
  votes_no: number;
  voting_deadline?: string;
  my_vote: 'yes' | 'no' | null;
  has_voted: boolean;
}

export interface ReviewerProfile {
  validator_id: string;
  stakedAmount: number;
  minRequiredStake: number;
  stakeStatus: 'unstaked' | 'active' | 'suspended';
  mining_reputation: number;
  tasks_assigned: number;
  tasks_voted: number;
  tasks_approved: number;
  tasks_rejected: number;
  total_earnings: number;
  missedVoteStreak?: number;
}

export interface MinesCampaign {
  _id: string;
  creator_id: string;
  title: string;
  description?: string;
  rate_per_task: number;
  budget_remaining: number;
  status: 'active' | 'paused' | 'completed';
  completions_count: number;
}

export interface MinesSubmission {
  _id: string;
  campaign_id?: string;
  title?: string;
  task_type?: string;
  description?: string;
  proof_url?: string;
  status: string;
  assignment_status: string;
  reward_amount: number;
  reward_currency: string;
  created_at: string;
  completed_at?: string;
  rejection_note?: string;
}

export interface MinesProfile {
  id: string;
  username: string | null;
  email: string;
  mlpts_balance: number;
  mallcoin_balance: number;
  streak_count: number;
  tasks_completed: number;
  rank_points: number;
}

export interface WalletTx {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description?: string;
  created_at: string;
}

export interface ParticipantLeaderboardEntry {
  id: string;
  name: string;
  earned: number;
  tasks: number;
  rankPoints: number;
}

// backend routes in taskAssignment.js respond via an `ok(data) => {ok, data}` helper
interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) {
    return { ok: false, error: result.data.error || 'Request failed' };
  }
  return { ok: true, data: result.data?.data as T };
}

class MinesApi {
  async getQueue(): Promise<ApiResult<AssignedTask[]>> {
    return unwrap(api.get('/api/task-assignment/my-assigned'));
  }

  async vote(taskId: string, vote: 'yes' | 'no'): Promise<ApiResult<{ vote_recorded: boolean; status: string }>> {
    return unwrap(api.post(`/api/task-assignment/tasks/${encodeURIComponent(taskId)}/vote`, { vote }));
  }

  async getReviewerProfile(): Promise<ApiResult<ReviewerProfile>> {
    return unwrap(api.get('/api/task-assignment/reviewer/profile'));
  }

  async stake(amount: number): Promise<ApiResult<ReviewerProfile>> {
    return unwrap(api.post('/api/task-assignment/reviewer/stake', { amount }));
  }

  async unstake(amount?: number): Promise<ApiResult<ReviewerProfile>> {
    return unwrap(api.post('/api/task-assignment/reviewer/unstake', amount ? { amount } : {}));
  }

  async getReviewerLeaderboard(): Promise<ApiResult<ReviewerProfile[]>> {
    return unwrap(api.get('/api/task-assignment/reviewer/leaderboard'));
  }

  // ---- Campaign Participant side (backend/src/routes/mines.js) ----

  async listActiveCampaigns(): Promise<ApiResult<MinesCampaign[]>> {
    return unwrap(api.get('/api/mines/campaigns/active'));
  }

  async myCampaigns(creatorId: string): Promise<ApiResult<MinesCampaign[]>> {
    return unwrap(api.get(`/api/mines/campaigns/creator/${encodeURIComponent(creatorId)}`));
  }

  async getProfile(): Promise<ApiResult<MinesProfile>> {
    return unwrap(api.get('/api/mines/profile/me'));
  }

  async updateProfile(patch: { username?: string; phone?: string }): Promise<ApiResult<MinesProfile>> {
    return unwrap(api.put('/api/mines/profile', patch));
  }

  async getTransactions(limit = 50): Promise<ApiResult<WalletTx[]>> {
    return unwrap(api.get('/api/mines/transactions', { limit }));
  }

  async mySubmissions(limit = 50): Promise<ApiResult<MinesSubmission[]>> {
    return unwrap(api.get('/api/mines/submissions/me', { limit }));
  }

  async submitTask(payload: { campaign_id: string; title?: string; task_type?: string; description?: string; proof_url?: string }): Promise<ApiResult<MinesSubmission>> {
    return unwrap(api.post('/api/mines/submissions', payload));
  }

  async campaignLeaderboard(): Promise<ApiResult<ParticipantLeaderboardEntry[]>> {
    return unwrap(api.get('/api/mines/leaderboard'));
  }
}

export const minesApi = new MinesApi();
