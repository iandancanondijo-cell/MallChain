const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const ValidatorApplication = require('../models/ValidatorApplication');
const TaskSubmission = require('../models/TaskSubmission');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');
const { BurnPolicy, DynamicBurnThreshold } = require('../models/BurnPolicy');
const TreasuryLedger = require('../models/TreasuryLedger');
const { notify } = require('../services/notify');

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', new mongoose.Schema({}, { strict: false }));

// ============ BOOTSTRAP: Create first admin (only works when no admins exist) ============
router.post('/bootstrap', async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: { $in: ['admin', 'superadmin'] } });
    if (adminExists) {
      return res.status(403).json({ ok: false, error: 'Admin already exists. Use normal admin auth to manage users.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email and password are required' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.findOneAndUpdate(
      { email },
      { $set: { password: hashedPassword, role: 'superadmin' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('-password');

    await AuditLog.create({ action: 'admin_bootstrap', actor: email, details: 'First superadmin created via bootstrap', outcome: 'success' });

    return res.json({ ok: true, user, message: 'Superadmin created successfully' });
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
    console.error('Audit log failed:', e.message);
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
router.get('/users', async (req, res) => {
  try {
    const { page = 0, limit = 50, search, role, banned } = req.query;
    const query = {};
    if (search) query.$or = [{ email: { $regex: search, $options: 'i' } }];
    if (role) query.role = role;
    if (banned !== undefined) query.banned = banned === 'true';

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      User.countDocuments(query),
    ]);

    return res.json({ ok: true, users, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/users/:id/role', requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

    await auditLog('user_role_change', req.user, { targetUserId: req.params.id, newRole: role });
    notify(user._id, { kind: 'system', title: 'Account role updated', body: `Your account role is now ${role}` });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/users/:id/ban', async (req, res) => {
  try {
    const { banned, reason } = req.body;
    const update = { banned: !!banned };
    if (banned) update.banReason = reason || 'Banned by admin';
    else update.banReason = '';

    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

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

router.delete('/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

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

router.post('/validators/applications/:id/review', async (req, res) => {
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
    if (action === 'approved') application.isActiveValidator = true;

    await application.save();

    await auditLog('validator_review', req.user, { applicationId: req.params.id, action, applicantAddress: application.applicantAddress });
    return res.json({ ok: true, application });
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

router.post('/treasury/policies', async (req, res) => {
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

router.delete('/treasury/policies/:activity', async (req, res) => {
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

router.post('/treasury/dynamic-thresholds', async (req, res) => {
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

router.delete('/treasury/dynamic-thresholds/:id', async (req, res) => {
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

router.post('/mining/submissions/:id/approve', async (req, res) => {
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

router.post('/mining/submissions/:id/reject', async (req, res) => {
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

router.put('/mining/campaigns/:id', async (req, res) => {
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
    const { action, actor, limit = 100 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (actor) query.actor = { $regex: actor, $options: 'i' };

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(safeLimit).lean();
    return res.json({ ok: true, logs });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ SYSTEM OPERATIONS ============
router.post('/reconcile', async (req, res) => {
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

router.post('/reconciliation/run', async (req, res) => {
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
    const { status, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const items = await LiquidityReconciliation.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    return res.json({ ok: true, items, total: items.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const withdrawals = await WithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    return res.json({ ok: true, withdrawals, total: withdrawals.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;
