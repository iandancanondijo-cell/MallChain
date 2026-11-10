const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TaskSubmission = require('../models/TaskSubmission');
const Campaign = require('../models/Campaign');
const MinesReviewer = require('../models/MinesReviewer');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const AuditLog = require('../models/AuditLog');
const { requireAdmin } = require('../middleware/adminAuth');
const jwt = require('jsonwebtoken');
const minesReviewService = require('../services/minesReviewService');
const validatorEligibility = require('../services/validatorEligibility');
const { notify } = require('../services/notify');
const { syncMallPointAccount } = require('../services/mallpointsService');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;

// ============ MIDDLEWARE ============
function verifyToken(req, res, next) {
  // This predates the JWT->httpOnly-cookie migration and never got updated
  // — it only ever checked the Authorization header, so every
  // /api/task-assignment route has been unreachable from the actual web
  // app (which stopped sending that header) since that migration shipped.
  // Mirrors middleware/requireAuth.js's dual bearer/cookie extraction,
  // minus the jti revocation check — see the identical fix + comment in
  // routes/mines.js's verifyToken.
  const auth = req.headers.authorization || '';
  let token = null;
  if (auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }
  if (!token) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId || payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err) {
  if (typeof err === 'string') return { ok: false, error: err };
  logger.error('taskAssignment', { error: err.message || String(err) });
  return { ok: false, error: 'internal error' };
}

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

