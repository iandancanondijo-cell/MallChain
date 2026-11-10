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
  /** Hydrated by GET /my-assigned so the reviewer can see what was actually published. */
  campaign_title?: string;
  campaign_content_link?: string;
  campaign_platform?: string;
  campaign_rate_per_task?: number | null;
  campaign_status?: string;
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
  /**
   * The other half of the validator rule, from GET /reviewer/profile: an
   * approved validator application. null means the server could not read the
   * allow-list at all — which is not the same as false ("you are not
   * approved"), so the UI has to say "not reported".
   */
  validator_allowed?: boolean | null;
  /** allowed AND staked — the only state that gets work assigned to you. */
  review_eligible?: boolean | null;
}

/**
 * GET /api/task-assignment/reviewer/queue-summary — the whole verification
 * queue, not only the slice handed to this reviewer. `assigned_to_me` counts
 * submissions, one per row; `awaiting_assignment` is the work no reviewer has
 * claimed, which the queue list alone cannot distinguish from an idle network.
 */
export interface ReviewerQueueSummary {
  awaiting_verification: number;
  awaiting_assignment: number;
  assigned_to_me: number;
  waiting_for_my_vote: number;
  settled_last_24h: number;
  oldest_waiting_since: string | null;
  source: string;
}

export interface MinesCampaign {
  _id: string;
  creator_id: string;
  title: string;
  description?: string;
  /**
   * Only present on the surfaces that may show it — the creator's own list and
   * the reviewer queue. GET /campaigns/active and /campaigns/available both
   * strip it so a participant can only reach the task through POST
   * /campaigns/:id/open.
   */
  content_link?: string;
  directive?: string;
  platform?: string;
  activity_type?: string;
  multiplier?: number;
  rate_per_task: number;
  budget_remaining: number;
  /**
   * How many rewarded submissions one account may make. Sent by
   * GET /campaigns/active and enforced by POST /submissions, so the Discover
   * button can promise a second attempt only when the server would allow it.
   */
  max_completions_per_user?: number;
  cooldown_seconds?: number;
  /** What the creator escrowed at creation; `budget_remaining` is what is left. */
  budget_total?: number | null;
  status: 'active' | 'paused' | 'completed';
  completions_count: number;
}

/**
 * GET /api/mines/campaigns/:id/task — everything a participant needs before
 * spending their one link open. Note there is no task address in here except
 * on a slot that is already spent: only POST /campaigns/:id/open hands the
 * link out, which is what makes "opens once" a rule instead of a warning.
 */
export interface CampaignTaskDetail {
  task: {
    id: string;
    title: string;
    description: string;
    directive: string;
    platform: string;
    platform_label: string;
    activity_type: string;
    activity_label: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
  };
  owner: { display_name: string | null; banned: boolean };
  reward: {
    rate_per_task: number;
    currency: string;
    daily_cap_mlpts: number;
    paid_when: string;
  };
  budget: { funded: number | null; remaining: number; completions: number };
  rules: { max_completions_per_user: number; cooldown_seconds: number };
  link: { openable: boolean; host: string | null; released: boolean };
  me: {
    allowance: number;
    openings_used: number;
    openings_left: number;
    pending_open: { slot: number; opened_at: string; content_link: string } | null;
    rewarded_submissions: number;
    submissions: Array<{
      id: string;
      status: string;
      assignment_status: string;
      reward_amount: number;
      currency: string;
      created_at: string;
      completed_at: string | null;
      rejection_note: string | null;
      proof_url: string;
    }>;
  };
}

/**
 * GET /api/mines/campaigns/available. `available_mlpts` is the server's
 * arithmetic — rate x slots this account has left, capped by each campaign's
 * remaining budget — so the headline cannot promise points the budget has
 * already paid out to someone else.
 */
export interface AvailableCampaignFeed {
  campaigns: MinesCampaign[];
  available_mlpts: number;
}

/**
 * GET /api/mines/opens/pending — a link this account opened and never proved.
 * `content_link` is the address /open already released; re-showing it spends
 * nothing, and hiding it would throw away the attempt.
 */
export interface PendingOpen {
  open_id: string;
  campaign_id: string;
  slot: number;
  opened_at: string | null;
  content_link: string;
  title: string;
  platform: string;
  rate_per_task: number | null;
  campaign_status: string;
}

/** POST /api/mines/campaigns/:id/open — the destination, released once per slot. */
export interface CampaignLinkOpen {
  opened: boolean;
  slot: number;
  allowance: number;
  opened_at: string;
  content_link: string;
}

export interface RewardActivity {
  rate?: number;
  min?: number;
  max?: number;
  tier: string;
  note?: string;
}

export interface RewardPlatform {
  label: string;
  icon: string;
  dailyCapMlpts?: number;
  activities: Record<string, RewardActivity>;
}

export interface RewardRatesTable {
  platforms: Record<string, RewardPlatform>;
  defaultDailyCapMlpts: number;
  minMultiplier: number;
  maxMultiplier: number;
}

