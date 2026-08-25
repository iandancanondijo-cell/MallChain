const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { requireAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const idempotency = require('../middleware/idempotency');

const User = require('../models/user');
const TaskSubmission = require('../models/TaskSubmission');
const Campaign = require('../models/Campaign');
const WalletTransaction = require('../models/WalletTransaction');
const { autoAssignReviewers } = require('../services/minesReviewService');
const { PLATFORMS, DEFAULT_DAILY_CAP_MLPTS, getDailyCapMlpts } = require('../config/socialRewardRates');
const { computeCampaignRate, clampMultiplier, MIN_CAMPAIGN_MULTIPLIER, MAX_CAMPAIGN_MULTIPLIER } = require('../services/rewardEngineService');
const { markActiveToday } = require('../utils/activityTracker');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), getJwtSecret());
    req.userId = payload.userId || payload.id;
    markActiveToday(req.userId); // fire-and-forget — feeds the badge streak, never blocks the request
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err, context = {}) {
  // Log full error internally with context
  logger.error('API error', { error: err.message || err, stack: err.stack, ...context });
  // Return generic message to client to avoid information leakage
  return { ok: false, error: 'Invalid request' };
}
// For expected, safe-to-show rejections (validation, business-rule limits) —
// unlike fail(), which deliberately genericizes everything to avoid leaking
// internals on real errors, these messages are meant to be read by the user.
function badRequest(res, message, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

// Public: the base reward-rate table campaign creators pick from, and what
// participants see so they know what a given action is worth before doing it.
router.get('/reward-rates', (_req, res) => {
  res.json(ok({
    platforms: PLATFORMS,
    defaultDailyCapMlpts: DEFAULT_DAILY_CAP_MLPTS,
    minMultiplier: MIN_CAMPAIGN_MULTIPLIER,
    maxMultiplier: MAX_CAMPAIGN_MULTIPLIER,
  }));
});

// Public endpoints (no auth required) - return empty array if DB unavailable
router.get('/campaigns/active', async (_req, res) => {
  try {
    const q = { status: 'active', budget_remaining: { $gt: 0 } };
    const rows = await Campaign.find(q).sort({ rate_per_task: -1 }).limit(50).lean();
    res.json(ok(rows));
  } catch (e) {
    // Return empty array if DB not configured for this collection
    res.json(ok([]));
  }
});

router.get('/campaigns/creator/:creatorId', async (req, res) => {
  try {
    const { creatorId } = req.params;
    const rows = await Campaign.find({ creator_id: creatorId }).sort({ created_at: -1 }).limit(100).lean();
    res.json(ok(rows));
  } catch (e) { res.status(500).json(fail(e)); }
});

// Public: top Campaign Participants by lifetime Mallpoints / tasks completed
router.get('/leaderboard', async (_req, res) => {
  try {
    const rows = await User.find({ banned: false })
      .sort({ mlpts_balance: -1 })
      .limit(50)
      .select('username email mlpts_balance tasks_completed rank_points')
      .lean();
    const leaderboard = rows.map((u) => ({
      id: u._id.toString(),
      name: u.username || u.email.split('@')[0],
      earned: u.mlpts_balance || 0,
      tasks: u.tasks_completed || 0,
      rankPoints: u.rank_points || 0,
    }));
    res.json(ok(leaderboard));
  } catch (e) {
    res.json(ok([]));
  }
});

// Authenticated endpoints
router.post('/campaigns', requireAdmin, async (req, res) => {
  try {
    const row = await Campaign.create(req.body);
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

// Self-serve campaign creation: any user can bring a content link +
// description, pick a platform/activity and a budget multiplier, and fund
// it from their own Mallpoints balance. rate_per_task is always
// server-computed (Base Reward x Campaign Multiplier) from the rate table —
// never trusted from the client — so a creator can't just declare an
// arbitrary payout. budget_mlpts is escrowed out of the creator's balance
// immediately so a campaign can never promise more than it can pay.
router.post('/campaigns/create', verifyToken, async (req, res) => {
  const { platform, activity_type, content_link, description, directive, multiplier, budget_mlpts } = req.body || {};

  const platformDef = PLATFORMS[platform];
  if (!platformDef) return badRequest(res, `unknown platform: ${platform}`);
  if (!platformDef.activities[activity_type]) {
    return badRequest(res, `unknown activity "${activity_type}" for platform "${platform}"`);
  }

  const budget = Number(budget_mlpts);
  if (!Number.isFinite(budget) || budget <= 0) {
    return badRequest(res, 'budget_mlpts must be a positive number');
  }
  if (!content_link || typeof content_link !== 'string') {
    return badRequest(res, 'content_link is required');
  }

  const clampedMultiplier = clampMultiplier(multiplier);
  const ratePerTask = computeCampaignRate({ platform, activity: activity_type, multiplier: clampedMultiplier });
  if (ratePerTask === null) return badRequest(res, 'could not compute a rate for this platform/activity');
  if (budget < ratePerTask) {
    return badRequest(res, `budget_mlpts must cover at least one completion (${ratePerTask} MLPTS)`);
  }

  try {
    const session = await mongoose.startSession();
    let campaign;
    try {
      await session.withTransaction(async () => {
        // Atomic balance check + deduct — same pattern as /balance/deduct below.
        const user = await User.findOneAndUpdate(
          { _id: req.userId, mlpts_balance: { $gte: budget } },
          { $inc: { mlpts_balance: -budget } },
          { session, new: true }
        );
        if (!user) {
          throw new Error('insufficient Mallpoints balance to fund this campaign');
        }

        const created = await Campaign.create([{
          creator_id: req.userId,
          title: `${platformDef.label} — ${activity_type.replace(/_/g, ' ')}`,
          description: description || '',
          content_link,
          directive: directive || '',
          platform,
          activity_type,
          base_rate_mlpts: ratePerTask / clampedMultiplier,
          multiplier: clampedMultiplier,
          rate_per_task: ratePerTask,
          budget_remaining: budget,
          status: 'active',
        }], { session });
        campaign = created[0];

        await WalletTransaction.create([{
          user_id: req.userId,
          type: 'debit',
          amount: budget,
          currency: 'MLPTS',
          description: `Campaign funding — ${platformDef.label} ${activity_type}`,
        }], { session });
      });
    } finally {
      session.endSession();
    }

    res.json(ok(campaign));
  } catch (e) {
    if (e.message === 'insufficient Mallpoints balance to fund this campaign') {
      return badRequest(res, e.message);
    }
    res.status(500).json(fail(e, { operation: 'campaign_create', userId: req.userId }));
  }
});

router.put('/campaigns/:id', requireAdmin, async (req, res) => {
  try {
    const row = await Campaign.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/profile/me', verifyToken, async (req, res) => {
   try {
     const u = await User.findById(req.userId).lean();
     if (!u) return res.status(404).json(fail('user not found'));
     res.json(ok({
       id: u._id.toString(),
       username: u.username || null,
       name: u.name || null,
       email: u.email,
       phone: u.phone || null,
       role: u.role,
       creator_level: u.creator_level,
       mlpts_balance: u.mlpts_balance || 0,
       mallcoin_balance: u.mallcoin_balance || 0,
       streak_count: u.streak_count || 0,
       tasks_completed: u.tasks_completed || 0,
       rank_points: u.rank_points || 0,
       fraud_strikes: u.fraud_strikes || 0,
       fraud_status: u.fraud_status || 'clear',
       created_at: (u.createdAt || u.created_at)?.toISOString() || new Date().toISOString(),
       updated_at: (u.updatedAt || u.updated_at)?.toISOString() || new Date().toISOString()
     }));
   } catch (e) { res.status(500).json(fail(e)); }
 });

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const updates = {};
    if (req.body.username !== undefined) updates.username = req.body.username;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    const u = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).lean();
    res.json(ok(u));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const rows = await WalletTransaction.find({ user_id: req.userId }).sort({ created_at: -1 }).limit(limit).lean();
    res.json(ok(rows));
  } catch (e) { res.status(500).json(fail(e)); }
});

router.post('/transactions', verifyToken, async (req, res) => {
  try {
    const row = await WalletTransaction.create({ ...req.body, user_id: req.userId });
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/submissions/me', verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const page = Math.max(parseInt(req.query.page || '0', 10), 0);
    const rows = await TaskSubmission.find({ miner_id: req.userId }).sort({ created_at: -1 }).skip(page * limit).limit(limit).lean();
    res.json(ok(rows));
  } catch (e) { res.status(500).json(fail(e)); }
});

// Anti-abuse for campaign submissions: caps how many times one user can be
// rewarded per campaign, enforces a cooldown between their submissions to
// it, and caps how much they can have pending/earned on that platform in a
// rolling 24h window. Not unrestricted engagement farming — a submission
// only ever pays out after reviewer-vote approval (settle(), see
// minesReviewService.js), this just bounds how much can be *queued up*.
// No-op (returns ok) for non-campaign submissions.
async function checkCampaignAbuseLimits(userId, campaignId, session) {
  if (!campaignId) return { ok: true };

  const campaign = await Campaign.findById(campaignId).session(session).lean();
  if (!campaign) return { ok: false, error: 'campaign not found' };
  if (campaign.status !== 'active' || campaign.budget_remaining <= 0) {
    return { ok: false, error: 'campaign is no longer accepting submissions' };
  }

  const existing = await TaskSubmission.find({
    miner_id: userId,
    campaign_id: campaignId,
    status: { $ne: 'rejected' },
  }).session(session).sort({ created_at: -1 }).lean();

  const maxPerUser = campaign.max_completions_per_user || 1;
  if (existing.length >= maxPerUser) {
    return { ok: false, error: `you've already reached the limit (${maxPerUser}) of rewarded submissions for this campaign` };
  }

  const cooldownMs = (campaign.cooldown_seconds || 0) * 1000;
  if (cooldownMs > 0 && existing[0]) {
    const lastAt = new Date(existing[0].created_at).getTime();
    const elapsedMs = Date.now() - lastAt;
    if (elapsedMs < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return { ok: false, error: `please wait ${waitSec}s before submitting to this campaign again` };
    }
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let recentSameplatform;
  try {
    recentSameplatform = await TaskSubmission.aggregate([
      { $match: { miner_id: userId, status: { $ne: 'rejected' }, created_at: { $gte: dayAgo }, campaign_id: { $ne: null } } },
      { $lookup: { from: 'campaigns', localField: 'campaign_id', foreignField: '_id', as: 'campaign' } },
      { $unwind: '$campaign' },
      { $match: { 'campaign.platform': campaign.platform } },
      // reward_amount is only populated at settle() time (0 for anything
      // still pending review), so summing it here would silently ignore
      // every not-yet-reviewed submission and let the daily cap be blown
      // through by queuing many pending ones. campaign.rate_per_task is
      // each submission's committed value regardless of review state — a
      // rejected one is already excluded by the $match above.
      { $group: { _id: null, total: { $sum: '$campaign.rate_per_task' }, pendingCount: { $sum: 1 } } },
    ]).session(session);
  } catch (err) {
    // Fail closed: an unreadable aggregate must not silently disable the
    // cap (same reasoning as sellGateService's liquidity check).
    return { ok: false, error: 'unable to verify daily earning cap right now, please try again shortly' };
  }

  const dailyCap = getDailyCapMlpts(campaign.platform);
  const pendingTotal = (recentSameplatform[0]?.total || 0) + campaign.rate_per_task;
  if (pendingTotal > dailyCap) {
    return { ok: false, error: `daily earning cap for ${campaign.platform} is ${dailyCap} MLPTS — try again tomorrow` };
  }

  return { ok: true };
}

router.post('/submissions', verifyToken, async (req, res) => {
  // The check-then-create below must be atomic: without a transaction,
  // concurrent requests for the same campaign can all read the same
  // under-limit submission count before any of their creates land,
  // letting a user blow past max_completions_per_user/cooldown/daily-cap.
  const session = await mongoose.startSession();
  try {
    let row;
    await session.withTransaction(async () => {
      const abuseCheck = await checkCampaignAbuseLimits(req.userId, req.body?.campaign_id, session);
      if (!abuseCheck.ok) {
        const err = new Error(abuseCheck.error);
        err.abuseCheck = true;
        throw err;
      }

      const body = { ...req.body, miner_id: req.userId };
      [row] = await TaskSubmission.create([body], { session });
    });
    // Randomly assign up to 6 staked reviewers; if none are eligible yet the
    // submission is untouched and falls back to the admin manual-review queue.
    await autoAssignReviewers(row);
    res.json(ok(row));
  } catch (e) {
    if (e.abuseCheck) return badRequest(res, e.message, 429);
    res.status(400).json(fail(e));
  } finally {
    session.endSession();
  }
});

router.put('/submissions/:id', verifyToken, async (req, res) => {
  try {
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json(fail('submission not found'));
    if (sub.miner_id !== req.userId) return res.status(403).json(fail('forbidden: not your submission'));
    
    const row = await TaskSubmission.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/submissions/pending', requireAdmin, async (_req, res) => {
  try {
    const rows = await TaskSubmission.find({ status: 'manual_review' }).sort({ created_at: -1 }).limit(50).lean();
    res.json(ok(rows));
  } catch (e) { res.json(ok([])); }
});

router.post('/submissions/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { rewardAmount } = req.body || {};
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json(fail('submission not found'));

    // Determine reward: use provided amount, or auto-use campaign rate_per_task
    let finalReward = rewardAmount || 0;
    if (sub.campaign_id && !rewardAmount) {
      const campaign = await Campaign.findById(sub.campaign_id).lean();
      if (campaign && campaign.rate_per_task) {
        finalReward = campaign.rate_per_task;
      }
    }

    const updated = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'auto_approved', completed_at: new Date().toISOString(), reward_amount: finalReward } },
      { new: true }
    ).lean();

    // Use transaction for atomic balance update
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Create wallet transaction record
        await WalletTransaction.create([{
          user_id: sub.miner_id,
          type: 'credit',
          amount: finalReward,
          currency: 'MLPTS',
          description: 'Task reward approved by admin',
        }], { session });

        // Update user's mlpts_balance atomically
        await User.findByIdAndUpdate(sub.miner_id, { $inc: { mlpts_balance: finalReward } }).session(session);
      });
    } finally {
      session.endSession();
    }

    if (sub.campaign_id) {
      await Campaign.findByIdAndUpdate(sub.campaign_id, {
        $inc: { completions_count: 1, budget_remaining: -finalReward },
      });
    }
    res.json(ok(updated));
  } catch (e) { res.status(500).json(fail(e)); }
});