// Get the accounts this window may hand a task to.
//
// Two halves, both required (see services/validatorEligibility.js): an admin
// approved the account's validator application ("allowed"), and it holds an
// active reviewer bond ("staked"). This route used to derive the first half
// from a user's *role* — every admin/superadmin account was listed as an
// approved validator whether or not it had ever applied — which is how an
// account with no application and no stake ended up in an assignment list
// whose votes /tasks/:id/vote would then refuse. Rows here are annotated
// rather than hidden: an approved-but-unbonded moniker is something the admin
// can act on (ask for the stake), while an admin role with no application is
// simply not a validator and is not listed at all.
router.get('/validators/active', requireAdmin, async (_req, res) => {
  try {
    const { byKey } = await validatorEligibility.allowedValidatorMap();
    const keys = [...byKey.keys()];
    const activities = await MinesReviewer.find({ validator_id: { $in: keys } }).lean();
    const activityMap = new Map(activities.map((a) => [String(a.validator_id), a]));

    const validators = keys.map((key) => {
      const app = byKey.get(key);
      const activity = activityMap.get(key) || {};
      const staked = activity.stakeStatus === 'active';
      return {
        _id: app.userId || key,
        validator_id: key,
        validator_address: app.validatorAddress || '',
        applicant_address: app.applicantAddress || '',
        moniker: app.moniker || 'Unknown Validator',
        type: 'validator',
        selfDelegationAmount: app.selfDelegationAmount,
        application_reviewed_at: app.reviewedAt || null,
        allowed: true,
        staked,
        stake_status: activity.stakeStatus || 'unstaked',
        staked_amount: activity.stakedAmount || 0,
        min_required_stake: activity.minRequiredStake ?? minesReviewService.MIN_REVIEWER_STAKE,
        eligible: staked,
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

    // Assignable candidates first, then the best-reputation ones.
    validators.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.mining_reputation - a.mining_reputation);

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

    // The gate itself, checked at the moment duties (and later, MLPTS) are
    // handed out rather than only in whatever UI listed the candidates:
    // /validators/active can show an approved moniker that has not bonded yet,
    // and a stale browser tab can post ids that were never eligible.
    const assignedIds = validator_ids.map(String);
    const [{ byKey }, bondRows] = await Promise.all([
      validatorEligibility.allowedValidatorMap(),
      MinesReviewer.find({ validator_id: { $in: assignedIds } }).lean(),
    ]);
    const bondByKey = new Map(bondRows.map((r) => [String(r.validator_id), r]));
    const notAllowed = assignedIds.filter((id) => !byKey.has(id));
    const notStaked = assignedIds.filter((id) => bondByKey.get(id)?.stakeStatus !== 'active');
    if (notAllowed.length > 0 || notStaked.length > 0) {
      const parts = [];
      if (notAllowed.length > 0) parts.push(`no approved validator application: ${notAllowed.slice(0, 6).join(', ')}`);
      if (notStaked.length > 0) parts.push(`no active reviewer stake: ${notStaked.slice(0, 6).join(', ')}`);
      return res.status(400).json(fail(`every assigned validator must be approved and staked — ${parts.join('; ')}`));
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
      actor: (req.user ? User.decryptUserPii(req.user).email : null) || 'admin',
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

    // Hydrate the campaign each submission claims to satisfy. A reviewer
    // voting on "did this person do the task" without seeing the task's
    // published link and rate is guessing, and the proof they're shown is
    // only half the evidence. campaign_id is a Mixed written as a string, so
    // the lookup has to tolerate both shapes rather than assume an ObjectId.
    const campaignIds = [...new Set(
      tasksWithVoteStatus.map((t) => t.campaign_id).filter(Boolean).map(String)
    )].map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id));
    const campaigns = await Campaign
      .find({ _id: { $in: campaignIds } })
      .select('title content_link platform rate_per_task status').lean().catch(() => []);
    const byCampaign = new Map(campaigns.map((c) => [String(c._id), c]));

    const hydrated = tasksWithVoteStatus.map((t) => {
      const c = t.campaign_id ? byCampaign.get(String(t.campaign_id)) : null;
      return {
        ...t,
        campaign_title: c?.title || '',
        campaign_content_link: c?.content_link || '',
        campaign_platform: c?.platform || '',
        campaign_rate_per_task: c?.rate_per_task ?? null,
        campaign_status: c?.status || '',
      };
    });

    return res.json(ok(hydrated));
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

    // Assignments only ever come from the eligible (approved *and* staked)
    // pool, and /reviewer/unstake refuses to release a stake while a vote is
    // still open, so a reviewer who reaches this line without both halves got
    // that state after being assigned — normally by being suspended for missed
    // votes, or by an admin withdrawing their approval mid-round. Votes are
    // weighted by reputation and pay MLPTS, so the bond is what makes the
    // weight honest and the approval is what makes the reviewer one at all.
    const votingReviewer = await MinesReviewer.findOne({ validator_id: validatorId }).lean();
    if (!votingReviewer || votingReviewer.stakeStatus !== 'active') {
      return res.status(403).json(fail('an active reviewer stake is required to vote'));
    }
    if (!(await validatorEligibility.allowedAccountKeys()).has(String(validatorId))) {
      return res.status(403).json(fail('your validator approval no longer covers this review'));
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
    // Weight uses the reviewer's reputation as it stood going into this vote
    // (the atomic $inc above only touched the raw counters — the derived
    // reputation formula is recomputed and persisted just below, for the
    // *next* vote/read to see).
    const weight = minesReviewService.computeWeight(reviewer);
    await minesReviewService.refreshReviewerStats(validatorId);

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

    // Left as 'voting' here even once every reviewer has cast a vote —
    // checkAndResolve() (below) independently recomputes that same
    // "all voted" condition and is the one place allowed to advance
    // assignment_status past 'voting', since only it also runs settle().
    // Setting 'vote_complete' here would make checkAndResolve's own guard
    // (`if (!['assigned','voting'].includes(...)) return null;`) bail out
    // immediately, skipping settlement entirely.
    task.assignment_status = 'voting';

    await task.save();

    await AuditLog.create({
      action: 'validator_vote',
      actor: (req.user ? User.decryptUserPii(req.user).email : null) || validatorId,
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

// ============ ADMIN: FINAL REJECTION (manual override) ============
//
// There used to be a matching POST /tasks/:id/final-approve here, gated on
// assignment_status === 'vote_complete'. Nothing ever sets that status —
// checkAndResolve() (see the vote handler above) resolves straight from
// 'voting' to 'auto_approved'/'rejected' and is the only path that also
// runs minesReviewService.settle() for payout. final-approve was therefore
// unreachable, and its own reward logic (a flat 5% bonus per YES voter) was
// inconsistent with settle()'s real VOTE_REWARD payout — reintroducing it
// without reconciling both would risk double-paying reviewers. Removed
// rather than wired back up; final-reject below has no such gate since it
// doesn't touch rewards.

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
      actor: (req.user ? User.decryptUserPii(req.user).email : null) || 'admin',
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
        const plain = User.decryptUserPii(user);

        reviewer = await MinesReviewer.findOneAndUpdate(
          { validator_id: req.userId },
          {
            $inc: { stakedAmount: amount },
            $setOnInsert: { moniker: user.username || plain.email?.split('@')[0], email: plain.email },
          },
          { session, new: true, upsert: true }
        );
        reviewer.stakeStatus = reviewer.stakedAmount >= reviewer.minRequiredStake ? 'active' : 'unstaked';
        await reviewer.save({ session });

        // GATE 61: Synchronize stake debit to MallPointAccount
        await syncMallPointAccount(plain.walletAddress, -amount, session, {
          userId: req.userId,
          flow: 'reviewer_stake',
        });
        await WalletTransaction.create([{
          user_id: req.userId,
          type: 'debit',
          amount,
          currency: 'MLPTS',
          description: `Reviewer stake locked (${reviewer.stakedAmount} MLPTS total)`,
        }], { session });
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
        const user = await User.findById(req.userId).session(session);
        await User.findByIdAndUpdate(req.userId, { $inc: { mlpts_balance: amount } }).session(session);

        // GATE 61: Synchronize unstake return credit to MallPointAccount
        await syncMallPointAccount(user ? User.decryptUserPii(user).walletAddress : undefined, amount, session, {
          userId: req.userId,
          flow: 'reviewer_unstake',
        });
        await WalletTransaction.create([{
          user_id: req.userId,
          type: 'credit',
          amount,
          currency: 'MLPTS',
          description: `Reviewer stake returned (${reviewer.stakedAmount} MLPTS still locked)`,
        }], { session });
      });
    } finally {
      session.endSession();
    }

    return res.json(ok(reviewer));
  } catch (e) { return res.status(400).json(fail(e)); }
});

// Reviewer: how much verification work exists, and how much of it is this
// reviewer's.
//
// The queue screen can only list what /my-assigned hands it, so an empty queue
// used to read as "nothing needs reviewing" even when submissions were sitting
// unassigned — the case where a reviewer's stake is most needed. These counts
// come from the submissions themselves. They are deliberately not resolved
// against the voting deadlines first: /my-assigned sweeps expired rounds as it
// reads, so the same row can appear here a moment before it settles elsewhere.
// `pending_count` is therefore the honest "awaiting a decision" number, and the
// oldest one is dated rather than aged into a claim about how long it has been
// stuck. See routes/mines.js's TERMINAL_STATUSES — the same three statuses end a
// submission here as everywhere else.
router.get('/reviewer/queue-summary', verifyToken, async (req, res) => {
  try {
    const validatorId = req.userId;
    const TERMINAL = ['auto_approved', 'approved', 'rejected'];
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [awaiting, unassigned, settledRows, mine, oldest] = await Promise.all([
      TaskSubmission.countDocuments({ status: { $nin: TERMINAL } }),
      TaskSubmission.countDocuments({
        status: { $nin: TERMINAL },
        $or: [{ assigned_validators: { $size: 0 } }, { assigned_validators: null }],
      }),
      TaskSubmission.countDocuments({ status: { $in: TERMINAL }, completed_at: { $gte: dayAgo } }),
      TaskSubmission.find({
        assigned_validators: validatorId,
        assignment_status: { $in: ['assigned', 'voting'] },
      }).select('validator_votes').lean(),
      TaskSubmission.findOne({ status: { $nin: TERMINAL } }).sort({ created_at: 1 }).select('created_at').lean(),
    ]);

    // One submission is assigned to several reviewers at once, so
    // `assigned_to_me` cannot be subtracted from `awaiting` to find the
    // unclaimed work — that is counted from the assignment array itself.
    res.json(ok({
      awaiting_verification: awaiting,
      awaiting_assignment: unassigned,
      assigned_to_me: mine.length,
      waiting_for_my_vote: mine.filter((t) => !t.validator_votes || !t.validator_votes[validatorId]).length,
      settled_last_24h: settledRows,
      oldest_waiting_since: oldest?.created_at || null,
      currency: 'MLPTS',
      source: 'task_submissions',
    }));
  } catch (e) { return res.status(500).json(fail(e)); }
});

// Reviewer: my stake/reputation/earnings profile, plus both halves of the
// validator rule. stakeStatus on its own used to read as "you are a reviewer"
// to the UI while an account with no approved application was never eligible
// for assignment at all — the two states are reported separately so the page
// can name the half that is missing. A failed allow-list read is null ("not
// reported"), never false, because false would tell someone their application
// was withdrawn when nothing checked it.
router.get('/reviewer/profile', verifyToken, async (req, res) => {
  try {
    const reviewer = await MinesReviewer.findOne({ validator_id: req.userId }).lean();
    let allowed = null;
    try {
      allowed = (await validatorEligibility.allowedAccountKeys()).has(String(req.userId));
    } catch (e) {
      logger.error('taskAssignment', { route: '/reviewer/profile', error: e.message });
    }
    const staked = Boolean(reviewer && reviewer.stakeStatus === 'active');
    const base = reviewer || {
      validator_id: req.userId,
      stakedAmount: 0,
      minRequiredStake: minesReviewService.MIN_REVIEWER_STAKE,
      stakeStatus: 'unstaked',
      mining_reputation: 50,
      tasks_assigned: 0,
      tasks_voted: 0,
      total_earnings: 0,
    };
    return res.json(ok({
      ...base,
      validator_allowed: allowed,
      review_eligible: allowed === null ? null : allowed && staked,
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
