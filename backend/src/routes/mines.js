const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdmin } = require('../middleware/adminAuth');
const requireAuth = require('../middleware/requireAuth');
const activityEvents = require('../services/activityEvents');
const logger = require('../utils/logger');
const idempotency = require('../middleware/idempotency');

const User = require('../models/user');
const TaskSubmission = require('../models/TaskSubmission');
const Campaign = require('../models/Campaign');
const WalletTransaction = require('../models/WalletTransaction');
const MallPointAccount = require('../models/MallPointAccount');
const { autoAssignReviewers, checkAndResolve } = require('../services/minesReviewService');
const { PLATFORMS, DEFAULT_DAILY_CAP_MLPTS, getDailyCapMlpts } = require('../config/socialRewardRates');
const { computeCampaignRate, clampMultiplier, MIN_CAMPAIGN_MULTIPLIER, MAX_CAMPAIGN_MULTIPLIER } = require('../services/rewardEngineService');
const { markActiveToday } = require('../utils/activityTracker');
const { syncMallPointAccount, requireWalletAddress } = require('../services/mallpointsService');
const { uploadProof, PROOFS_UPLOAD_DIR } = require('../middleware/upload');
const { appendAuditEvent } = require('../services/auditChainService');
const linkPolicy = require('../utils/linkPolicy');
const fs = require('fs');
const path = require('path');

const SUBMISSION_CREATE_FIELDS = ['campaign_id', 'title', 'task_type', 'description', 'proof_url'];
const SUBMISSION_UPDATE_FIELDS = ['title', 'task_type', 'description', 'proof_url'];

// A submission that has already been paid or refused. The reviewer-vote path
// (minesReviewService.settle) and both admin approve/reject routes write one
// of these, and every route that moves money has to refuse to touch a
// submission already in the set — otherwise a second approval (or a late
// reviewer vote landing after an admin approval) pays the same task twice.
const TERMINAL_STATUSES = ['auto_approved', 'approved', 'rejected'];

/**
 * Validates and normalizes an incoming `proof_url` for storage. Same rules on
 * every write path: an uploaded screenshot ref owned by this user and
 * present on disk, or a real http(s) URL. Anything else — including a
 * `javascript:` payload that would later fire on whoever reviews the
 * submission — is rejected with a message the submitter can act on.
 */
function storableProofUrl(value, userId) {
  return linkPolicy.assertStorableProofUrl(value, {
    userId,
    proofExistsOnDisk: (name) => fs.existsSync(path.join(PROOFS_UPLOAD_DIR, name)),
  });
}

function pick(obj, fields) {
  const out = {};
  for (const f of fields) {
    if (obj[f] !== undefined) out[f] = obj[f];
  }
  return out;
}

const _requireAuth = requireAuth();
function minesAuth(req, res, next) {
  _requireAuth(req, res, () => {
    req.userId = req.user?._id?.toString();
    next();
  });
}

