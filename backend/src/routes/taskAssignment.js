const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TaskSubmission = require('../models/TaskSubmission');
const MinesReviewer = require('../models/MinesReviewer');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const { requireAdmin } = require('../middleware/adminAuth');
const jwt = require('jsonwebtoken');
const minesReviewService = require('../services/minesReviewService');
const { notify } = require('../services/notify');

const JWT_SECRET = process.env.JWT_SECRET;

// ============ MIDDLEWARE ============
function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.userId || payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err) { return { ok: false, error: String(err) }; }

// ============ ADMIN: TASK ASSIGNMENT WINDOW ============

// Get all tasks pending assignment (submitted but not yet assigned to validators)
router.get('/tasks/pending-assignment', requireAdmin, async (_req, res) => {
  try {
    const tasks = await TaskSubmission.find({
      $or: [
        { assignment_status: 'none', status: 'manual_review' },
        { assignment_status: 'pending_assignment', status: 'manual_review' },
      ]
    }).sort({ created_at: -1 }).limit(100).lean();
    return res.json(ok(tasks));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Get tasks currently in voting (assigned, waiting for validator votes)
router.get('/tasks/voting', requireAdmin, async (_req, res) => {
  try {
    const tasks = await TaskSubmission.find({
      assignment_status: { $in: ['assigned', 'voting'] },
      status: 'manual_review',
    }).sort({ assigned_at: -1 }).limit(100).lean();
    return res.json(ok(tasks));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Get tasks with votes complete (ready for admin final review)
router.get('/tasks/vote-complete', requireAdmin, async (_req, res) => {
  try {
    const tasks = await TaskSubmission.find({
      assignment_status: 'vote_complete',
      status: 'manual_review',
    }).sort({ created_at: -1 }).limit(100).lean();
    return res.json(ok(tasks));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Get all active validators with their mining activity stats for the assignment window
router.get('/validators/active', requireAdmin, async (_req, res) => {
  try {
    // Get all approved validators
    const approvedValidators = await User.find({ role: { $in: ['admin', 'superadmin'] } })
      .select('-password')
      .lean();

    // Also get validator applications that are approved
    const ValidatorApplication = require('../models/ValidatorApplication');
    const activeApps = await ValidatorApplication.find({ status: 'approved', isActiveValidator: true }).lean();

    // Merge and deduplicate - create a combined list
    const validatorMap = new Map();

    // Add users with admin/superadmin roles
    for (const u of approvedValidators) {
      validatorMap.set(u._id.toString(), {
        _id: u._id,
        validator_id: u._id.toString(),
        email: u.email,
        moniker: u.email.split('@')[0],
        type: 'user',
      });
    }

    // Add approved validator applications
    for (const v of activeApps) {
      const vid = v.validatorAddress || v.applicantAddress || v._id.toString();
      if (!validatorMap.has(vid)) {
        validatorMap.set(vid, {
          _id: v._id,
          validator_id: vid,
          validator_address: v.validatorAddress || '',
          applicant_address: v.applicantAddress || '',
          moniker: v.moniker || 'Unknown Validator',
          type: 'validator',
          selfDelegationAmount: v.selfDelegationAmount,
        });
      }
    }

    // Get activity stats for each validator
    const validatorIds = [...validatorMap.keys()];
    const activities = await MinesReviewer.find({ validator_id: { $in: validatorIds } }).lean();
    const activityMap = new Map();
    for (const a of activities) {
      activityMap.set(a.validator_id, a);
    }

    // Combine validator info with activity stats
    const validators = [...validatorMap.values()].map(v => {
      const activity = activityMap.get(v.validator_id) || {};
      return {
        ...v,
        tasks_assigned: activity.tasks_assigned || 0,
        tasks_voted: activity.tasks_voted || 0,
        tasks_approved: activity.tasks_approved || 0,
        tasks_rejected: activity.tasks_rejected || 0,
        approval_rate: activity.approval_rate || 0,
        response_rate: activity.response_rate || 0,
        mining_reputation: activity.mining_reputation || 50,
        total_earnings: activity.total_earnings || 0,
        last_vote_at: activity.last_vote_at || null,
      };
    });

    // Sort by mining_reputation descending (best validators first)
    validators.sort((a, b) => b.mining_reputation - a.mining_reputation);

    return res.json(ok(validators));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// ADMIN: Assign 6 validators to a task
router.post('/tasks/:id/assign', requireAdmin, async (req, res) => {
  try {
    const { validator_ids } = req.body;
    if (!Array.isArray(validator_ids) || validator_ids.length !== 6) {
      return res.status(400).json(fail('Exactly 6 validators must be assigned'));
    }

    const task = await TaskSubmission.findById(req.params.id);
    if (!task) return res.status(404).json(fail('task not found'));

    if (task.assignment_status !== 'none' && task.assignment_status !== 'pending_assignment') {
      return res.status(400).json(fail(`task is already in status: ${task.assignment_status}`));
    }

    // Set voting deadline: 48 hours from now
    const votingDeadline = new Date();
    votingDeadline.setHours(votingDeadline.getHours() + 48);

    task.assigned_validators = validator_ids;
    task.assigned_at = new Date();
    task.assignment_status = 'assigned';
    task.votes_required = 6;
    task.voting_deadline = votingDeadline;
    task.validator_votes = {};

    await task.save();

    // Update validator activity - increment assigned count
    for (const vid of validator_ids) {
      await MinesReviewer.findOneAndUpdate(
        { validator_id: vid },
        {
          $inc: { tasks_assigned: 1 },
          $set: { last_assigned_at: new Date() },
        },
        { upsert: true, new: true }
      );
    }

    await AuditLog.create({
      action: 'task_assign_validators',
      actor: req.user?.email || 'admin',
      details: { taskId: req.params.id, validatorCount: validator_ids.length },
      outcome: 'success'
    });

    return res.json(ok(task));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// ADMIN: View task with full voting details
router.get('/tasks/:id/details', requireAdmin, async (req, res) => {
  try {
    const task = await TaskSubmission.findById(req.params.id).lean();
    if (!task) return res.status(404).json(fail('task not found'));

    // Get activity stats for assigned validators
    const assignedIds = task.assigned_validators || [];
    const activities = await MinesReviewer.find({ validator_id: { $in: assignedIds } }).lean();
    const activityMap = new Map();
    for (const a of activities) activityMap.set(a.validator_id, a);

    const assignedValidators = assignedIds.map(vid => {
      const activity = activityMap.get(vid) || {};
      const vote = task.validator_votes?.[vid] || null;
      return {
        validator_id: vid,
        vote,
        tasks_voted: activity.tasks_voted || 0,
        approval_rate: activity.approval_rate || 0,
        mining_reputation: activity.mining_reputation || 50,
      };
    });

    return res.json(ok({ task, assignedValidators }));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// ============ VALIDATOR: VIEW ASSIGNED TASKS & VOTE ============

// Validator: Get my assigned tasks
router.get('/my-assigned', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const validatorId = userId; // Use user ID as validator ID

    const candidates = await TaskSubmission.find({
      assigned_validators: validatorId,
      assignment_status: { $in: ['assigned', 'voting'] },
    }).sort({ assigned_at: -1 }).limit(50);

    // Lazily resolve any that are past their voting deadline (there is no
    // scheduler in this codebase; reads double as the sweep for expired votes).
    const tasks = [];
    for (const t of candidates) {
      const resolved = await minesReviewService.checkAndResolve(t);
      if (!resolved) tasks.push(t.toObject());
    }

    // Mark which ones have already been voted on
    const tasksWithVoteStatus = tasks.map(t => ({
      ...t,
      my_vote: t.validator_votes?.[validatorId] || null,
      has_voted: !!t.validator_votes?.[validatorId],
    }));

    return res.json(ok(tasksWithVoteStatus));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Validator: Cast a vote on an assigned task
router.post('/tasks/:id/vote', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const validatorId = userId;
    const { vote } = req.body;

    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json(fail('vote must be "yes" or "no"'));
    }

    const task = await TaskSubmission.findById(req.params.id);
    if (!task) return res.status(404).json(fail('task not found'));

    // Check if validator is assigned to this task
    const assignedList = (task.assigned_validators || []).map(String);
    if (!assignedList.includes(validatorId)) {
      return res.status(403).json(fail('you are not assigned to this task'));
    }

    // Check if already voted
    if (task.validator_votes?.[validatorId]) {
      return res.status(400).json(fail('you have already voted on this task'));
    }

    // Check voting deadline
    if (task.voting_deadline && new Date(task.voting_deadline) < new Date()) {
      return res.status(400).json(fail('voting deadline has passed'));
    }

    // Update reviewer activity first so we can weight this vote by their
    // current reputation (before this vote's own stats are folded in).
    const responseTime = task.assigned_at
      ? Date.now() - new Date(task.assigned_at).getTime()
      : 0;
    const reviewer = await MinesReviewer.findOneAndUpdate(
      { validator_id: validatorId },
      {
        $inc: {
          tasks_voted: 1,
          ...(vote === 'yes' ? { tasks_approved: 1 } : { tasks_rejected: 1 }),
        },
        $set: {
          last_vote_at: new Date(),
          avg_response_time_ms: responseTime,
        },
      },
      { upsert: true, new: true }
    );
    const weight = minesReviewService.computeWeight(reviewer);

    // Record vote
    if (!task.validator_votes) task.validator_votes = {};
    task.validator_votes[validatorId] = vote;

    if (vote === 'yes') {
      task.votes_yes = (task.votes_yes || 0) + 1;
      task.votes_yes_weight = (task.votes_yes_weight || 0) + weight;
    } else {
      task.votes_no = (task.votes_no || 0) + 1;
      task.votes_no_weight = (task.votes_no_weight || 0) + weight;
    }

    task.assignment_status = 'voting';

    // Check if all assigned validators have voted
    const totalVotes = (task.votes_yes || 0) + (task.votes_no || 0);
    if (totalVotes >= assignedList.length) {
      task.assignment_status = 'vote_complete';
    }

    await task.save();

    await AuditLog.create({
      action: 'validator_vote',
      actor: req.user?.email || validatorId,
      details: { taskId: req.params.id, vote, weight },
      outcome: 'success'
    });

    // Resolve automatically once every assigned reviewer has voted (or the
    // deadline has passed with quorum) — the weighted-threshold decision and
    // reward/penalty payout live in minesReviewService.checkAndResolve.
    const resolved = await minesReviewService.checkAndResolve(task);

    return res.json(ok({
      vote_recorded: true,
      current_votes: { yes: task.votes_yes, no: task.votes_no },
      weighted_votes: { yes: task.votes_yes_weight, no: task.votes_no_weight },
      status: resolved ? resolved.assignment_status : task.assignment_status,
    }));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// ============ ADMIN: FINAL APPROVAL (after votes are complete) ============

// Admin: Approve task after reviewing validator votes
router.post('/tasks/:id/final-approve', requireAdmin, async (req, res) => {
  try {
    const { rewardAmount } = req.body || {};
    const task = await TaskSubmission.findById(req.params.id);
    if (!task) return res.status(404).json(fail('task not found'));

    if (task.assignment_status !== 'vote_complete') {
      return res.status(400).json(fail(`votes are not complete. Status: ${task.assignment_status}`));
    }

    const yesVotes = task.votes_yes || 0;
    const noVotes = task.votes_no || 0;

    // Require majority YES votes
    if (yesVotes <= noVotes) {
      return res.status(400).json(fail(`majority rejected: ${noVotes} NO vs ${yesVotes} YES`));
    }

    // Determine reward: use provided amount, or auto-use campaign rate_per_task
    let finalReward = rewardAmount || task.reward_amount || 0;
    if (task.campaign_id && !rewardAmount) {
      const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
      const campaign = await Campaign.findById(task.campaign_id).lean();
      if (campaign && campaign.rate_per_task) {
        finalReward = campaign.rate_per_task;
      }
    }

    // Approve the task
    task.status = 'auto_approved';
    task.assignment_status = 'approved';
    task.completed_at = new Date();
    task.reward_amount = finalReward;
    await task.save();

    // Use transaction for atomic balance update
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Credit reward to miner via WalletTransaction
        const WalletTransaction = require('../models/WalletTransaction');
        await WalletTransaction.create([{
          user_id: task.miner_id,
          type: 'credit',
          amount: finalReward,
          currency: task.reward_currency || 'MLPTS',
          description: `Task reward approved after ${yesVotes} YES / ${noVotes} NO validator votes`,
        }], { session });

        // Update miner's mlpts_balance atomically
        await User.findByIdAndUpdate(task.miner_id, { $inc: { mlpts_balance: finalReward } }).session(session);
      });
    } finally {
      session.endSession();
    }

    // Update campaign budget if applicable
    const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
    if (task.campaign_id) {
      await Campaign.findByIdAndUpdate(task.campaign_id, {
        $inc: { completions_count: 1, budget_remaining: -finalReward },
      });
    }

    // Update validator earnings for those who voted YES
    for (const [vid, v] of Object.entries(task.validator_votes || {})) {
      if (v === 'yes') {
        await MinesReviewer.findOneAndUpdate(
          { validator_id: vid },
          { $inc: { total_earnings: Math.ceil(finalReward * 0.05) } }, // 5% bonus per validator
          { upsert: true }
        );
      }
    }

    await AuditLog.create({
      action: 'task_final_approve',
      actor: req.user?.email || 'admin',
      details: { taskId: req.params.id, yesVotes, noVotes, reward: finalReward },
      outcome: 'success'
    });

    notify(task.miner_id, {
      kind: 'mines',
      title: 'Submission approved',
      body: `Your Mines submission was approved by admin review — +${finalReward} ${task.reward_currency || 'MLPTS'}`,
    });

    return res.json(ok(task));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Admin: Reject task after reviewing validator votes
router.post('/tasks/:id/final-reject', requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const task = await TaskSubmission.findById(req.params.id);
    if (!task) return res.status(404).json(fail('task not found'));

    task.status = 'rejected';
    task.assignment_status = 'rejected';
    task.rejection_note = note || 'Rejected after validator review';
    await task.save();

    await AuditLog.create({
      action: 'task_final_reject',
      actor: req.user?.email || 'admin',
      details: { taskId: req.params.id, note },
      outcome: 'success'
    });

    notify(task.miner_id, {
      kind: 'mines',
      title: 'Submission rejected',
      body: task.rejection_note,
    });

    return res.json(ok(task));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// ============ REVIEWER: STAKE / PROFILE / LEADERBOARD ============
// A reviewer-specific off-chain MLPTS deposit, separate from x/mlcoin
// StakingRecords and from real Cosmos x/staking validator bonding — see
// models/MinesReviewer.js and services/minesReviewService.js.

// Reviewer: stake MLPTS to become (or stay) eligible for random assignment
router.post('/reviewer/stake', verifyToken, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json(fail('amount must be a positive number'));
    }

    const session = await mongoose.startSession();
    let reviewer;
    try {
      await session.withTransaction(async () => {
        const user = await User.findOneAndUpdate(
          { _id: req.userId, mlpts_balance: { $gte: amount } },
          { $inc: { mlpts_balance: -amount } },
          { session, new: true }
        );
        if (!user) throw new Error('insufficient MLPTS balance');

        reviewer = await MinesReviewer.findOneAndUpdate(
          { validator_id: req.userId },
          {
            $inc: { stakedAmount: amount },
            $setOnInsert: { moniker: user.username || user.email.split('@')[0], email: user.email },
          },
          { session, new: true, upsert: true }
        );
        reviewer.stakeStatus = reviewer.stakedAmount >= reviewer.minRequiredStake ? 'active' : 'unstaked';
        await reviewer.save({ session });
      });
    } finally {
      session.endSession();
    }

    return res.json(ok(reviewer));
  } catch (e) { return res.status(400).json(fail(e)); }
});

// Reviewer: withdraw stake (blocked while an assigned vote is still open)
router.post('/reviewer/unstake', verifyToken, async (req, res) => {
  try {
    const reviewer = await MinesReviewer.findOne({ validator_id: req.userId });
    if (!reviewer || reviewer.stakedAmount <= 0) {
      return res.status(400).json(fail('no stake to withdraw'));
    }

    const pendingVote = await TaskSubmission.findOne({
      assigned_validators: req.userId,
      assignment_status: { $in: ['assigned', 'voting'] },
      voting_deadline: { $gt: new Date() },
      [`validator_votes.${req.userId}`]: { $exists: false },
    }).lean();
    if (pendingVote) {
      return res.status(400).json(fail('cannot unstake while you have an open assigned vote'));
    }

    const amount = Number(req.body?.amount) || reviewer.stakedAmount;
    if (amount <= 0 || amount > reviewer.stakedAmount) {
      return res.status(400).json(fail('invalid unstake amount'));
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        reviewer.stakedAmount -= amount;
        reviewer.stakeStatus = reviewer.stakedAmount >= reviewer.minRequiredStake ? 'active' : 'unstaked';
        await reviewer.save({ session });
        await User.findByIdAndUpdate(req.userId, { $inc: { mlpts_balance: amount } }).session(session);
      });
    } finally {
      session.endSession();
    }

    return res.json(ok(reviewer));
  } catch (e) { return res.status(400).json(fail(e)); }
});

// Reviewer: my stake/reputation/earnings profile
router.get('/reviewer/profile', verifyToken, async (req, res) => {
  try {
    const reviewer = await MinesReviewer.findOne({ validator_id: req.userId }).lean();
    return res.json(ok(reviewer || {
      validator_id: req.userId,
      stakedAmount: 0,
      minRequiredStake: minesReviewService.MIN_REVIEWER_STAKE,
      stakeStatus: 'unstaked',
      mining_reputation: 50,
      tasks_assigned: 0,
      tasks_voted: 0,
      total_earnings: 0,
    }));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Public: top reviewers by reputation
router.get('/reviewer/leaderboard', async (_req, res) => {
  try {
    const reviewers = await MinesReviewer.find({ stakeStatus: { $ne: 'unstaked' } })
      .sort({ mining_reputation: -1, total_earnings: -1 })
      .limit(50)
      .lean();
    return res.json(ok(reviewers));
  } catch (e) { return res.status(500).json(fail(e)); }
});

module.exports = router;
