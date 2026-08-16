const mongoose = require('mongoose');
const MinesReviewer = require('../models/MinesReviewer');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const Campaign = require('../models/Campaign');
const { notify } = require('./notify');

/**
 * Mines "Proof Reviewer" content-review game: random 6-reviewer assignment,
 * reputation-weighted voting with a majority threshold, and reward/penalty
 * payout. Builds on top of the pre-existing (previously unwired) task
 * assignment/voting scaffolding in routes/taskAssignment.js and
 * models/TaskSubmission.js.
 *
 * All numeric policy knobs below are placeholders proposed for this first
 * cut — tune via env vars once real usage data exists.
 */
const MIN_REVIEWER_STAKE = Number(process.env.MINES_REVIEWER_MIN_STAKE || 50); // MLPTS
const VOTE_REWARD = Number(process.env.MINES_REVIEWER_VOTE_REWARD || 0.5); // MLPTS per majority-matching vote
const APPROVAL_THRESHOLD = Number(process.env.MINES_REVIEWER_THRESHOLD || 0.6); // weighted-yes ratio needed to approve
const MISSED_VOTE_PENALTY = 5; // reputation points deducted for a no-show
const SUSPEND_AFTER_MISSES = 3; // consecutive no-shows before stake is suspended
const REVIEWERS_PER_TASK = 6;
const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000; // matches the existing manual-assign convention

/** Reputation (0-100) -> vote weight, floored so a brand-new reviewer (default 50) still counts meaningfully. */
function computeWeight(reviewer) {
  const reputation = Number(reviewer?.mining_reputation ?? 50);
  return Math.max(0.2, reputation / 100);
}

/**
 * Derives approval_rate/response_rate/mining_reputation from a reviewer's
 * raw counters. Pure function (no DB access) so every call site that
 * mutates tasks_voted/tasks_approved/tasks_assigned via an atomic
 * findOneAndUpdate/updateMany can recompute and persist these explicitly —
 * document middleware (pre('save')) never fires for those atomic update
 * ops, so the recompute can't live there. Returns null (nothing to do) for
 * a reviewer who hasn't voted yet, so a brand-new reviewer (tasks_voted=0)
 * keeps their default 50 reputation instead of being immediately dropped
 * to a near-zero empty-history score (0 response + 40 consistency + 0 volume = 12).
 */
function computeReputationStats(reviewer) {
  if (!reviewer || !(reviewer.tasks_voted > 0)) return null;
  const approval_rate = Math.round((reviewer.tasks_approved / reviewer.tasks_voted) * 100);
  const response_rate = Math.round((reviewer.tasks_voted / (reviewer.tasks_assigned || reviewer.tasks_voted)) * 100);
  const responseScore = response_rate;
  const consistencyScore = 100 - Math.abs(approval_rate - 60); // best around 60% approval (not too lenient, not too strict)
  const volumeScore = Math.min(reviewer.tasks_voted * 5, 100);
  const mining_reputation = Math.round((responseScore * 0.4) + (consistencyScore * 0.3) + (volumeScore * 0.3));
  return { approval_rate, response_rate, mining_reputation };
}

