const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../models/user');

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', new mongoose.Schema({}, { strict: false }));
const TaskSubmission = mongoose.models.TaskSubmission || mongoose.model('TaskSubmission', new mongoose.Schema({}, { strict: false }));
const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', new mongoose.Schema({}, { strict: false }));

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
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err) { return { ok: false, error: String(err) }; }

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

// Authenticated endpoints
router.post('/campaigns', async (req, res) => {
  try {
    const row = await Campaign.create(req.body);
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.put('/campaigns/:id', async (req, res) => {
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

router.post('/submissions', verifyToken, async (req, res) => {
  try {
    const body = { ...req.body, miner_id: req.userId };
    const row = await TaskSubmission.create(body);
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.put('/submissions/:id', async (req, res) => {
  try {
    const row = await TaskSubmission.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    res.json(ok(row));
  } catch (e) { res.status(400).json(fail(e)); }
});

router.get('/submissions/pending', async (_req, res) => {
  try {
    const rows = await TaskSubmission.find({ status: 'manual_review' }).sort({ created_at: -1 }).limit(50).lean();
    res.json(ok(rows));
  } catch (e) { res.json(ok([])); }
});

router.post('/submissions/:id/approve', async (req, res) => {
  try {
    const { rewardAmount } = req.body || {};
    const sub = await TaskSubmission.findById(req.params.id).lean();
    if (!sub) return res.status(404).json(fail('submission not found'));

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
    res.json(ok(updated));
  } catch (e) { res.status(500).json(fail(e)); }
});

router.post('/submissions/:id/reject', async (req, res) => {
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

// Balance operations - for cross-app MLPTS sync
router.post('/balance/credit', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json(fail('invalid amount'));
    await User.findByIdAndUpdate(req.userId, { $inc: { mlpts_balance: amount } });
    await WalletTransaction.create({
      user_id: req.userId,
      type: 'credit',
      amount,
      currency: 'MLPTS',
      description: 'Balance credit',
    });
    res.json(ok({ success: true }));
  } catch (e) { res.status(500).json(fail(e)); }
});

router.post('/balance/deduct', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json(fail('invalid amount'));
    const u = await User.findById(req.userId);
    if (!u || u.mlpts_balance < amount) return res.status(400).json(fail('insufficient balance'));
    await User.findByIdAndUpdate(req.userId, { $inc: { mlpts_balance: -amount } });
    await WalletTransaction.create({
      user_id: req.userId,
      type: 'debit',
      amount,
      currency: 'MLPTS',
      description: 'Balance deduction',
    });
    res.json(ok({ success: true }));
  } catch (e) { res.status(500).json(fail(e)); }
});

module.exports = router;