export interface CreateCampaignPayload {
  platform: string;
  activity_type: string;
  content_link: string;
  description?: string;
  directive?: string;
  multiplier: number;
  budget_mlpts: number;
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
  phone: string | null;
  name: string | null;
  mlpts_balance: number;
  mallcoin_balance: number;
  streak_count: number;
  tasks_completed: number;
  rank_points: number;
  avatarUrl?: string;
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

/** GET /api/mines/earnings/summary — settled submissions only, never wallet credits. */
export interface EarningsSummary {
  currency: string;
  approvedCount: number;
  approvedMlpts: number;
  rejectedCount: number;
  pendingCount: number;
  pendingMlptsAtStake: number;
  pendingCampaignsUnresolved: number;
  thisWeekMlpts: number;
  avgRewardMlpts: number;
  daily: Array<{ date: string; mlpts: number; count: number }>;
  /**
   * Screen-vs-action, one row per UTC day for the last seven, zero-filled:
   * `shown` is campaigns this account's Discover actually displayed, `opened`
   * links it released, `done` proofs it sent, `paid_*` what reviewers
   * approved. Optional because the impression counter starts on the deploy
   * that introduced it — a server that has not recorded any yet must not be
   * rendered as "nothing was ever offered".
   */
  activity?: Array<{
    date: string;
    shown: number;
    opened: number;
    done: number;
    paid_count: number;
    paid_mlpts: number;
  }>;
  /**
   * First day impressions were counted for this account, or null if the feed
   * has never served it since. Days before this were not empty screens — they
   * were unmeasured ones, and the difference has to be on the screen.
   */
  impressions_since?: string | null;
  balanceMlpts: number;
  tasksCompleted: number;
  source: string;
}

export interface ProofUploadResult {
  documentRef: string;
  /** Multer's own metadata, kept optional so a partial response still type-checks. */
  size?: number;
  mimetype?: string;
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

  async reviewerQueueSummary(): Promise<ApiResult<ReviewerQueueSummary>> {
    return unwrap(api.get('/api/task-assignment/reviewer/queue-summary'));
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

  /**
   * The participant's feed: campaigns this account may still attempt — none
   * they created, none they opened, none they submitted — plus the MLPTS the
   * screen can actually pay them.
   *
   * This replaces GET /campaigns/active for every in-app list on purpose. That
   * endpoint is public and unfiltered, so a screen built on it would show a
   * creator their own campaigns and would keep offering tasks this account
   * already spent an open on. "Which of these have I met" is the caller's
   * history, and only the server holds it.
   */
  async listAvailableCampaigns(): Promise<ApiResult<AvailableCampaignFeed>> {
    return unwrap(api.get('/api/mines/campaigns/available'));
  }

  /**
   * Link opens this account spent without a screenshot. Discover stops listing
   * a campaign the moment it is touched, so this is where a spent-but-unfinished
   * attempt stays reachable until it is completed or lost.
   */
  async pendingOpens(): Promise<ApiResult<PendingOpen[]>> {
    return unwrap(api.get('/api/mines/opens/pending'));
  }

  async myCampaigns(creatorId: string): Promise<ApiResult<MinesCampaign[]>> {
    return unwrap(api.get(`/api/mines/campaigns/creator/${encodeURIComponent(creatorId)}`));
  }

  async getRewardRates(): Promise<ApiResult<RewardRatesTable>> {
    return unwrap(api.get('/api/mines/reward-rates'));
  }

  /**
   * The full task card: owner, publish time, budget, expectations and this
   * account's own opens/submissions. The list endpoint cannot carry the task
   * address, so this is where a participant decides whether the task is worth
   * their one open.
   */
  async campaignTask(campaignId: string): Promise<ApiResult<CampaignTaskDetail>> {
    return unwrap(api.get(`/api/mines/campaigns/${encodeURIComponent(campaignId)}/task`));
  }

  /**
   * Burns one link open and returns the address. Call this only from the
   * button the participant is about to click: the slot is spent by this
   * request, not by the page load, and there is no way to un-spend it.
   */
  async openCampaignLink(campaignId: string): Promise<ApiResult<CampaignLinkOpen>> {
    return unwrap(api.post(`/api/mines/campaigns/${encodeURIComponent(campaignId)}/open`, {}));
  }

  /** Self-serve campaign creation — funded from the creator's own Mallpoints balance. */
  async createCampaign(payload: CreateCampaignPayload): Promise<ApiResult<MinesCampaign>> {
    return unwrap(api.post('/api/mines/campaigns/create', payload));
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

  /**
   * Uploads an activity screenshot and returns the ref that POST /submissions
   * accepts as `proof_url`. This is the only way to produce a proof the
   * backend can verify exists on disk; a typed URL is still accepted but is
   * just a claim.
   */
  async uploadProof(file: File): Promise<ApiResult<ProofUploadResult>> {
    const form = new FormData();
    form.append('proof', file);
    return unwrap(api.upload<Envelope<ProofUploadResult>>('/api/mines/upload', form));
  }

  async getEarningsSummary(): Promise<ApiResult<EarningsSummary>> {
    return unwrap(api.get('/api/mines/earnings/summary'));
  }

  async campaignLeaderboard(): Promise<ApiResult<ParticipantLeaderboardEntry[]>> {
    return unwrap(api.get('/api/mines/leaderboard'));
  }
}

export const minesApi = new MinesApi();