/** Recomputes and persists derived stats for one reviewer after a counter change. */
async function refreshReviewerStats(validatorId, session) {
  const reviewer = await MinesReviewer.findOne({ validator_id: validatorId }).session(session || null).lean();
  const stats = computeReputationStats(reviewer);
  if (!stats) return reviewer;
  await MinesReviewer.updateOne({ validator_id: validatorId }, { $set: stats }, { session });
  return { ...reviewer, ...stats };
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Randomly assign up to REVIEWERS_PER_TASK eligible (staked & active) reviewers
 * to a freshly-submitted task, excluding the submitter. If zero reviewers are
 * eligible, leaves the task untouched — it falls back to the existing
 * admin manual-review queue (status stays 'manual_review').
 */
async function autoAssignReviewers(task) {
  const pool = await MinesReviewer.find({
    stakeStatus: 'active',
    validator_id: { $ne: task.miner_id },
  }).lean();

  if (pool.length === 0) return task;

  const picked = shuffle(pool).slice(0, REVIEWERS_PER_TASK);
  const votingDeadline = new Date(Date.now() + VOTING_WINDOW_MS);

  task.assigned_validators = picked.map((r) => r.validator_id);
  task.assigned_at = new Date();
  task.assignment_status = 'assigned';
  task.votes_required = picked.length;
  task.votes_yes_weight = 0;
  task.votes_no_weight = 0;
  task.voting_deadline = votingDeadline;
  task.validator_votes = {};
  await task.save();

  await MinesReviewer.updateMany(
    { validator_id: { $in: picked.map((r) => r.validator_id) } },
    { $inc: { tasks_assigned: 1 }, $set: { last_assigned_at: new Date() } }
  );
  await Promise.all(picked.map((r) => refreshReviewerStats(r.validator_id)));

  return task;
}

/**
 * Credit the submitter and settle every assigned reviewer's reward/penalty,
 * then mark the task resolved. Assumes the caller has already decided
 * `approved` (see checkAndResolve for the normal weighted-threshold path).
 */
async function settle(task, { approved, reason }) {
  let finalReward = task.reward_amount || 0;
  if (approved && task.campaign_id) {
    const campaign = await Campaign.findById(task.campaign_id).lean();
    if (campaign && campaign.rate_per_task) finalReward = campaign.rate_per_task;
  }
  if (!approved) finalReward = 0;

  const votes = task.validator_votes || {};
  const assignedIds = (task.assigned_validators || []).map(String);
  // Collected during the transaction, fired after it commits — notifications
  // are a side effect of the outcome, not part of the atomic money movement.
  const pendingNotifications = [];

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      task.status = approved ? 'auto_approved' : 'rejected';
      task.assignment_status = approved ? 'approved' : 'rejected';
      task.completed_at = new Date();
      task.reward_amount = finalReward;
      if (!approved && reason) task.rejection_note = reason;
      await task.save({ session });

      if (approved && finalReward > 0) {
        await WalletTransaction.create(
          [
            {
              user_id: task.miner_id,
              type: 'credit',
              amount: finalReward,
              currency: task.reward_currency || 'MLPTS',
              description: 'Mines submission reward — weighted reviewer vote approved',
            },
          ],
          { session }
        );
        await User.findByIdAndUpdate(task.miner_id, { $inc: { mlpts_balance: finalReward } }).session(session);
      }

      if (task.campaign_id && approved) {
        await Campaign.findByIdAndUpdate(task.campaign_id, {
          $inc: { completions_count: 1, budget_remaining: -finalReward },
        }).session(session);
      }

      pendingNotifications.push({
        userId: task.miner_id,
        kind: 'mines',
        title: approved ? 'Submission approved' : 'Submission rejected',
        body: approved
          ? `Your Mines submission was approved by weighted reviewer vote — +${finalReward} ${task.reward_currency || 'MLPTS'}`
          : reason || 'Your Mines submission did not pass reviewer vote',
      });

      for (const reviewerId of assignedIds) {
        const cast = votes[reviewerId];
        if (cast === undefined) {
          // no-show: reputation penalty + missed-vote streak, possible suspension
          const reviewer = await MinesReviewer.findOne({ validator_id: reviewerId }).session(session);
          if (!reviewer) continue;
          reviewer.missedVoteStreak = (reviewer.missedVoteStreak || 0) + 1;
          reviewer.mining_reputation = Math.max(0, (reviewer.mining_reputation || 50) - MISSED_VOTE_PENALTY);
          const suspended = reviewer.missedVoteStreak >= SUSPEND_AFTER_MISSES;
          if (suspended) reviewer.stakeStatus = 'suspended';
          await reviewer.save({ session });
          pendingNotifications.push({
            userId: reviewerId,
            kind: 'mines',
            title: suspended ? 'Reviewer stake suspended' : 'Missed review deadline',
            body: suspended
              ? `${SUSPEND_AFTER_MISSES} missed votes in a row — your reviewer stake is suspended until you re-stake`
              : `-${MISSED_VOTE_PENALTY} reputation for not voting before the deadline`,
          });
          continue;
        }

        const matchedMajority = (cast === 'yes') === approved;
        if (matchedMajority) {
          const reviewer = await MinesReviewer.findOneAndUpdate(
            { validator_id: reviewerId },
            { $inc: { total_earnings: VOTE_REWARD }, $set: { missedVoteStreak: 0 } },
            { session, new: true }
          );
          if (reviewer) {
            await User.findByIdAndUpdate(reviewerId, { $inc: { mlpts_balance: VOTE_REWARD } }).session(session);
            pendingNotifications.push({
              userId: reviewerId,
              kind: 'mines',
              title: 'Review reward',
              body: `Your vote matched the weighted majority — +${VOTE_REWARD} MLPTS`,
            });
          }
        } else {
          await MinesReviewer.findOneAndUpdate(
            { validator_id: reviewerId },
            { $set: { missedVoteStreak: 0 } },
            { session }
          );
        }
      }
    });
  } finally {
    session.endSession();
  }

  for (const n of pendingNotifications) {
    notify(n.userId, n);
  }

  return task;
}

/**
 * Called after a vote is cast (and opportunistically when a reviewer's
 * queue/assignment list is read) to check whether a task is ready to
 * resolve: every assigned reviewer has voted, or the deadline has passed.
 * Returns the (possibly now-resolved) task, or null if there was nothing
 * to check (task isn't in an assignable/voting state).
 */
async function checkAndResolve(task) {
  if (!['assigned', 'voting'].includes(task.assignment_status)) return null;

  const assignedIds = (task.assigned_validators || []).map(String);
  if (assignedIds.length === 0) return null;

  const votes = task.validator_votes || {};
  const votedCount = Object.keys(votes).length;
  const deadlinePassed = task.voting_deadline && new Date(task.voting_deadline) < new Date();
  const quorum = Math.ceil((assignedIds.length * 2) / 3);

  const allVoted = votedCount >= assignedIds.length;
  const quorumMetAfterDeadline = deadlinePassed && votedCount >= quorum;

  if (!allVoted && !quorumMetAfterDeadline) {
    if (deadlinePassed && votedCount < quorum) {
      return settle(task, { approved: false, reason: 'insufficient reviewer quorum' });
    }
    return null; // still waiting on votes
  }

  const weightedYes = task.votes_yes_weight || 0;
  const weightedTotal = (task.votes_yes_weight || 0) + (task.votes_no_weight || 0);
  const ratio = weightedTotal > 0 ? weightedYes / weightedTotal : 0;
  const approved = ratio >= APPROVAL_THRESHOLD;

  return settle(task, { approved, reason: approved ? null : 'weighted reviewer vote did not meet approval threshold' });
}

module.exports = {
  MIN_REVIEWER_STAKE,
  VOTE_REWARD,
  APPROVAL_THRESHOLD,
  MISSED_VOTE_PENALTY,
  SUSPEND_AFTER_MISSES,
  REVIEWERS_PER_TASK,
  VOTING_WINDOW_MS,
  computeWeight,
  computeReputationStats,
  refreshReviewerStats,
  shuffle,
  autoAssignReviewers,
  checkAndResolve,
  settle,
};
