const express = require('express');
const router = express.Router();
const logger = require('../utils/logger')
const mongoose = require('mongoose');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const ValidatorApplication = require('../models/ValidatorApplication');
const KYC = require('../models/kyc');
const TaskSubmission = require('../models/TaskSubmission');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');
const { invalidateCachedUser } = require('../middleware/authCache');
const { BurnPolicy, DynamicBurnThreshold } = require('../models/BurnPolicy');
const TreasuryLedger = require('../models/TreasuryLedger');
const { notify } = require('../services/notify');
const MaintenanceMode = require('../models/MaintenanceMode');
const { invalidateCache: invalidateMaintenanceCache } = require('../middleware/maintenanceMode');
const Campaign = require('../models/Campaign');
const WalletTransaction = require('../models/WalletTransaction');
const BadgePurchase = require('../models/BadgePurchase');
const BadgeIssuance = require('../models/BadgeIssuance');
const { getUserBadgeInfo } = require('../services/badgeService');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { notifyUser } = require('../services/notify');
const { limiters } = require('../middleware/rateLimiter');

const MAINTENANCE_SCOPES = ['send', 'withdraw', 'buy', 'payment', 'marketplace', 'staking', 'vault', 'key-vault', 'badge', 'dex'];

// ============ BOOTSTRAP: Create first admin (only works when no admins exist) ============
router.post('/bootstrap', limiters.strict, async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: { $in: ['admin', 'superadmin'] } });
    if (adminExists) {
      return res.status(403).json({ ok: false, error: 'Admin already exists. Use normal admin auth to manage users.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email and password are required' });
    }

    // findOneAndUpdate(..., {upsert: true}) here would silently overwrite
    // the password and promote an EXISTING regular user's account the
    // moment this endpoint's only guard (zero admins in the DB) is ever
    // true — a fresh deploy, or every admin having been deleted — with no
    // verification the caller controls that email. Create-only: never touch
    // an existing user document.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists. Bootstrap only creates a brand-new superadmin account.' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({ email, password: hashedPassword, role: 'superadmin' });
    const publicUser = user.toObject();
    delete publicUser.password;

    await AuditLog.create({ action: 'admin_bootstrap', actor: email, details: 'First superadmin created via bootstrap', outcome: 'success' });

    return res.json({ ok: true, user: publicUser, message: 'Superadmin created successfully' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// All admin routes require admin authentication
router.use(requireAdmin);

// ============ AUDIT LOGGING ============
async function auditLog(action, actor, details, outcome = 'success') {
  try {
    await AuditLog.create({ action, actor: actor?.email || actor?.toString() || 'system', details, outcome });
  } catch (e) {
    logger.error('adminPanel', 'audit log failed', e);
  }
}

// ============ DASHBOARD ============
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      adminCount,
      pendingValidators,
      activeValidators,
      pendingSubmissions,
      totalCampaigns,
      recentUsers,
      bannedUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
      ValidatorApplication.countDocuments({ status: 'pending' }),
      ValidatorApplication.countDocuments({ status: 'approved', isActiveValidator: true }),
      TaskSubmission.countDocuments({ status: 'manual_review' }),
      Campaign.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('email role createdAt banned').lean(),
      User.countDocuments({ banned: true }),
    ]);

    const stats = {
      users: { total: totalUsers, admins: adminCount, banned: bannedUsers },
      validators: { pending: pendingValidators, active: activeValidators },
      mining: { pendingSubmissions, totalCampaigns },
      recentUsers,
    };

    await auditLog('dashboard_view', req.user, 'Admin viewed dashboard');
    return res.json({ ok: true, stats });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ USER MANAGEMENT ============
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/users', async (req, res) => {
  try {
    const { page = 0, limit = 50, search, role, banned } = req.query;
    const query = {};
    // search was interpolated straight into $regex — a crafted pattern
    // (e.g. catastrophic-backtracking like (a+)+$) could hang the query.
    // Escaping regex metacharacters keeps this a plain substring match.
    if (search) query.$or = [{ email: { $regex: escapeRegex(search), $options: 'i' } }];
    if (role) query.role = role;
    if (banned !== undefined) query.banned = banned === 'true';

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      User.countDocuments(query),
    ]);

    // Bulk PII read (email + profile fields for up to 200 users at once) —
    // an admin browsing/searching every user is exactly the kind of
    // reconnaissance-style access a compliance audit trail should capture,
    // same as the KYC bulk read below.
    await auditLog('users_search', req.user, { search: search || null, role: role || null, resultCount: users.length });
    return res.json({ ok: true, users, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    await auditLog('user_view', req.user, { targetUserId: req.params.id, email: user.email });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/users/:id/role', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'invalid role' });
    }

    const existing = await User.findById(req.params.id).select('role');
    if (!existing) return res.status(404).json({ ok: false, error: 'user not found' });
    // A superadmin's role is permanent — it can never be changed to
    // something else through this endpoint, by anyone, including another
    // superadmin. Prevents accidental or malicious demotion of the account
    // that ultimately controls role assignment for everyone else.
    if (existing.role === 'superadmin' && role !== 'superadmin') {
      return res.status(403).json({ ok: false, error: 'A superadmin account\'s role cannot be changed' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true }).select('-password');
    await invalidateCachedUser(req.params.id);

    await auditLog('user_role_change', req.user, { targetUserId: req.params.id, newRole: role });
    notify(user._id, { kind: 'system', title: 'Account role updated', body: `Your account role is now ${role}` });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/users/:id/ban', limiters.strict, async (req, res) => {
  try {
    const { banned, reason } = req.body;
    const update = { banned: !!banned };
    if (banned) update.banReason = reason || 'Banned by admin';
    else update.banReason = '';

    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    await invalidateCachedUser(req.params.id);

    await auditLog('user_ban', req.user, { targetUserId: req.params.id, banned: !!banned, reason });
    notify(user._id, {
      kind: 'system',
      title: banned ? 'Account banned' : 'Account unbanned',
      body: banned ? (reason || 'Your account has been banned by an admin') : 'Your account is active again',
    });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/users/:id', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    await invalidateCachedUser(req.params.id);

    await auditLog('user_delete', req.user, { targetUserId: req.params.id, email: user.email });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ VALIDATOR MANAGEMENT ============
router.get('/validators/applications', async (req, res) => {
  try {
    const { status, page = 0, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [applications, total] = await Promise.all([
      ValidatorApplication.find(query).sort({ submittedAt: -1 }).skip(skip).limit(safeLimit).lean(),
      ValidatorApplication.countDocuments(query),
    ]);

    return res.json({ ok: true, applications, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/validators/applications/:id/review', limiters.strict, async (req, res) => {
  try {
    const { action, notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be approved or rejected' });
    }

    const application = await ValidatorApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ ok: false, error: 'application not found' });

    application.status = action;
    application.reviewedAt = new Date();
    application.reviewer = req.user.email;
    application.reviewNotes = notes || '';
    // isActiveValidator only grants mines task-review eligibility (see the
    // field comment in models/ValidatorApplication.js) — it has no effect
    // on, and isn't evidence of, real on-chain validator bonding.
    if (action === 'approved') application.isActiveValidator = true;

    await application.save();

    await auditLog('validator_review', req.user, { applicationId: req.params.id, action, applicantAddress: application.applicantAddress });
    return res.json({ ok: true, application });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ KYC REVIEW ============
router.get('/kyc/pending', async (req, res) => {
  try {
    const { page = 0, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const query = { status: { $in: ['pending', 'review'] } };

    const [rawSubmissions, total] = await Promise.all([
      KYC.find(query)
        .populate('userId', 'email username')
        .sort({ submittedAt: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      KYC.countDocuments(query),
    ]);

    // .lean() returns plain objects, bypassing the model's decryption
    // helper's usual toObject() path — decrypt idNumber/phoneNumber/
    // address/city/postalCode explicitly before this reaches an admin.
    const submissions = rawSubmissions.map((s) => KYC.decryptKycPii(s));

    // Bulk read of full KYC PII (name, DOB, nationality, ID number, address,
    // income, PEP status) for every pending applicant — this is exactly the
    // kind of access a compliance audit trail needs to capture, not just
    // approve/reject decisions.
    await auditLog('kyc_pending_view', req.user, { resultCount: submissions.length });
    return res.json({ ok: true, submissions, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/kyc/:id/review', limiters.strict, async (req, res) => {
  try {
    const { action, notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be approved or rejected' });
    }

    const kyc = await KYC.findById(req.params.id);
    if (!kyc) return res.status(404).json({ ok: false, error: 'KYC submission not found' });

    kyc.status = action;
    kyc.reviewedAt = new Date();
    kyc.reviewedBy = req.user._id;
    kyc.notes = notes || '';
    await kyc.save();

    if (action === 'approved') {
      await User.findByIdAndUpdate(kyc.userId, { kycLevel: 2 });
    }

    await auditLog('kyc_review', req.user, { kycId: req.params.id, action, applicantId: String(kyc.userId) });
    return res.json({ ok: true, kyc });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ TREASURY MANAGEMENT ============
router.get('/treasury/policies', async (_req, res) => {
  try {
    const policies = await BurnPolicy.find({}).lean();
    return res.json({ ok: true, policies });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/treasury/policies', limiters.strict, async (req, res) => {
  try {
    const { activity, burnPercentage, description, enabled } = req.body;
    if (!activity || typeof burnPercentage !== 'number') {
      return res.status(400).json({ error: 'activity and burnPercentage are required' });
    }
    const policy = await BurnPolicy.findOneAndUpdate(
      { activity },
      { burnPercentage, description: description || '', enabled: typeof enabled === 'boolean' ? enabled : true, updatedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditLog('treasury_policy_update', req.user, { activity, burnPercentage });
    return res.json({ ok: true, policy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/treasury/policies/:activity', limiters.strict, async (req, res) => {
  try {
    const result = await BurnPolicy.deleteOne({ activity: req.params.activity });
    await auditLog('treasury_policy_delete', req.user, { activity: req.params.activity });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/treasury/dynamic-thresholds', async (_req, res) => {
  try {
    const thresholds = await DynamicBurnThreshold.find({}).sort({ activity: 1, supplyThreshold: -1 }).lean();
    return res.json({ ok: true, thresholds });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/treasury/dynamic-thresholds', limiters.strict, async (req, res) => {
  try {
    const { activity, supplyThreshold, burnPercentage, order, enabled } = req.body;
    if (!activity || typeof supplyThreshold !== 'number' || typeof burnPercentage !== 'number') {
      return res.status(400).json({ error: 'activity, supplyThreshold, and burnPercentage are required' });
    }
    const threshold = await DynamicBurnThreshold.findOneAndUpdate(
      { activity, supplyThreshold },
      { burnPercentage, order: typeof order === 'number' ? order : 0, enabled: typeof enabled === 'boolean' ? enabled : true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditLog('treasury_threshold_update', req.user, { activity, supplyThreshold, burnPercentage });
    return res.json({ ok: true, threshold });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/treasury/dynamic-thresholds/:id', limiters.strict, async (req, res) => {
  try {
    const result = await DynamicBurnThreshold.deleteOne({ _id: req.params.id });
    await auditLog('treasury_threshold_delete', req.user, { id: req.params.id });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/treasury/ledger', async (req, res) => {
  try {
    const { activity, direction, limit = 100 } = req.query;
    const query = {};
    if (activity) query.activity = activity;
    if (direction) query.direction = direction;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const entries = await TreasuryLedger.find(query).sort({ createdAt: -1 }).limit(safeLimit).lean();
    return res.json({ ok: true, entries });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/treasury/metrics', async (_req, res) => {
  try {
    const totals = await TreasuryLedger.aggregate([
      { $group: { _id: { activity: '$activity', direction: '$direction' }, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $project: { activity: '$_id.activity', direction: '$_id.direction', totalAmount: 1, count: 1, _id: 0 } },
    ]);
    return res.json({ ok: true, totals });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ MINING TASK MANAGEMENT ============
router.get('/mining/campaigns', async (req, res) => {
  try {
    const { status, page = 0, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
      Campaign.countDocuments(query),
    ]);

    return res.json({ ok: true, campaigns, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/mining/submissions/pending', async (req, res) => {
  try {
    const { page = 0, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [submissions, total] = await Promise.all([
      TaskSubmission.find({ status: 'manual_review' }).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
      TaskSubmission.countDocuments({ status: 'manual_review' }),
    ]);

    return res.json({ ok: true, submissions, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/mining/submissions/:id/approve', limiters.strict, async (req, res) => {
  try {
    const { rewardAmount } = req.body || {};
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json({ ok: false, error: 'submission not found' });

    const updated = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'auto_approved', completed_at: new Date().toISOString() } },
      { new: true }
    ).lean();

    await WalletTransaction.create({
      user_id: sub.miner_id,
      type: 'credit',
      amount: rewardAmount || 0,
      currency: 'MLPTS',
      description: 'Task reward approved by admin',
    });

    if (sub.campaign_id) {
      await Campaign.findByIdAndUpdate(sub.campaign_id, {
        $inc: { completions_count: 1, budget_remaining: -(rewardAmount || 0) },
      });
    }

    await auditLog('mining_submission_approve', req.user, { submissionId: req.params.id, rewardAmount });
    return res.json({ ok: true, submission: updated });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/mining/submissions/:id/reject', limiters.strict, async (req, res) => {
  try {
    const { note } = req.body || {};
    const row = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'rejected', rejection_note: note || null } },
      { new: true }
    ).lean();

    await auditLog('mining_submission_reject', req.user, { submissionId: req.params.id, note });
    return res.json({ ok: true, submission: row });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/mining/campaigns/:id', limiters.strict, async (req, res) => {
  try {
    const row = await Campaign.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    if (!row) return res.status(404).json({ ok: false, error: 'campaign not found' });
    await auditLog('mining_campaign_update', req.user, { campaignId: req.params.id });
    return res.json({ ok: true, campaign: row });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ============ GOVERNANCE OVERSIGHT ============
router.get('/governance/stats', async (_req, res) => {
  try {
    // Forward to on-chain query or return basic info
    const axios = require('axios');
    const chainRest = process.env.CHAIN_REST || 'http://localhost:1317';
    try {
      const proposalsRes = await axios.get(`${chainRest}/cosmos/gov/v1beta1/proposals?pagination.limit=100`, { timeout: 5000 });
      const proposals = proposalsRes.data?.proposals || [];
      const stats = {
        total: proposals.length,
        voting: proposals.filter(p => p.status === 'PROPOSAL_STATUS_VOTING_PERIOD').length,
        passed: proposals.filter(p => p.status === 'PROPOSAL_STATUS_PASSED').length,
        rejected: proposals.filter(p => p.status === 'PROPOSAL_STATUS_REJECTED').length,
      };
      return res.json({ ok: true, stats, proposals: proposals.slice(0, 20) });
    } catch (e) {
      return res.json({ ok: true, stats: { total: 0, voting: 0, passed: 0, rejected: 0 }, proposals: [], note: 'chain unavailable' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ AUDIT LOG ============
router.get('/audit', async (req, res) => {
  try {
    const { action, actor, page = 0, limit = 100 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (actor) query.actor = { $regex: actor, $options: 'i' };

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      AuditLog.countDocuments(query),
    ]);
    return res.json({ ok: true, logs, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ SYSTEM OPERATIONS ============
router.post('/reconcile', limiters.strict, async (req, res) => {
  try {
    const liquidityController = require('../controllers/liquidityController');
    const mallcoinService = require('../services/mallcoinService');

    const pools = await liquidityController.fetchPoolsFromBlockchain();
    const metrics = await mallcoinService.getActivityMetrics();
    const report = {
      pools: pools.map(p => ({ id: p.id, name: p.name, reserve0: p.reserve0, reserve1: p.reserve1, tvl: p.tvl })),
      metrics,
      generatedAt: new Date().toISOString(),
    };

    await auditLog('system_reconcile', req.user, 'Pool reconciliation triggered');
    return res.json({ ok: true, report });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post('/reconciliation/run', limiters.strict, async (req, res) => {
  try {
    const { runReconciliationJob } = require('../services/reconciliationService');
    const result = await runReconciliationJob();
    await auditLog('system_reconciliation_run', req.user, 'Reconciliation job triggered');
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/reconciliation/items', async (req, res) => {
  try {
    const { status, page = 0, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const [items, total] = await Promise.all([
      LiquidityReconciliation.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      LiquidityReconciliation.countDocuments(query),
    ]);

    return res.json({ ok: true, items, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Marks a reconciliation item resolved. This is a record-keeping action only —
// it does NOT itself perform any on-chain reversal or transfer. Matching
// reconciliationService.js's own compensateFailedLiquidity comment: silently
// claiming something was fixed without an actual reversal would be a
// financial-integrity bug, so this just lets an admin document how a
// pending_manual (or detected) item was actually handled out-of-band.
router.post('/reconciliation/:id/resolve', limiters.strict, async (req, res) => {
  try {
    const { note } = req.body || {};
    if (!note || !String(note).trim()) {
      return res.status(400).json({ ok: false, error: 'A resolution note is required' });
    }

    const item = await LiquidityReconciliation.findById(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'Reconciliation item not found' });
    if (item.status === 'resolved') {
      return res.status(409).json({ ok: false, error: 'This item is already resolved' });
    }

    item.status = 'resolved';
    item.resolutionNote = String(note).trim();
    item.resolvedBy = req.user?._id ? String(req.user._id) : undefined;
    item.resolvedAt = new Date();
    await item.save();

    await auditLog('reconciliation_resolved', req.user, { reconciliationId: item._id.toString(), note: item.resolutionNote });
    return res.json({ ok: true, item });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const { status, page = 0, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const [withdrawals, total] = await Promise.all([
      WithdrawalRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      WithdrawalRequest.countDocuments(query),
    ]);

    return res.json({ ok: true, withdrawals, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Re-attempts the Safaricom B2C payout for a withdrawal whose prior attempt
// failed — the same call routes/withdraw.js and routes/buy.js's /sell make
// on the original request, just triggered manually instead of automatically.
router.post('/withdrawals/:id/retry', limiters.strict, async (req, res) => {
  try {
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ ok: false, error: 'Withdrawal not found' });
    if (withdrawal.status !== 'failed') {
      return res.status(409).json({ ok: false, error: `Only a failed withdrawal can be retried (current status: ${withdrawal.status})` });
    }

    const payoutResult = await initiateB2CPayout({
      sellerPhone: withdrawal.phone,
      mlcnsAmount: withdrawal.amountMlcns,
      saleId: withdrawal.saleId || `withdrawal-${withdrawal.withdrawalId}`,
    });

    if (!payoutResult.ok) {
      withdrawal.status = payoutResult.requiresApproval ? 'pending_review' : 'failed';
      withdrawal.notes = payoutResult.error || 'Retried payout initiation failed.';
      await withdrawal.save();
      await auditLog('withdrawal_retry', req.user, { withdrawalId: withdrawal.withdrawalId, outcome: 'failed', reason: withdrawal.notes }, 'failure');
      return res.status(payoutResult.requiresApproval ? 202 : 502).json({ ok: payoutResult.requiresApproval, withdrawal });
    }

    withdrawal.status = 'payout_initiated';
    withdrawal.payoutRef = payoutResult.payoutRef;
    withdrawal.notes = 'Payout retried by admin and re-initiated with Safaricom.';
    await withdrawal.save();

    await auditLog('withdrawal_retry', req.user, { withdrawalId: withdrawal.withdrawalId, outcome: 'reinitiated', payoutRef: payoutResult.payoutRef });
    return res.json({ ok: true, withdrawal });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Records how a failed withdrawal was actually settled outside the automated
// payout path (e.g. a manual M-Pesa send, or a refund back to the user by
// another channel) — like reconciliation/resolve above, this is record-
// keeping only and does not itself move any money.
router.post('/withdrawals/:id/resolve', limiters.strict, async (req, res) => {
  try {
    const { note, outcome } = req.body || {};
    if (!['completed', 'refunded'].includes(outcome)) {
      return res.status(400).json({ ok: false, error: "outcome must be 'completed' or 'refunded'" });
    }
    if (!note || !String(note).trim()) {
      return res.status(400).json({ ok: false, error: 'A resolution note is required' });
    }

    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ ok: false, error: 'Withdrawal not found' });
    if (withdrawal.status !== 'failed') {
      return res.status(409).json({ ok: false, error: `Only a failed withdrawal can be manually resolved (current status: ${withdrawal.status})` });
    }

    withdrawal.status = outcome;
    withdrawal.notes = String(note).trim();
    await withdrawal.save();

    await auditLog('withdrawal_resolved', req.user, { withdrawalId: withdrawal.withdrawalId, outcome, note: withdrawal.notes });
    return res.json({ ok: true, withdrawal });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// ============ BADGES ============
router.get('/badges/purchases', async (req, res) => {
  try {
    const { status, page = 0, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [purchases, total] = await Promise.all([
      BadgePurchase.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      BadgePurchase.countDocuments(query),
    ]);

    return res.json({ ok: true, purchases, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/badges/issuances', async (req, res) => {
  try {
    const { method, page = 0, limit = 50 } = req.query;
    const query = {};
    if (method) query.method = method;

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [issuances, total] = await Promise.all([
      BadgeIssuance.find(query).sort({ issuedAt: -1 }).skip(skip).limit(safeLimit).lean(),
      BadgeIssuance.countDocuments(query),
    ]);

    return res.json({ ok: true, issuances, total });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Manual grant for support cases (streak missed due to a tracking gap, goodwill
// gesture, etc). Reuses the same on-chain issuance path as the streak snapshot
// and the paid-purchase flow, just recorded with method 'admin_manual'.
router.post('/badges/grant', limiters.strict, async (req, res) => {
  try {
    const { walletAddress } = req.body || {};
    if (!walletAddress) return res.status(400).json({ ok: false, error: 'walletAddress is required' });

    const existing = await getUserBadgeInfo(walletAddress);
    if (existing.exists) {
      return res.status(409).json({ ok: false, error: 'This wallet already has a badge' });
    }

    const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
    if (!operatorMnemonic) {
      return res.status(503).json({ ok: false, error: 'Badge issuance is not configured yet' });
    }

    const result = await issueBadgeFromMnemonic({
      mnemonic: operatorMnemonic,
      recipient: walletAddress,
      badgeType: 'gold',
    });

    const user = await User.findOne({ walletAddress }).lean();
    await BadgeIssuance.create({
      userId: user?._id,
      walletAddress,
      method: 'admin_manual',
      badgeType: 'gold',
      txHash: result.txHash,
    });

    if (user) {
      await notifyUser(user, {
        kind: 'badge',
        title: 'You were granted a badge',
        body: 'An admin granted you a Mallchain badge — you can now convert Mallpoints to Mallcoin every month on the 15th.',
      });
    }

    await auditLog('badge_admin_grant', req.user, { walletAddress, txHash: result.txHash });
    return res.json({ ok: true, txHash: result.txHash });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Off-chain support action only (mark a purchase as void/refunded) — there is
// no on-chain "revoke badge" message, so this can't undo an already-issued
// badge, only stop a purchase short of issuance.
router.post('/badges/purchases/:quoteId/void', limiters.strict, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const purchase = await BadgePurchase.findOne({ quoteId: req.params.quoteId });
    if (!purchase) return res.status(404).json({ ok: false, error: 'purchase not found' });
    if (purchase.status === 'issued') {
      return res.status(400).json({ ok: false, error: 'This purchase already issued a badge and cannot be voided' });
    }

    purchase.status = 'failed';
    purchase.reason = reason || 'Voided by admin';
    await purchase.save();

    await auditLog('badge_purchase_void', req.user, { quoteId: req.params.quoteId, reason });
    return res.json({ ok: true, purchase: purchase.toObject() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ EMERGENCY PAUSE / MAINTENANCE MODE ============
// Break-glass control for money-moving surfaces (send/withdraw/buy/payment/
// marketplace/staking/vault). Read is available to any admin; toggling
// requires superadmin, the same bar as user role changes and deletes.
router.get('/maintenance', async (_req, res) => {
  try {
    const state = await MaintenanceMode.findById('singleton').lean();
    return res.json({
      ok: true,
      global: state?.global || false,
      scopes: state?.scopes || {},
      reason: state?.reason || '',
      updatedBy: state?.updatedBy || null,
      updatedAt: state?.updatedAt || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post('/maintenance', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const { global, scope, paused, reason } = req.body || {};

    if (scope !== undefined && !MAINTENANCE_SCOPES.includes(scope)) {
      return res.status(400).json({ ok: false, error: `unknown scope; must be one of ${MAINTENANCE_SCOPES.join(', ')}` });
    }
    if (global === undefined && scope === undefined) {
      return res.status(400).json({ ok: false, error: 'must provide either global or scope' });
    }

    const update = { reason: reason || '', updatedBy: req.user.email || String(req.user._id) };
    if (global !== undefined) update.global = !!global;
    if (scope !== undefined) update[`scopes.${scope}`] = !!paused;

    const state = await MaintenanceMode.findByIdAndUpdate(
      'singleton',
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    invalidateMaintenanceCache();

    await auditLog('maintenance_mode_change', req.user, { global, scope, paused, reason }, 'success');

    return res.json({ ok: true, global: state.global, scopes: state.scopes, reason: state.reason });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;
