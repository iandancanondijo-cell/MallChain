const express = require('express');
const router = express.Router();
const TaskSubmission = require('../models/TaskSubmission');
const ValidatorActivity = require('../models/ValidatorActivity');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const { requireAdmin } = require('../middleware/adminAuth');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// ============ MIDDLEWARE ============
function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.id;
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
    const activities = await ValidatorActivity.find({ validator_id: { $in: validatorIds } }).lean();
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
      await ValidatorActivity.findOneAndUpdate(
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
    const activities = await ValidatorActivity.find({ validator_id: { $in: assignedIds } }).lean();
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
    const user = await User.findById(userId);
    const validatorId = userId; // Use user ID as validator ID

    const tasks = await TaskSubmission.find({
      assigned_validators: validatorId,
      assignment_status: { $in: ['assigned', 'voting'] },
    }).sort({ assigned_at: -1 }).limit(50).lean();

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

    // Record vote
    if (!task.validator_votes) task.validator_votes = {};
    task.validator_votes[validatorId] = vote;

    if (vote === 'yes') task.votes_yes = (task.votes_yes || 0) + 1;
    else task.votes_no = (task.votes_no || 0) + 1;

    task.assignment_status = 'voting';

    // Check if all assigned validators have voted
    const totalVotes = (task.votes_yes || 0) + (task.votes_no || 0);
    if (totalVotes >= assignedList.length) {
      task.assignment_status = 'vote_complete';
    }

    await task.save();

    // Update validator activity
    const responseTime = task.assigned_at
      ? Date.now() - new Date(task.assigned_at).getTime()
      : 0;

    await ValidatorActivity.findOneAndUpdate(
      { validator_id: validatorId },
      {
        $inc: {
          tasks_voted: 1,
          ...(vote === 'yes' ? { tasks_approved: 1 } : { tasks_rejected: 1 }),
        },
        $set: {
          last_vote_at: new Date(),
          // Update average response time (running average)
          avg_response_time_ms: responseTime,
        },
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      action: 'validator_vote',
      actor: req.user?.email || validatorId,
      details: { taskId: req.params.id, vote },
      outcome: 'success'
    });

    return res.json(ok({
      vote_recorded: true,
      current_votes: { yes: task.votes_yes, no: task.votes_no },
      status: task.assignment_status,
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

    // Credit reward to miner via WalletTransaction
    const WalletTransaction = require('../models/WalletTransaction');
    await WalletTransaction.create({
      user_id: task.miner_id,
      type: 'credit',
      amount: finalReward,
      currency: task.reward_currency || 'MLPTS',
      description: `Task reward approved after ${yesVotes} YES / ${noVotes} NO validator votes`,
    });

    // Update miner's mlpts_balance directly
    await User.findByIdAndUpdate(task.miner_id, { $inc: { mlpts_balance: finalReward } });

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
        await ValidatorActivity.findOneAndUpdate(
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

    return res.json(ok(task));
  } catch (e) { return res.status(500).json(fail(e)); }
});

module.exports = router;