function ok(data) { return { ok: true, data }; }
function fail(err, context = {}) {
  // Log full error internally with context
  logger.error('API error', { error: err.message || err, stack: err.stack, ...context });
  // Surface actual validation messages to the client (frontend reads `error`
  // key via minesApi unwrap()). Unexpected/internal errors stay generic to
  // avoid information leakage.
  if (typeof err === 'string') return { ok: false, error: err };
  if (err && err.name === 'ValidationError') {
    const details = Object.values(err.errors || {})
      .map((v) => v.message)
      .filter(Boolean)
      .join('; ');
    return { ok: false, error: details || err.message || 'Invalid request' };
  }
  if (err && err.name === 'CastError') {
    return { ok: false, error: `Invalid value for "${err.path}"` };
  }
  // Mongoose duplicate-key / other errors with a safe, purpose-written message
  if (err && err.name === 'MongoServerError' && err.code === 11000) {
    return { ok: false, error: 'Duplicate value for a unique field' };
  }
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

// Public: top Campaign Participants by what Mines actually paid them.
//
// This used to rank every account by their *current* mlpts_balance and label
// it "lifetime Mallpoints" — so the board rewarded anyone who had never
// completed a task but had received a referral credit, and a top miner who
// spent or staked their points fell down it. It also fell back to an email
// local-part as the display name for users without a username, leaking a
// piece of a PII field on an unauthenticated endpoint.
// Now: sum the settled rewards on this user's approved submissions, show a
// username or an anonymous handle, and skip banned accounts.
router.get('/leaderboard', async (_req, res) => {
  try {
    const ranked = await TaskSubmission.aggregate([
      { $match: { status: { $in: ['auto_approved', 'approved'] }, miner_id: { $ne: null } } },
      { $group: { _id: { $toString: '$miner_id' }, earnedMlpts: { $sum: '$reward_amount' }, tasks: { $sum: 1 } } },
      { $sort: { earnedMlpts: -1, tasks: -1 } },
      { $limit: 50 },
      { $lookup: {
        from: 'users',
        let: { uid: '$_id' },
        pipeline: [
          { $project: { idStr: { $toString: '$_id' }, username: 1, banned: 1, rank_points: 1 } },
          { $match: { $expr: { $eq: ['$idStr', '$$uid'] } } },
        ],
        as: 'user',
      } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ]);

    const leaderboard = ranked
      .filter((r) => r.user && r.user.banned !== true)
      .map((r, i) => ({
        id: r._id,
        name: r.user.username || `participant ${String(r._id).slice(-6)}`,
        earned: r.earnedMlpts || 0,
        tasks: r.tasks || 0,
        rankPoints: r.user.rank_points || 0,
        position: i + 1,
      }));
    res.json(ok(leaderboard));
  } catch (e) {
    res.json(ok([]));
  }
});

// Authenticated endpoints
// Tamper-evident chain audit for the admin-privileged mutations in this
// file (campaign CRUD, submission review, balance credit/deduct). The
// append is non-fatal and serialized inside the service.
function chainMinesAudit(req, action, target, payload = {}) {
  const u = req.user || {};
  return appendAuditEvent({ id: String(u._id || u.id || 'admin'), role: String(u.role || 'admin') }, action, target, payload);
}

router.post('/campaigns', requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };
    // Same rule as self-serve creation: even an admin-authored campaign must
    // not publish a link the participant UI cannot safely open.
    if (body.content_link !== undefined) {
      try {
        body.content_link = linkPolicy.assertStorableContentLink(body.content_link);
      } catch (e) {
        return badRequest(res, e.message);
      }
    }
    const row = await Campaign.create(body);
    chainMinesAudit(req, 'mines_campaign_created', `campaign:${row._id}`, { title: req.body?.title ?? null });
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
router.post('/campaigns/create', minesAuth, async (req, res) => {
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
  // The link is published to every participant as a clickable "open the task"
  // target, so it goes through the same allowlist as proof links: an http(s)
  // URL only. `new URL("javascript:…")` parses, so a scheme check — not a
  // parse check — is what keeps a creator from shipping a payload that runs
  // in each participant's session.
  let safeContentLink;
  try {
    safeContentLink = linkPolicy.assertStorableContentLink(content_link);
  } catch (e) {
    return badRequest(res, e.message);
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
          content_link: safeContentLink,
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

        // GATE 61: Synchronize campaign debit to MallPointAccount for conversion consistency
        await syncMallPointAccount(User.decryptUserPii(user).walletAddress, -budget, session, {
          userId: req.userId,
          flow: 'mines_campaign_create',
        });
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
    // Whitelist allowed fields — $set: req.body would let an attacker set
    // any model field (budget, creatorId, status, etc.).
    const allowed = ['title', 'description', 'platform', 'status', 'budget', 'endDate', 'rewardPerVerification'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const row = await Campaign.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!row) return res.status(404).json(fail('campaign not found'));
    chainMinesAudit(req, 'mines_campaign_updated', `campaign:${req.params.id}`, { updatedFields: Object.keys(updates) });
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/profile/me', minesAuth, async (req, res) => {
   try {
     const raw = await User.findById(req.userId).lean();
     if (!raw) return res.status(404).json(fail('user not found'));
     const u = User.decryptUserPii(raw);
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

router.put('/profile', minesAuth, async (req, res) => {
  try {
    // Hydrated doc + save(), not findByIdAndUpdate: the pre('save') hook is
    // what encrypts phone and recomputes phone_blind. A $set through
    // findByIdAndUpdate would store plaintext phone and leave the blind
    // index pointing at the old value.
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json(fail('user not found'));
    if (req.body.username !== undefined) u.username = req.body.username;
    if (req.body.phone !== undefined) u.phone = req.body.phone;
    await u.save();
    const plain = User.decryptUserPii(u);
    delete plain.password;
    res.json(ok(plain));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/transactions', minesAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const rows = await WalletTransaction.find({ user_id: req.userId }).sort({ created_at: -1 }).limit(limit).lean();
    res.json(ok(rows));
  } catch (e) { res.status(500).json(fail(e)); }
});

router.post('/transactions', minesAuth, async (req, res) => {
  try {
    const allowed = pick(req.body, ['type', 'amount', 'currency', 'description', 'reference_id', 'reference_type']);
    const row = await WalletTransaction.create({ ...allowed, user_id: req.userId });
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/submissions/me', minesAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const page = Math.max(parseInt(req.query.page || '0', 10), 0);
    // Hydrated documents, not .lean(): a submission whose voting window has
    // closed still has to be settle()d, and settle() saves. There is no
    // scheduler in this codebase, so reads are the sweep — reviewers already
    // resolve expired tasks when they open their queue
    // (taskAssignment.js /my-assigned); before this, a task assigned to
    // reviewers who never opened the app stayed "pending" for its owner
    // forever, with the campaign budget stuck behind it.
    const rows = await TaskSubmission.find({ miner_id: req.userId })
      .sort({ created_at: -1 }).skip(page * limit).limit(limit);

    const out = [];
    for (const t of rows) {
      let doc = t;
      if (['assigned', 'voting'].includes(t.assignment_status)
        && t.voting_deadline && new Date(t.voting_deadline) < new Date()) {
        try {
          const resolved = await checkAndResolve(t);
          if (resolved) doc = resolved;
        } catch (e) {
          // A settlement that cannot complete (e.g. the miner has no linked
          // wallet yet) must not blank the list — show it as still pending.
          logger.error('minesSweep', { submissionId: String(t._id), error: e.message || String(e) });
        }
      }
      out.push(doc.toObject ? doc.toObject() : doc);
    }
    res.json(ok(out));
  } catch (e) { res.status(500).json(fail(e)); }
});

/**
 * Earnings summary for the Mines panels — computed from what the server
 * actually paid, not from the wallet ledger.
 *
 * The Earnings/Analytics screens used to sum every MLPTS *credit* in
 * WalletTransaction and label it "Total earned from campaigns", which counted
 * referral payouts, conversions and admin credits as if they were mining
 * rewards and left the "avg reward/task" figure wrong whenever any of those
 * existed. Mining earnings only exist as settled TaskSubmissions, so that is
 * what this reads: reward_amount on each approved submission, its completed_at
 * for the window, and — for still-open ones — the campaign's committed
 * rate_per_task as the amount at stake.
 */
router.get('/earnings/summary', minesAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const approvedStatuses = ['auto_approved', 'approved'];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [byStatus, weekly, balanceRow] = await Promise.all([
      TaskSubmission.aggregate([
        { $match: { miner_id: userId } },
        { $group: { _id: '$status', count: { $sum: 1 }, mlpts: { $sum: '$reward_amount' } } },
      ]),
      TaskSubmission.aggregate([
        { $match: { miner_id: userId, status: { $in: approvedStatuses }, completed_at: { $gte: weekAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completed_at' } },
          mlpts: { $sum: '$reward_amount' },
          count: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      User.findById(userId).select('mlpts_balance tasks_completed').lean(),
    ]);

    const tally = (statuses) => byStatus.reduce((acc, r) => (
      statuses.includes(r._id) ? { count: acc.count + r.count, mlpts: acc.mlpts + (r.mlpts || 0) } : acc
    ), { count: 0, mlpts: 0 });

    const approved = tally(approvedStatuses);
    const rejected = tally(['rejected']);
    const openCounts = byStatus
      .filter((r) => !TERMINAL_STATUSES.includes(r._id))
      .reduce((acc, r) => acc + r.count, 0);

    // What the still-open submissions could pay if approved. Same tolerant
    // lookup as checkCampaignAbuseLimits: campaign_id is Mixed and has been
    // written as a string, so a plain localField/foreignField join against
    // campaigns._id matches nothing.
    const openPending = await TaskSubmission.aggregate([
      { $match: { miner_id: userId, status: { $nin: TERMINAL_STATUSES } } },
      { $lookup: {
        from: 'campaigns',
        let: { cid: { $toString: '$campaign_id' } },
        pipeline: [
          { $project: { idStr: { $toString: '$_id' }, rate_per_task: 1 } },
          { $match: { $expr: { $eq: ['$idStr', '$$cid'] } } },
        ],
        as: 'campaign',
      } },
      { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, atStake: { $sum: { $ifNull: ['$campaign.rate_per_task', 0] } }, known: { $sum: { $cond: [{ $eq: ['$campaign', null] }, 0, 1] } } } },
    ]);

    const pending = openPending[0] || { atStake: 0, known: 0 };

    res.json(ok({
      currency: 'MLPTS',
      approvedCount: approved.count,
      approvedMlpts: approved.mlpts,
      rejectedCount: rejected.count,
      pendingCount: openCounts,
      pendingMlptsAtStake: pending.atStake,
      pendingCampaignsUnresolved: openCounts - (pending.known || 0),
      thisWeekMlpts: weekly.reduce((a, r) => a + (r.mlpts || 0), 0),
      avgRewardMlpts: approved.count ? Math.round((approved.mlpts / approved.count) * 1000) / 1000 : 0,
      daily: weekly.map((r) => ({ date: r._id, mlpts: r.mlpts, count: r.count })),
      balanceMlpts: balanceRow?.mlpts_balance || 0,
      tasksCompleted: balanceRow?.tasks_completed || 0,
      // Honest provenance: these numbers count settled submissions only, so
      // they never silently include referral or admin credits.
      source: 'task_submissions',
    }));
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

// Upload a screenshot proof of activity — required before /submissions
// will accept a `proof_url` that references a local file. The returned
// `documentRef` is the on-disk filename inside PROOFS_UPLOAD_DIR; the
// client passes that ref to /submissions, which then resolves and
// confirms the file actually exists. This breaks the old "any string is
// a valid proof" loophole that let submitters paste a placeholder URL
// and get rewarded.
router.post('/upload', minesAuth, uploadProof.single('proof'), (req, res) => {
  if (!req.file) return badRequest(res, 'proof file is required (PNG or JPG)');
  res.json(ok({ documentRef: req.file.filename }));
});

// Look up an uploaded proof file. Same authorization model as KYC's
// /document — owner can read their own, admin/superadmin can read any
// for review purposes. Path-traversal hardening mirrors kycController.js
// (only the basename may be served), and every read is logged.
//
// "Owner or admin" was not enough for Mines: the reviewer queue is opened by
// staked reviewers, who are neither the submitter nor an admin, so every proof
// link this UI shows them answered 403. They were being asked to vote
// yes/no on evidence they could not open. A reviewer is therefore allowed to
// read a proof exactly while it is assigned to them.
router.get('/proof/:ref', minesAuth, async (req, res) => {
  const userId = req.userId;
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
  const ref = path.basename(req.params.ref);
  const filePath = path.join(PROOFS_UPLOAD_DIR, ref);
  if (!fs.existsSync(filePath)) return badRequest(res, 'proof not found', 404);
  // Owner check: filename must start with `${userId}-` unless the
  // caller is admin. Without this, any logged-in user could request
  // another user's proof filename and read it.
  if (!isAdmin && !ref.startsWith(`${userId}-`)) {
    const assigned = await TaskSubmission.findOne({
      proof_url: ref,
      assigned_validators: { $in: [userId] },
      assignment_status: { $in: ['assigned', 'voting'] },
    }).lean();
    if (!assigned) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    logger.info('minesProofReviewed', { submissionId: String(assigned._id), reviewerId: String(userId) });
  }
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: 'not found' });
  });
});

router.post('/submissions', minesAuth, async (req, res) => {
  // Validate required fields
  const { campaign_id, proof_url, description } = req.body;

  if (!campaign_id) {
    return badRequest(res, 'campaign_id is required');
  }

  if (!proof_url || typeof proof_url !== 'string') {
    return badRequest(res, 'proof_url is required (screenshot ref or external URL)');
  }

  // proof_url must be EITHER a local screenshot ref produced by /upload
  // (filename starts with the userId- prefix and lives in PROOFS_UPLOAD_DIR)
  // OR a real external URL. Two separate rules instead of one permissive
  // regex — anything not matching both is rejected. The filesystem check
  // for local refs is what closes the "any string is fine" hole; just
  // passing `https://example.com/x.png` does not satisfy the local-ref
  // branch, so submitters are pushed toward the upload path that
  // produces an actual on-disk image.
  // Identical rules now run on PUT /submissions/:id — before, an editable
  // submission could be re-pointed at a `javascript:` string that POST would
  // have refused, and reviewers clicked it.
  let proof;
  try {
    proof = storableProofUrl(proof_url, req.userId);
  } catch (e) {
    return badRequest(res, e.message);
  }

  // Description validation if provided
  if (description && typeof description === 'string' && description.length > 500) {
    return badRequest(res, 'Description must be under 500 characters');
  }

  // Valid-task enforcement: refuse submissions pointing at a campaign
  // that isn't active, doesn't exist, or was created by a user who's
  // since been banned / downgraded below creator_level 1. Without this
  // guard, a previously-valid campaign keeps paying out rewards long
  // after its creator lost the right to run one — turning the Mines
  // queue into a way for banned accounts to launder activity.
  let campaign;
  try {
    campaign = await Campaign.findById(campaign_id).lean();
  } catch (_) {
    campaign = null;
  }
  if (!campaign) {
    return badRequest(res, 'campaign not found');
  }
  if (campaign.status !== 'active') {
    return badRequest(res, `campaign is ${campaign.status} — no longer accepting submissions`);
  }
  if (!campaign.creator_id) {
    return badRequest(res, 'campaign has no creator — cannot validate task origin');
  }
  const creator = await User.findById(campaign.creator_id)
    .select('banned creator_level role')
    .lean();
  if (!creator) {
    return badRequest(res, 'campaign creator no longer exists');
  }
  if (creator.banned === true) {
    return badRequest(res, 'campaign creator is banned — submissions blocked');
  }
  if ((creator.role === 'admin' || creator.role === 'superadmin') ? false : (Number(creator.creator_level) || 0) < 1) {
    return badRequest(res, 'campaign creator is no longer authorized to run campaigns');
  }

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

      const body = { ...pick(req.body, SUBMISSION_CREATE_FIELDS), proof_url: proof, miner_id: req.userId };
      [row] = await TaskSubmission.create([body], { session });
    });
    // Randomly assign up to 6 staked reviewers; if none are eligible yet the
    // submission is untouched and falls back to the admin manual-review queue.
    await autoAssignReviewers(row);
    activityEvents.emitProofSubmitted(req.userId, { submissionId: row._id, campaignId: row.campaign_id, taskType: row.task_type }).catch(() => {});
    res.json(ok(row));
  } catch (e) {
    if (e.abuseCheck) return badRequest(res, e.message, 429);
    res.status(400).json(fail(e));
  } finally {
    session.endSession();
  }
});

router.put('/submissions/:id', minesAuth, async (req, res) => {
  try {
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json(fail('submission not found'));
    if (sub.miner_id.toString() !== req.userId) return res.status(403).json(fail('forbidden: not your submission'));
    if (!['manual_review', 'pending_assignment'].includes(sub.status)) {
      return res.status(409).json(fail('submission can no longer be edited'));
    }

    const updates = pick(req.body, SUBMISSION_UPDATE_FIELDS);
    // The same proof rules as POST /submissions. Without this, editing a
    // still-open submission replaced a legitimate screenshot ref with an
    // arbitrary string — and the reviewer queue rendered it as an href, so a
    // `javascript:` payload executed in the reviewer's own session.
    if (updates.proof_url !== undefined) {
      try {
        updates.proof_url = storableProofUrl(updates.proof_url, req.userId);
      } catch (e) {
        return badRequest(res, e.message);
      }
    }
    if (typeof updates.description === 'string' && updates.description.length > 500) {
      return badRequest(res, 'Description must be under 500 characters');
    }

    const row = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/submissions/pending', requireAdmin, async (_req, res) => {
  try {
    const rows = await TaskSubmission.find({ status: 'manual_review' }).sort({ created_at: -1 }).limit(50).lean();
    res.json(ok(rows));
  } catch (e) { res.json(ok([])); }
});

// P0 ISSUE #3 WORKAROUND: Add idempotency to reward approval
// Prevents double-crediting if endpoint called twice (race condition fix)
router.post('/submissions/:id/approve', requireAdmin, idempotency({ required: true }), async (req, res) => {
  try {
    const { rewardAmount } = req.body || {};
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json(fail('submission not found'));

    // Never re-pay a settled task. The idempotency middleware above only keys
    // on the caller's Idempotency-Key header, so a second approval with a
    // fresh key (or a different admin) would otherwise credit the reward
    // again — and leaving assignment_status at 'assigned'/'voting' would also
    // let a late reviewer vote re-run settle() and pay a third time.
    if (TERMINAL_STATUSES.includes(sub.status)) {
      return badRequest(res, `submission is already ${sub.status} — nothing to pay`, 409);
    }

    // Determine reward: use provided amount, or auto-use campaign rate_per_task
    let finalReward = Number(rewardAmount) || 0;
    if (sub.campaign_id && !rewardAmount) {
      const campaign = await Campaign.findById(sub.campaign_id).lean();
      if (campaign && campaign.rate_per_task) {
        finalReward = campaign.rate_per_task;
      }
    }
    // A negative or non-numeric rewardAmount from the request body would
    // otherwise flow straight into $inc: the miner debited and the campaign
    // budget inflated. Same clamp as adminPanel's approve route.
    if (!Number.isFinite(finalReward) || finalReward < 0) finalReward = 0;

    // The claim and the payout share one transaction. Run separately, a
    // failing credit (miner unlinked, dead session) left the row already
    // marked 'auto_approved' while nothing was paid — the caller got a 500,
    // and the retry then answered 409 "nothing was paid", which was no longer
    // true. Inside one transaction a failed payout rolls the status write
    // back too, so the submission stays reviewable and the retry is honest.
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        // Atomic claim: the status filter is part of the update itself, so two
        // approvals racing (different idempotency keys, or admin + reviewer vote)
        // cannot both land — the loser matches no document.
        updated = await TaskSubmission.findOneAndUpdate(
          { _id: req.params.id, status: { $nin: TERMINAL_STATUSES } },
          { $set: {
            status: 'auto_approved',
            // Closing the voting state is what stops checkAndResolve() from
            // settling this task a second time after an admin approves it first.
            assignment_status: 'approved',
            completed_at: new Date().toISOString(),
            reward_amount: finalReward,
          } },
          { new: true, session }
        ).lean();
        if (!updated) {
          const settled = new Error('already settled');
          settled.alreadySettled = true;
          throw settled;
        }

        if (finalReward > 0) {
          // Fetch full user document (need walletAddress for MallPointAccount sync)
          const user = await User.findById(sub.miner_id).session(session);
          if (!user) {
            throw new Error('miner user not found during transaction');
          }

          // GATE 61.1: Wallet-first enforcement — reject reward if no wallet linked
          requireWalletAddress(user, { userId: sub.miner_id, flow: 'mining_approval' });

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

          // GATE 61: Synchronize mining reward to MallPointAccount (conversion-eligible ledger)
          await syncMallPointAccount(User.decryptUserPii(user).walletAddress, finalReward, session, {
            userId: sub.miner_id,
            flow: 'mining_approval',
          });
        }

        if (sub.campaign_id) {
          await Campaign.findByIdAndUpdate(sub.campaign_id, {
            $inc: finalReward > 0
              ? { completions_count: 1, budget_remaining: -finalReward }
              : { completions_count: 1 },
          }).session(session);
        }
      });
    } catch (e) {
      if (e.alreadySettled) {
        return badRequest(res, 'submission was settled by another review moments ago — nothing was paid', 409);
      }
      throw e;
    } finally {
      session.endSession();
    }
    const minerId = sub.miner_id.toString();
    // Template-required field names (campaign_name/reward_amount/
    // submission_reference, amount/earning_activity/reward_status/
    // activity_reference) — the previous payloads used camelCase keys the
    // engine's validateRequired rejected, so these emails never sent.
    let campaignName = 'Mining task';
    if (sub.campaign_id) {
      const camp = await Campaign.findById(sub.campaign_id).select('title').lean().catch(() => null);
      if (camp?.title) campaignName = camp.title;
    }
    activityEvents.emitProofApproved(minerId, {
      campaign_name: campaignName,
      reward_amount: finalReward,
      submission_reference: String(sub._id),
    }).catch(() => {});
    activityEvents.emitMlptsEarned(minerId, {
      amount: finalReward,
      earning_activity: 'Mining submission approved',
      reward_status: 'approved',
      activity_reference: String(sub._id),
    }).catch(() => {});
    chainMinesAudit(req, 'mines_submission_approved', `submission:${req.params.id}`, { minerId: sub.miner_id.toString(), rewardAmount: finalReward });
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
    if (!row) return res.status(404).json(fail('submission not found'));
    if (row.miner_id) {
      activityEvents.emitProofRejected(row.miner_id.toString(), { submissionId: req.params.id, note }).catch(() => {});
    }
    chainMinesAudit(req, 'mines_submission_rejected', `submission:${req.params.id}`, { note: note || null });
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

      // GATE 61.1: Wallet-first enforcement — reject credit if no wallet linked
      requireWalletAddress(user, { userId, flow: 'admin_balance_credit' });

      await User.findByIdAndUpdate(userId, { $inc: { mlpts_balance: amount } }).session(session);
      await WalletTransaction.create([{
        user_id: userId,
        type: 'credit',
        amount,
        currency: 'MLPTS',
        description: 'Balance credit by admin',
      }], { session });
      // GATE 61: Synchronize admin credit to MallPointAccount for conversion
      await syncMallPointAccount(User.decryptUserPii(user).walletAddress, amount, session, {
        userId,
        flow: 'admin_balance_credit',
      });
      chainMinesAudit(req, 'admin_mlpts_credit', `user:${userId}`, { amount, currency: 'MLPTS' });
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
      // GATE 61: Synchronize admin deduct to MallPointAccount for conversion consistency
      await syncMallPointAccount(User.decryptUserPii(result).walletAddress, -amount, session, {
        userId,
        flow: 'admin_balance_deduct',
      });
      chainMinesAudit(req, 'admin_mlpts_deduct', `user:${userId}`, { amount, currency: 'MLPTS' });
    });
    res.json(ok({ success: true }));
  } catch (e) { res.status(500).json(fail(e, { operation: 'balance_deduct' })); }
  finally { session.endSession(); }
});

module.exports = router;