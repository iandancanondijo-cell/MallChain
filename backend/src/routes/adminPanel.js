const express = require('express');
const router = express.Router();
const logger = require('../utils/logger')
const mongoose = require('mongoose');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const ValidatorApplication = require('../models/ValidatorApplication');
const KYC = require('../models/kyc');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const WithdrawalStructuringFlag = require('../models/WithdrawalStructuringFlag');
const TaskSubmission = require('../models/TaskSubmission');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');
const { requireCategory } = require('../middleware/categoryAccess');
const activityEvents = require('../services/activityEvents');
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
const BadgeDesign = require('../models/BadgeDesign');
const { getUserBadgeInfo } = require('../services/badgeService');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { notifyUser } = require('../services/notify');
const { limiters } = require('../middleware/rateLimiter');
const { blindIndex, decryptField } = require('../utils/fieldEncryption');
const { uploadBadgeImage, BADGE_UPLOAD_DIR } = require('../middleware/upload');
const { uploadProof, PROOFS_UPLOAD_DIR } = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

const MAINTENANCE_SCOPES = ['send', 'withdraw', 'buy', 'payment', 'marketplace', 'staking', 'vault', 'key-vault', 'badge', 'dex'];

// ============ BOOTSTRAP: Create first admin (only works when no admins exist) ============
// Gated behind a one-time bootstrap token (BOOTSTRAP_TOKEN env var) so that
// after a full admin wipe, a random scanner can't claim superadmin before the
// real operator does. In production the env var is required; in dev/test a
// missing token is tolerated but logged as a warning. [B7 remediation]
router.post('/bootstrap', limiters.strict, async (req, res) => {
  try {
    const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
    const suppliedToken = req.headers['x-bootstrap-token'];

    if (process.env.NODE_ENV === 'production') {
      if (!bootstrapToken) {
        return res.status(503).json({ ok: false, error: 'Bootstrap not configured. Set BOOTSTRAP_TOKEN env var.' });
      }
      if (!suppliedToken || suppliedToken !== bootstrapToken) {
        return res.status(403).json({ ok: false, error: 'Invalid or missing bootstrap token.' });
      }
    } else if (bootstrapToken && suppliedToken !== bootstrapToken) {
      // Non-production: if a token IS configured, enforce it. If not configured, allow (dev convenience).
      return res.status(403).json({ ok: false, error: 'Invalid bootstrap token.' });
    }

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
    const existingUser = await User.findOne({ email_blind: blindIndex(email.toLowerCase().trim()) });
    if (existingUser) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists. Bootstrap only creates a brand-new superadmin account.' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    // Admin/superadmin accounts are pre-verified (kycLevel: 2) — they
    // manage KYC for other users, so showing them an "Under Review" banner
    // would be confusing and incorrect.
    const user = await User.create({ email, password: hashedPassword, role: 'superadmin', kycLevel: 2 });
    const publicUser = user.toObject();
    delete publicUser.password;

    await AuditLog.create({ action: 'admin_bootstrap', actor: email, details: 'First superadmin created via bootstrap', outcome: 'success' });

    return res.json({ ok: true, user: publicUser, message: 'Superadmin created successfully' });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// All admin routes require admin authentication
router.use(requireAdmin);

// ============ AUDIT LOGGING ============
async function auditLog(action, actor, details, outcome = 'success') {
  try {
    // actor is usually req.user, whose email is encrypted at rest — decrypt
    // before recording, otherwise every audit entry stores ciphertext.
    const actorEmail = actor && typeof actor === 'object' && actor.email
      ? User.decryptUserPii(actor).email
      : null;
    await AuditLog.create({ action, actor: actorEmail || actor?.toString?.() || 'system', details, outcome });
  } catch (e) {
    logger.error('adminPanel', 'audit log failed', e);
  }
}

// ============ DASHBOARD ============
// Dashboard aggregates every category's KPIs, so only superadmins see it.
// Category admins get a single-category view inside their own window.
router.get('/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      adminCount,
      pendingValidators,
      activeValidators,
      pendingSubmissions,
      totalCampaigns,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
      ValidatorApplication.countDocuments({ status: 'pending' }),
      ValidatorApplication.countDocuments({ status: 'approved', isActiveValidator: true }),
      TaskSubmission.countDocuments({ status: 'manual_review' }),
      Campaign.countDocuments(),
    ]);
    // email is encrypted at rest — decrypt for admin display after .lean()
    const rawRecentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('email role createdAt banned').lean();
    const recentUsers = rawRecentUsers.map((u) => ({ ...u, email: u.email ? decryptField(u.email) : u.email }));
    const bannedUsers = await User.countDocuments({ banned: true });

    const stats = {
      users: { total: totalUsers, admins: adminCount, banned: bannedUsers },
      validators: { pending: pendingValidators, active: activeValidators },
      mining: { pendingSubmissions, totalCampaigns },
      recentUsers,
    };

    await auditLog('dashboard_view', req.user, 'Admin viewed dashboard');
    return res.json({ ok: true, stats });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ USER MANAGEMENT ============
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/users', requireCategory('users'), async (req, res) => {
  try {
    const { page = 0, limit = 50, search, role, banned } = req.query;
    const query = {};
    // Email is encrypted at rest — search by exact-match blind index (regex
    // on ciphertext is meaningless). Also search username (not encrypted)
    // with regex for substring matching, since username is the non-sensitive
    // display name.
    if (search) {
      const escaped = escapeRegex(search);
      query.$or = [
        { email_blind: blindIndex(search.toLowerCase().trim()) },
        { username: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (role) query.role = role;
    if (banned !== undefined) query.banned = banned === 'true';

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [rawUsers, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      User.countDocuments(query),
    ]);
    // email is encrypted at rest — decrypt for admin display
    const users = rawUsers.map((u) => ({ ...u, email: u.email ? decryptField(u.email) : u.email }));

    // Bulk PII read (email + profile fields for up to 200 users at once) —
    // an admin browsing/searching every user is exactly the kind of
    // reconnaissance-style access a compliance audit trail should capture,
    // same as the KYC bulk read below.
    await auditLog('users_search', req.user, { search: search || null, role: role || null, resultCount: users.length });
    return res.json({ ok: true, users, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/users/:id', requireCategory('users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    // email is encrypted at rest — decrypt for the audit log and admin response
    user.email = user.email ? decryptField(user.email) : user.email;
    await auditLog('user_view', req.user, { targetUserId: req.params.id, email: user.email });
    return res.json({ ok: true, user });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
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
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    await invalidateCachedUser(req.params.id);

    await auditLog('user_role_change', req.user, { targetUserId: req.params.id, newRole: role });
    notify(user._id, { kind: 'system', title: 'Account role updated', body: `Your account role is now ${role}` });
    return res.json({ ok: true, user });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.put('/users/:id/ban', requireCategory('users'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.delete('/users/:id', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    await invalidateCachedUser(req.params.id);

    // email is encrypted at rest — decrypt for the audit log
    const decryptedEmail = user.email ? decryptField(user.email) : user.email;
    await auditLog('user_delete', req.user, { targetUserId: req.params.id, email: decryptedEmail });
    return res.json({ ok: true, user });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ VALIDATOR MANAGEMENT ============
router.get('/validators/applications', requireCategory('validator'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/validators/applications/:id/review', requireCategory('validator'), limiters.strict, async (req, res) => {
  try {
    const { action, notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be approved or rejected' });
    }

    const application = await ValidatorApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ ok: false, error: 'application not found' });

    application.status = action;
    application.reviewedAt = new Date();
    application.reviewer = User.decryptUserPii(req.user).email;
    application.reviewNotes = notes || '';
    // isActiveValidator only grants mines task-review eligibility (see the
    // field comment in models/ValidatorApplication.js) — it has no effect
    // on, and isn't evidence of, real on-chain validator bonding.
    if (action === 'approved') application.isActiveValidator = true;

    await application.save();

    await auditLog('validator_review', req.user, { applicationId: req.params.id, action, applicantAddress: application.applicantAddress });
    return res.json({ ok: true, application });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ KYC REVIEW ============
router.get('/kyc/pending', requireCategory('kyc'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/kyc/:id/review', requireCategory('kyc'), limiters.strict, async (req, res) => {
  try {
    const { action, notes, screenshotRef } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be approved or rejected' });
    }

    // Screenshot proof of the admin's decision (their terminal/dashboard
    // capture at review time) is mandatory for KYC — without it a review
    // is a word-against-record between admin and applicant, which fails
    // a compliance audit. Reject with 400 and a clear message; the
    // frontend surfaces a file-picker so admins have no reason to omit
    // it. We additionally require the file to physically exist in
    // PROOFS_UPLOAD_DIR and carry this admin's userId prefix, so a
    // crafted string can't impersonate an uploaded screenshot.
    const adminId = req.user?._id || req.user?.id;
    if (!screenshotRef || typeof screenshotRef !== 'string') {
      return res.status(400).json({ ok: false, error: 'screenshotRef is required — upload the review screenshot via /api/admin/proof first' });
    }
    const safeName = path.basename(screenshotRef);
    if (!safeName.startsWith(`${adminId}-`)) {
      return res.status(400).json({ ok: false, error: 'screenshotRef was not uploaded by this admin account' });
    }
    if (!fs.existsSync(path.join(PROOFS_UPLOAD_DIR, safeName))) {
      return res.status(400).json({ ok: false, error: 'screenshotRef not found on disk — re-upload via /api/admin/proof' });
    }

    const kyc = await KYC.findById(req.params.id);
    if (!kyc) return res.status(404).json({ ok: false, error: 'KYC submission not found' });

    kyc.status = action;
    kyc.reviewedAt = new Date();
    kyc.reviewedBy = req.user._id;
    kyc.notes = notes || '';
    // Persist the screenshot filename (not a URL) — the review-screenshot
    // route streams it back after re-checking the adminId prefix, matching
    // the KYC-document pattern.
    kyc.reviewedScreenshotRef = safeName;
    await kyc.save();

    if (action === 'approved') {
      await User.findByIdAndUpdate(kyc.userId, { kycLevel: 2 });
      activityEvents.emitKycApproved(String(kyc.userId), { kycId: kyc._id }).catch(() => {});
    } else {
      activityEvents.emitKycRejected(String(kyc.userId), { kycId: kyc._id, reason: notes }).catch(() => {});
    }

    await auditLog('kyc_review', req.user, { kycId: req.params.id, action, applicantId: String(kyc.userId), screenshotRef: safeName });
    return res.json({ ok: true, kyc });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ AML REVIEW ============
router.get('/aml-reviews/pending', requireCategory('kyc'), async (req, res) => {
  try {
    const { page = 0, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const query = { status: 'pending' };

    const [rawReviews, total] = await Promise.all([
      WithdrawalAmlReview.find(query)
        .populate('userId', 'email username')
        .sort({ submittedAt: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      WithdrawalAmlReview.countDocuments(query),
    ]);

    // .lean() bypasses the model's decrypt helper — decrypt the encrypted
    // narrative field explicitly before it reaches an admin, same pattern
    // as the KYC pending list above.
    const reviews = rawReviews.map((r) => WithdrawalAmlReview.decryptAmlPii(r));

    await auditLog('aml_pending_view', req.user, { resultCount: reviews.length });
    return res.json({ ok: true, reviews, total });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/aml-reviews/:id/review', requireCategory('kyc'), limiters.strict, async (req, res) => {
  try {
    const { action, notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'action must be approved or rejected' });
    }

    const review = await WithdrawalAmlReview.findById(req.params.id);
    if (!review) return res.status(404).json({ ok: false, error: 'AML review not found' });

    review.status = action;
    review.reviewedAt = new Date();
    review.reviewedBy = req.user._id;
    review.reviewNotes = notes || '';
    await review.save();

    await auditLog('aml_review', req.user, { reviewId: req.params.id, action, userId: String(review.userId) });
    return res.json({ ok: true, review: WithdrawalAmlReview.decryptAmlPii(review) });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ STRUCTURING FLAGS ============
router.get('/structuring-flags', requireCategory('treasury'), async (req, res) => {
  try {
    const { acknowledged, page = 0, limit = 50 } = req.query;
    const query = {};
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;

    const [flags, total] = await Promise.all([
      WithdrawalStructuringFlag.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      WithdrawalStructuringFlag.countDocuments(query),
    ]);

    return res.json({ ok: true, flags, total });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/structuring-flags/:id/acknowledge', requireCategory('treasury'), limiters.strict, async (req, res) => {
  try {
    const flag = await WithdrawalStructuringFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ ok: false, error: 'Structuring flag not found' });
    if (flag.acknowledged) {
      return res.status(409).json({ ok: false, error: 'This flag has already been acknowledged' });
    }

    flag.acknowledged = true;
    flag.acknowledgedBy = req.user._id;
    flag.acknowledgedAt = new Date();
    await flag.save();

    await auditLog('structuring_flag_acknowledge', req.user, { flagId: req.params.id, walletAddress: flag.walletAddress });
    return res.json({ ok: true, flag });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ TREASURY MANAGEMENT ============
router.get('/treasury/policies', requireCategory('treasury'), async (_req, res) => {
  try {
    const policies = await BurnPolicy.find({}).lean();
    return res.json({ ok: true, policies });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.post('/treasury/policies', requireCategory('treasury'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/treasury/policies/:activity', requireCategory('treasury'), limiters.strict, async (req, res) => {
  try {
    const result = await BurnPolicy.deleteOne({ activity: req.params.activity });
    await auditLog('treasury_policy_delete', req.user, { activity: req.params.activity });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.get('/treasury/dynamic-thresholds', requireCategory('treasury'), async (_req, res) => {
  try {
    const thresholds = await DynamicBurnThreshold.find({}).sort({ activity: 1, supplyThreshold: -1 }).lean();
    return res.json({ ok: true, thresholds });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.post('/treasury/dynamic-thresholds', requireCategory('treasury'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/treasury/dynamic-thresholds/:id', requireCategory('treasury'), limiters.strict, async (req, res) => {
  try {
    const result = await DynamicBurnThreshold.deleteOne({ _id: req.params.id });
    await auditLog('treasury_threshold_delete', req.user, { id: req.params.id });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.get('/treasury/ledger', requireCategory('treasury'), async (req, res) => {
  try {
    const { activity, direction, limit = 100 } = req.query;
    const query = {};
    if (activity) query.activity = activity;
    if (direction) query.direction = direction;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const entries = await TreasuryLedger.find(query).sort({ createdAt: -1 }).limit(safeLimit).lean();
    return res.json({ ok: true, entries });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

router.get('/treasury/metrics', requireCategory('treasury'), async (_req, res) => {
  try {
    const totals = await TreasuryLedger.aggregate([
      { $group: { _id: { activity: '$activity', direction: '$direction' }, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $project: { activity: '$_id.activity', direction: '$_id.direction', totalAmount: 1, count: 1, _id: 0 } },
    ]);
    return res.json({ ok: true, totals });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ error: 'internal error' });
  }
});

// ============ MINING TASK MANAGEMENT ============
router.get('/mining/campaigns', requireCategory('mining'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/mining/submissions/pending', requireCategory('mining'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/mining/submissions/:id/approve', requireCategory('mining'), limiters.strict, async (req, res) => {
  try {
    const { rewardAmount, screenshotRef } = req.body || {};
    const adminId = req.user?._id || req.user?.id;

    // Same screenshot-proof rule as KYC review: an approval that pays out
    // MLPTS must be backed by an uploaded capture, or a corrupt admin
    // could approve phantom submissions with no traceable evidence.
    if (!screenshotRef || typeof screenshotRef !== 'string') {
      return res.status(400).json({ ok: false, error: 'screenshotRef is required — upload the approval screenshot via /api/admin/proof first' });
    }
    const safeName = path.basename(screenshotRef);
    if (!safeName.startsWith(`${adminId}-`)) {
      return res.status(400).json({ ok: false, error: 'screenshotRef was not uploaded by this admin account' });
    }
    if (!fs.existsSync(path.join(PROOFS_UPLOAD_DIR, safeName))) {
      return res.status(400).json({ ok: false, error: 'screenshotRef not found on disk — re-upload via /api/admin/proof' });
    }

    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json({ ok: false, error: 'submission not found' });

    // Valid-task enforcement at the payout boundary too: even after a
    // submission passed mines.js's POST /submissions gate, the campaign
    // or its creator could have changed status between submission and
    // approval. Re-check before crediting MLPTS so a banned creator or
    // paused campaign can't keep paying out.
    if (sub.campaign_id) {
      const campaign = await Campaign.findById(sub.campaign_id).lean();
      if (!campaign) {
        return res.status(400).json({ ok: false, error: 'submission references a campaign that no longer exists' });
      }
      if (campaign.status !== 'active') {
        return res.status(400).json({ ok: false, error: `campaign is ${campaign.status} — cannot approve rewards` });
      }
      const creator = await User.findById(campaign.creator_id).select('banned creator_level role').lean();
      if (!creator) {
        return res.status(400).json({ ok: false, error: 'campaign creator no longer exists' });
      }
      if (creator.banned === true) {
        return res.status(400).json({ ok: false, error: 'campaign creator is banned — cannot approve rewards' });
      }
    }

    const updated = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: {
        status: 'auto_approved',
        completed_at: new Date().toISOString(),
        reviewedScreenshotRef: safeName,
        reviewedBy: adminId,
      } },
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

    await auditLog('mining_submission_approve', req.user, { submissionId: req.params.id, rewardAmount, screenshotRef: safeName });
    return res.json({ ok: true, submission: updated });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/mining/submissions/:id/reject', requireCategory('mining'), limiters.strict, async (req, res) => {
  try {
    const { note, screenshotRef } = req.body || {};
    const adminId = req.user?._id || req.user?.id;

    if (!screenshotRef || typeof screenshotRef !== 'string') {
      return res.status(400).json({ ok: false, error: 'screenshotRef is required — upload the rejection screenshot via /api/admin/proof first' });
    }
    const safeName = path.basename(screenshotRef);
    if (!safeName.startsWith(`${adminId}-`)) {
      return res.status(400).json({ ok: false, error: 'screenshotRef was not uploaded by this admin account' });
    }
    if (!fs.existsSync(path.join(PROOFS_UPLOAD_DIR, safeName))) {
      return res.status(400).json({ ok: false, error: 'screenshotRef not found on disk — re-upload via /api/admin/proof' });
    }

    const row = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: {
        status: 'rejected',
        rejection_note: note || null,
        reviewedScreenshotRef: safeName,
        reviewedBy: adminId,
      } },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ ok: false, error: 'submission not found' });

    await auditLog('mining_submission_reject', req.user, { submissionId: req.params.id, note, screenshotRef: safeName });
    return res.json({ ok: true, submission: row });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(400).json({ ok: false, error: 'invalid request' });
  }
});

// Upload a proof screenshot — used by KYC reviewers, mining submission
// approvers/rejectors. Returns a `documentRef` filename the caller then
// sends back as `screenshotRef` in the review body. Stored under the
// shared PROOFS_UPLOAD_DIR so the same retrieval/audit path works for
// both mining proofs (user-side) and admin review proofs (admin-side);
// ownership is encoded in the filename's `${userId}-` prefix.
router.post('/proof', requireAdmin, uploadProof.single('proof'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'proof file is required (PNG or JPG)' });
    await auditLog('admin_proof_upload', req.user, { filename: req.file.filename, size: req.file.size });
    return res.json({ ok: true, documentRef: req.file.filename });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Stream a previously-uploaded proof back to an admin (or, when the
// caller is the same admin who uploaded it, for their own review). Used
// for audit-log lookups and to show the proof beside a decision.
router.get('/proof/:ref', requireAdmin, async (req, res) => {
  const adminId = req.user?._id || req.user?.id;
  const isSuper = req.user?.role === 'superadmin';
  const ref = path.basename(req.params.ref);
  if (!isSuper && !ref.startsWith(`${adminId}-`)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const filePath = path.join(PROOFS_UPLOAD_DIR, ref);
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'not found' });
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: 'not found' });
  });
});

router.put('/mining/campaigns/:id', requireCategory('mining'), limiters.strict, async (req, res) => {
  try {
    // Whitelist allowed fields — $set: req.body would let an attacker set
    // any model field (budget, creatorId, status, etc.).
    const allowed = ['title', 'description', 'platform', 'status', 'budget', 'endDate', 'rewardPerVerification'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const row = await Campaign.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!row) return res.status(404).json({ ok: false, error: 'campaign not found' });
    await auditLog('mining_campaign_update', req.user, { campaignId: req.params.id });
    return res.json({ ok: true, campaign: row });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(400).json({ ok: false, error: 'invalid request' });
  }
});

// ============ GOVERNANCE OVERSIGHT ============
router.get('/governance/stats', requireCategory('blockchain'), async (_req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ AUDIT LOG ============
router.get('/audit', requireSuperAdmin, async (req, res) => {
  try {
    const { action, actor, page = 0, limit = 100 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (actor) query.actor = { $regex: escapeRegex(actor), $options: 'i' };

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      AuditLog.countDocuments(query),
    ]);
    return res.json({ ok: true, logs, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ SYSTEM OPERATIONS ============
router.post('/reconcile', requireCategory('treasury'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.post('/reconciliation/run', requireCategory('treasury'), limiters.strict, async (req, res) => {
  try {
    const { runReconciliationJob } = require('../services/reconciliationService');
    const result = await runReconciliationJob();
    await auditLog('system_reconciliation_run', req.user, 'Reconciliation job triggered');
    return res.json({ ok: true, result });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/reconciliation/items', requireCategory('treasury'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Marks a reconciliation item resolved. This is a record-keeping action only —
// it does NOT itself perform any on-chain reversal or transfer. Matching
// reconciliationService.js's own compensateFailedLiquidity comment: silently
// claiming something was fixed without an actual reversal would be a
// financial-integrity bug, so this just lets an admin document how a
// pending_manual (or detected) item was actually handled out-of-band.
router.post('/reconciliation/:id/resolve', requireCategory('treasury'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/withdrawals', requireCategory('treasury'), async (req, res) => {
  try {
    const { status, page = 0, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = Math.max(Number(page) || 0, 0) * safeLimit;
    const [rawWithdrawals, total] = await Promise.all([
      WithdrawalRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      WithdrawalRequest.countDocuments(query),
    ]);
    // phone is encrypted at rest; decrypt for the admin-facing list so it
    // doesn't render as ciphertext.
    const withdrawals = rawWithdrawals.map((w) => WithdrawalRequest.decryptPhone(w));

    return res.json({ ok: true, withdrawals, total, page: Number(page) || 0, limit: safeLimit });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Re-attempts the Safaricom B2C payout for a withdrawal whose prior attempt
// failed — the same call routes/withdraw.js and routes/buy.js's /sell make
// on the original request, just triggered manually instead of automatically.
router.post('/withdrawals/:id/retry', requireCategory('treasury'), limiters.strict, async (req, res) => {
  try {
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ ok: false, error: 'Withdrawal not found' });
    if (withdrawal.status !== 'failed') {
      return res.status(409).json({ ok: false, error: `Only a failed withdrawal can be retried (current status: ${withdrawal.status})` });
    }

    const payoutResult = await initiateB2CPayout({
      sellerPhone: WithdrawalRequest.decryptPhone(withdrawal).phone,
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Records how a failed withdrawal was actually settled outside the automated
// payout path (e.g. a manual M-Pesa send, or a refund back to the user by
// another channel) — like reconciliation/resolve above, this is record-
// keeping only and does not itself move any money.
router.post('/withdrawals/:id/resolve', requireCategory('treasury'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ BADGES ============
router.get('/badges/purchases', requireCategory('mining'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/badges/issuances', requireCategory('mining'), async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Manual grant for support cases (streak missed due to a tracking gap, goodwill
// gesture, etc). Reuses the same on-chain issuance path as the streak snapshot
// and the paid-purchase flow, just recorded with method 'admin_manual'.
router.post('/badges/grant', requireSuperAdmin, limiters.strict, async (req, res) => {
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

    const user = await User.findOne({ walletAddress_blind: blindIndex(walletAddress) }).lean();
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Off-chain support action only (mark a purchase as void/refunded) — there is
// no on-chain "revoke badge" message, so this can't undo an already-issued
// badge, only stop a purchase short of issuance.
router.post('/badges/purchases/:quoteId/void', requireCategory('mining'), limiters.strict, async (req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Admin approves a paid purchase and issues the badge on-chain to the chosen wallet.
// The walletAddress can differ from the purchase's original walletAddress — this lets
// the buyer choose which of their wallets receives the badge at approval time.
router.post('/badges/approve', requireCategory('mining'), limiters.strict, async (req, res) => {
  try {
    const { quoteId, walletAddress } = req.body || {};
    if (!quoteId || !walletAddress) {
      return res.status(400).json({ ok: false, error: 'quoteId and walletAddress are required' });
    }

    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ ok: false, error: 'Purchase not found' });

    if (purchase.status === 'issued') {
      return res.status(409).json({ ok: false, error: 'Badge already issued for this purchase' });
    }
    if (purchase.status !== 'awaiting_admin') {
      return res.status(400).json({ ok: false, error: `Purchase is not awaiting admin approval (current status: ${purchase.status})` });
    }

    const existing = await getUserBadgeInfo(walletAddress);
    if (existing.exists) {
      return res.status(409).json({ ok: false, error: 'This wallet already has a badge' });
    }

    const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
    if (!operatorMnemonic) {
      return res.status(503).json({ ok: false, error: 'Badge issuance is not configured yet' });
    }

    purchase.status = 'processing';
    await purchase.save();

    try {
      const result = await issueBadgeFromMnemonic({
        mnemonic: operatorMnemonic,
        recipient: walletAddress,
        badgeType: 'gold',
      });

      purchase.status = 'issued';
      purchase.walletAddress = walletAddress;
      purchase.badgeTxHash = result.txHash;
      await purchase.save();

      const user = await User.findOne({ walletAddress_blind: blindIndex(walletAddress) }).lean();
      await BadgeIssuance.create({
        userId: user?._id,
        walletAddress,
        method: 'purchase',
        badgeType: 'gold',
        txHash: result.txHash,
      });

      if (user) {
        await notifyUser(user, {
          kind: 'badge',
          title: 'Badge approved and issued!',
          body: 'Your Mallchain badge has been approved and issued on-chain. You can now convert Mallpoints to Mallcoin every month on the 15th.',
        });
      }

      await auditLog('badge_admin_approve', req.user, { quoteId, walletAddress, txHash: result.txHash });
      return res.json({ ok: true, txHash: result.txHash });
    } catch (issueErr) {
      purchase.status = 'awaiting_admin';
      purchase.reason = issueErr.message;
      await purchase.save();
      throw issueErr;
    }
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Admin rejects a paid purchase — marks it as rejected without issuing a badge.
router.post('/badges/reject', requireCategory('mining'), limiters.strict, async (req, res) => {
  try {
    const { quoteId, reason } = req.body || {};
    if (!quoteId) return res.status(400).json({ ok: false, error: 'quoteId is required' });

    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ ok: false, error: 'Purchase not found' });

    if (purchase.status === 'issued') {
      return res.status(400).json({ ok: false, error: 'Cannot reject — badge already issued' });
    }
    if (purchase.status !== 'awaiting_admin') {
      return res.status(400).json({ ok: false, error: `Purchase is not awaiting admin approval (current status: ${purchase.status})` });
    }

    purchase.status = 'rejected';
    purchase.reason = reason || 'Rejected by admin';
    await purchase.save();

    const user = await User.findOne({ walletAddress_blind: blindIndex(purchase.walletAddress) }).lean();
    if (user) {
      await notifyUser(user, {
        kind: 'badge',
        title: 'Badge purchase update',
        body: reason || 'Your badge purchase was not approved. Please contact support for details.',
      });
    }

    await auditLog('badge_admin_reject', req.user, { quoteId, reason });
    return res.json({ ok: true, purchase: purchase.toObject() });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Upload a new badge design image. Deactivates previous active designs.
router.post('/badges/design', requireCategory('mining'), limiters.strict, uploadBadgeImage.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No image file provided' });

    const now = new Date();
    await BadgeDesign.updateMany({ active: true }, { $set: { active: false } });

    const design = await BadgeDesign.create({
      imageUrl: `/uploads/badges/${req.file.filename}`,
      originalName: req.file.originalname,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      uploadedBy: req.user?.id || req.user?._id,
      active: true,
    });

    await auditLog('badge_design_upload', req.user, { designId: design._id, filename: req.file.filename });
    return res.json({ ok: true, design });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Get current active badge design
router.get('/badges/design', requireCategory('mining'), async (_req, res) => {
  try {
    const design = await BadgeDesign.findOne({ active: true }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, design });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Serve badge images statically
router.get('/badges/design/image', requireCategory('mining'), async (_req, res) => {
  try {
    const design = await BadgeDesign.findOne({ active: true }).sort({ createdAt: -1 }).lean();
    if (!design) return res.status(404).json({ ok: false, error: 'No badge design uploaded yet' });
    const filePath = path.join(__dirname, '..', '..', design.imageUrl.replace(/^\//, ''));
    return res.sendFile(filePath);
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ CHAIN MONITORING ============
router.get('/chain/status', requireCategory('blockchain'), async (_req, res) => {
  try {
    const axios = require('axios');
    const chainRest = process.env.CHAIN_REST || 'http://localhost:1317';
    const timeout = 5000;

    const [nodeInfo, block, netInfo] = await Promise.all([
      axios.get(`${chainRest}/cosmos/base/tendermint/v1beta1/node_info`, { timeout }).catch(() => null),
      axios.get(`${chainRest}/cosmos/base/tendermint/v1beta1/blocks/latest`, { timeout }).catch(() => null),
      axios.get(`${chainRest}/cosmos/base/tendermint/v1beta1/net_info`, { timeout }).catch(() => null),
    ]);

    const header = block?.data?.block?.header;
    const blockTime = header?.time;
    const height = header ? parseInt(header.height, 10) : 0;

    let txCount = 0;
    if (height > 0) {
      try {
        const txRes = await axios.get(`${chainRest}/cosmos/tx/v1beta1/txs?events=tx.height=${height}&pagination.limit=100`, { timeout });
        txCount = txRes?.data?.tx_responses?.length || 0;
      } catch { /* ignore */ }
    }

    const peerCount = netInfo?.data?.n_peers || 0;

    const status = {
      blockHeight: height,
      blockTime: blockTime || null,
      chainId: nodeInfo?.data?.default_node_info?.network || 'unknown',
      nodeVersion: nodeInfo?.data?.default_node_info?.version || 'unknown',
      moniker: nodeInfo?.data?.default_node_info?.moniker || 'unknown',
      syncing: nodeInfo?.data?.sync_info?.catching_up || false,
      latestBlockHash: block?.data?.block_id?.hash || null,
      peerCount,
      txCountInBlock: txCount,
    };

    return res.json({ ok: true, status });
  } catch (err) {
    logger.error('adminPanel', { route: '/chain/status', error: err.message || String(err) });
    return res.json({ ok: true, status: { blockHeight: 0, chainId: 'unavailable', nodeVersion: 'unknown', moniker: 'unknown', syncing: false, peerCount: 0, txCountInBlock: 0, blockTime: null, latestBlockHash: null } });
  }
});

router.get('/chain/blocks', requireCategory('blockchain'), async (req, res) => {
  try {
    const axios = require('axios');
    const chainRest = process.env.CHAIN_REST || 'http://localhost:1317';
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    const latestRes = await axios.get(`${chainRest}/cosmos/base/tendermint/v1beta1/blocks/latest`, { timeout: 5000 }).catch(() => null);
    if (!latestRes?.data?.block?.header) {
      return res.json({ ok: true, blocks: [] });
    }

    const latestHeight = parseInt(latestRes.data.block.header.height, 10);
    const blocks = [];

    for (let i = 0; i < limit; i++) {
      const h = latestHeight - i;
      if (h <= 0) break;
      try {
        const blockRes = await axios.get(`${chainRest}/cosmos/base/tendermint/v1beta1/blocks/${h}`, { timeout: 3000 });
        const b = blockRes.data;
        blocks.push({
          height: h,
          hash: b.block_id?.hash || '',
          proposer: b.block?.header?.proposer_address || '',
          time: b.block?.header?.time || '',
          txCount: b.block?.data?.txs?.length || 0,
        });
      } catch { break; }
    }

    return res.json({ ok: true, blocks });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

router.get('/chain/validators', requireCategory('blockchain'), async (_req, res) => {
  try {
    const axios = require('axios');
    const chainRest = process.env.CHAIN_REST || 'http://localhost:1317';

    const [valsRes, poolRes] = await Promise.all([
      axios.get(`${chainRest}/cosmos/staking/v1beta1/validators?pagination.limit=100`, { timeout: 5000 }).catch(() => null),
      axios.get(`${chainRest}/cosmos/staking/v1beta1/pool`, { timeout: 5000 }).catch(() => null),
    ]);

    const validators = (valsRes?.data?.validators || []).map((v) => ({
      moniker: v.description?.moniker || 'Unknown',
      operatorAddress: v.operator_address,
      consensusAddress: v.consensus_pubkey?.key || '',
      status: v.status,
      tokens: v.tokens,
      commission: v.commission?.commission_rates?.rate || '0',
      jailed: v.jailed,
    }));

    return res.json({
      ok: true,
      validators,
      bondedTokens: poolRes?.data?.pool?.bonded_tokens || '0',
    });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ BROADCAST NOTIFICATIONS ============
router.post('/notifications/broadcast', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const { title, message, type, channels } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ ok: false, error: 'title and message are required' });
    }

    const Notification = require('../models/Notification');
    const validTypes = ['transaction', 'security', 'governance', 'campaign', 'badge', 'marketing', 'system'];
    const notifType = validTypes.includes(type) ? type : 'system';

    const users = await User.find({ banned: { $ne: true } }).select('_id').lean();
    const notifications = users.map((u) => ({
      userId: u._id,
      type: notifType,
      title,
      message,
      channels: {
        email: channels?.email || false,
        sms: channels?.sms || false,
        whatsapp: channels?.whatsapp || false,
        inApp: channels?.inApp !== false,
      },
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    await auditLog('notification_broadcast', req.user, { title, recipientCount: notifications.length, type: notifType });

    return res.json({ ok: true, recipientCount: notifications.length });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ EMERGENCY PAUSE / MAINTENANCE MODE ============
// Break-glass control for money-moving surfaces (send/withdraw/buy/payment/
// marketplace/staking/vault). Read is available to any admin; toggling
// requires superadmin, the same bar as user role changes and deletes.
router.get('/maintenance', requireSuperAdmin, async (_req, res) => {
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
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
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

    // Preserve the existing reason when the caller doesn't supply a new one —
    // otherwise every scope toggle would wipe the reason the admin set when
    // enabling global pause (or a previous scope), leaving users with a blank
    // banner even though maintenance is still active.
    const existing = await MaintenanceMode.findById('singleton').lean();
    const update = {
      reason: reason !== undefined ? reason : (existing?.reason || ''),
      updatedBy: User.decryptUserPii(req.user).email || String(req.user._id),
    };
    if (global !== undefined) update.global = !!global;
    if (scope !== undefined) update[`scopes.${scope}`] = !!paused;

    const state = await MaintenanceMode.findByIdAndUpdate(
      'singleton',
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    invalidateMaintenanceCache();

    await auditLog('maintenance_mode_change', req.user, { global, scope, paused, reason }, 'success');

    return res.json({
      ok: true,
      global: state.global,
      scopes: state.scopes,
      reason: state.reason,
      updatedBy: state.updatedBy || null,
      updatedAt: state.updatedAt || null,
    });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

const Report = require('../models/Report');

const VALID_CATEGORIES = ['users', 'blockchain', 'validator', 'kyc', 'mining', 'treasury', 'marketplace', 'mlpts', 'reports'];

// ============ PRESENCE ============
// Tells category admins whether a superadmin is currently online so the
// Reports UI can colour the "awaiting reply" indicator. "Online" = a
// superadmin hit any authed route in the last 60 seconds; requireAuth has
// been doing the lastSeenAt touch since the category system was added.
router.get('/presence', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 60 * 1000);
    const onlineAdmin = await User.findOne({
      role: 'superadmin',
      lastSeenAt: { $gte: since },
    }).select('email lastSeenAt').lean();

    // Email is encrypted at rest — decrypt for the presence response so
    // the UI can show "Super Admin X is online" without ever seeing the
    // ciphertext blob. Fall back gracefully if the row is unreadable.
    let decryptedEmail = null;
    if (onlineAdmin) {
      try {
        decryptedEmail = onlineAdmin.email ? decryptField(onlineAdmin.email) : null;
      } catch {
        decryptedEmail = null;
      }
    }

    return res.json({
      ok: true,
      superadminOnline: !!onlineAdmin,
      lastSeenAt: onlineAdmin ? onlineAdmin.lastSeenAt : null,
      lastSeenEmail: decryptedEmail,
    });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ REPORTS ============
// Submitting a report — any admin can do this. category admins use this
// to escalate to the superadmin. The fromCategory snapshot is taken from
// req.user so an admin who later gets reassigned still has their reports
// labelled correctly.
router.post('/reports', limiters.strict, async (req, res) => {
  try {
    const { subject, body } = req.body || {};
    if (typeof subject !== 'string' || subject.trim().length < 3 || subject.length > 200) {
      return res.status(400).json({ ok: false, error: 'subject must be 3–200 chars' });
    }
    if (typeof body !== 'string' || body.trim().length < 10 || body.length > 5000) {
      return res.status(400).json({ ok: false, error: 'body must be 10–5000 chars' });
    }

    const report = await Report.create({
      fromUserId: req.user._id,
      fromCategory: req.user.adminCategory || 'reports',
      subject: subject.trim(),
      body: body.trim(),
    });

    return res.json({ ok: true, report });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Listing reports — superadmins see all (inbox view), category admins
// see only what they've sent (sent view). Both views need the list to
// drive the colour-coded status pills.
router.get('/reports', async (req, res) => {
  try {
    let reportsRaw;
    if (req.user.role === 'superadmin') {
      reportsRaw = await Report.find({}).sort({ createdAt: -1 }).limit(200);
    } else {
      reportsRaw = await Report.find({ fromUserId: req.user._id }).sort({ createdAt: -1 }).limit(200);
    }
    // Trim down to the payload shape the UI cares about — don't leak _id
    // internals or the as-objectId type
    const reports = reportsRaw.map((r) => ({
      _id: r._id,
      fromCategory: r.fromCategory,
      subject: r.subject,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      readAt: r.readAt,
      actionedAt: r.actionedAt,
      superadminReply: r.superadminReply,
      repliedAt: r.repliedAt,
    }));
    return res.json({ ok: true, reports });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Mark a report as read — superadmin only. This is the action that flips
// the sender's pill from orange to blue.
router.patch('/reports/:id/read', requireSuperAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ ok: false, error: 'report not found' });

    // Idempotent: only set readAt the first time. Subsequent reads leave
    // the original timestamp so the sender can see when the superadmin
    // first opened it.
    if (report.status === 'sent') {
      report.status = 'read';
      report.readAt = new Date();
      await report.save();
    }
    return res.json({ ok: true, report });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Mark a report for action — superadmin only. Flips the sender's pill
// from blue to green. A reply note is optional but recommended.
router.patch('/reports/:id/action', requireSuperAdmin, async (req, res) => {
  try {
    const { reply } = req.body || {};
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ ok: false, error: 'report not found' });

    report.status = 'actioned';
    report.actionedAt = new Date();
    if (!report.readAt) report.readAt = report.actionedAt;
    if (typeof reply === 'string' && reply.trim().length > 0) {
      if (reply.length > 1000) {
        return res.status(400).json({ ok: false, error: 'reply must be ≤1000 chars' });
      }
      report.superadminReply = reply.trim();
      report.repliedAt = new Date();
    }
    await report.save();
    return res.json({ ok: true, report });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// ============ CATEGORY ADMIN PROVISIONING ============
// Create a new category-scoped admin — superadmin only. The new admin
// gets role=admin and exactly one adminCategory. Password is bcrypt-hashed
// with cost 12 to match the rest of the auth system.
router.post('/users', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const { email, password, name, adminCategory } = req.body || {};

    if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      return res.status(400).json({ ok: false, error: 'valid email required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'password must be at least 8 chars' });
    }
    if (!VALID_CATEGORIES.includes(adminCategory)) {
      return res.status(400).json({ ok: false, error: 'valid adminCategory required' });
    }

    const blind = blindIndex(email.toLowerCase().trim());
    const existing = await User.findOne({ email_blind: blind }).select('_id').lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'email already registered' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      email,
      password: hashedPassword,
      name: name || email.split('@')[0],
      role: 'admin',
      adminCategory,
      kycLevel: 1,
      ageVerifiedAt: new Date(),
      tosAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    });

    await auditLog('category_admin_created', req.user, { createdEmail: email, category: adminCategory });

    return res.json({
      ok: true,
      user: {
        _id: user._id,
        email: decryptField(user.email) || user.email,
        name: user.name,
        role: user.role,
        adminCategory: user.adminCategory,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

// Reassign a category admin's category — superadmin only. Used when an
// admin needs to be moved between categories. Cannot escalate to
// superadmin through this endpoint — that's a manual DB move.
router.patch('/users/:id/category', requireSuperAdmin, limiters.strict, async (req, res) => {
  try {
    const { adminCategory } = req.body || {};
    if (!VALID_CATEGORIES.includes(adminCategory)) {
      return res.status(400).json({ ok: false, error: 'valid adminCategory required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
    if (user.role !== 'admin') {
      return res.status(400).json({ ok: false, error: 'only admin users can be assigned a category' });
    }

    const oldCategory = user.adminCategory;
    user.adminCategory = adminCategory;
    await user.save();
    await auditLog('category_admin_reassigned', req.user, { userEmail: decryptField(user.email) || user.email, from: oldCategory, to: adminCategory });

    return res.json({
      ok: true,
      user: {
        _id: user._id,
        email: decryptField(user.email) || user.email,
        adminCategory: user.adminCategory,
      },
    });
  } catch (err) {
    logger.error('adminPanel', { route: req.originalUrl, error: err.message || String(err) });
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

module.exports = router;
