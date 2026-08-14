const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const ApiKey = require('../models/ApiKey');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

function generateApiKey() {
  return 'mk_' + crypto.randomBytes(32).toString('hex');
}

// GET /api/devhub/keys - List API keys
router.get('/keys', auth, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user._id, revoked: false }).sort({ created: -1 }).lean();
    res.json(ok(keys));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/devhub/keys - Create new API key
router.post('/keys', auth, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name) {
      return res.status(400).json(fail('name is required'));
    }

    const apiKey = await ApiKey.create({
      userId: req.user._id,
      name,
      key: generateApiKey(),
      permissions: permissions || ['read'],
    });

    res.json(ok(apiKey));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// DELETE /api/devhub/keys/:id - Revoke API key
router.delete('/keys/:id', auth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { revoked: true, revokedAt: new Date() } },
      { new: true }
    );
    if (!apiKey) {
      return res.status(404).json(fail('API key not found'));
    }
    res.json(ok({ revoked: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/devhub/usage - API usage stats
router.get('/usage', auth, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user._id }).lean();
    const totalUsage = keys.reduce((sum, k) => sum + (k.used || 0), 0);

    const stats = {
      totalRequests: totalUsage,
      keysActive: keys.filter((k) => !k.revoked).length,
      keysTotal: keys.length,
      usage: keys.map((k) => ({ keyId: k._id, keyName: k.name, total: k.used || 0, lastUsed: k.lastUsed })),
      lastUpdated: new Date().toISOString(),
    };

    res.json(ok(stats));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/devhub/docs - API documentation
router.get('/docs', async (_req, res) => {
  try {
    const docs = {
      version: '1.0',
      baseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
      authentication: 'Bearer token',
      endpoints: [
        { path: '/api/auth/login', method: 'POST', description: 'Authenticate user and get JWT token', auth: false },
        { path: '/api/wallet/balance', method: 'GET', description: 'Get wallet balance', auth: true },
        { path: '/api/mines/campaigns/active', method: 'GET', description: 'List active campaigns', auth: false },
        { path: '/api/staking/summary/:address', method: 'GET', description: 'Get staking summary for an address', auth: false },
      ],
    };
    res.json(ok(docs));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/devhub/keys/:id - Update API key
router.put('/keys/:id', auth, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const update = {};
    if (name) update.name = name;
    if (permissions) update.permissions = permissions;

    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: update },
      { new: true }
    );
    if (!apiKey) {
      return res.status(404).json(fail('API key not found'));
    }

    res.json(ok(apiKey));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