router.post('/submissions/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const row = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'rejected', rejection_note: note || null } },
      { new: true }
    ).lean();
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

// Balance operations - for cross-app MLPTS sync (admin only)
router.post('/balance/credit', idempotency({ required: true }), requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { amount, userId } = req.body;
      if (typeof amount !== 'number' || amount <= 0) throw new Error('invalid amount');
      if (!userId) throw new Error('userId required');
      if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error('invalid userId format');
      
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('user not found');
      
      await User.findByIdAndUpdate(userId, { $inc: { mlpts_balance: amount } }).session(session);
      await WalletTransaction.create([{
        user_id: userId,
        type: 'credit',
        amount,
        currency: 'MLPTS',
        description: 'Balance credit by admin',
      }], { session });
    });
    res.json(ok({ success: true }));
  } catch (e) { res.status(500).json(fail(e, { operation: 'balance_credit' })); }
  finally { session.endSession(); }
});

router.post('/balance/deduct', idempotency({ required: true }), requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { amount, userId } = req.body;
      if (typeof amount !== 'number' || amount <= 0) throw new Error('invalid amount');
      if (!userId) throw new Error('userId required');
      if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error('invalid userId format');
      
      // C5: Atomic balance check and deduct
      const result = await User.findOneAndUpdate(
        { _id: userId, mlpts_balance: { $gte: amount } },
        { $inc: { mlpts_balance: -amount } },
        { session, new: true }
      );
      
      if (!result) throw new Error('insufficient balance or user not found');
      
      await WalletTransaction.create([{
        user_id: userId,
        type: 'debit',
        amount,
        currency: 'MLPTS',
        description: 'Balance deduction by admin',
      }], { session });
    });
    res.json(ok({ success: true }));
  } catch (e) { res.status(500).json(fail(e, { operation: 'balance_deduct' })); }
  finally { session.endSession(); }
});

module.exports = router;