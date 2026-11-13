const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const ApiKey = require('../models/devhubApiKey');
const { DEVHUB_PERMISSION } = require('../middleware/devhubKey');
const { createLimiter } = require('../middleware/rateLimiter');
const devhubV1 = require('./devhubApi');
const { respondFailure } = require('../utils/respondFailure');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

function generateApiKey() {
  return 'mk_' + crypto.randomBytes(32).toString('hex');
}

const keyLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const MAX_KEY_NAME = 60;
const MAX_KEYS_PER_USER = 20;

/** The only permission the server enforces — see middleware/devhubKey.js. */
const PERMISSIONS = [DEVHUB_PERMISSION];

function keyName(raw) {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_KEY_NAME) : '';
}

// The developer API a key actually unlocks. Mounted before the JWT routes so
// /v1/* is never caught by a /:id pattern.
router.use('/v1', devhubV1);

// GET /api/devhub/keys - List API keys
router.get('/keys', auth, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user._id, revoked: false }).sort({ created: -1 }).lean();
    res.json(ok(keys));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/devhub/keys - Create new API key
router.post('/keys', auth, keyLimiter, async (req, res) => {
  try {
    const name = keyName(req.body?.name);
    if (!name) {
      return res.status(400).json(fail('Give the key a name so you can tell your integrations apart'));
    }

    const active = await ApiKey.countDocuments({ userId: req.user._id, revoked: false });
    if (active >= MAX_KEYS_PER_USER) {
      return res.status(409).json(fail(`You already have ${MAX_KEYS_PER_USER} active keys. Revoke one before creating another.`));
    }

    const apiKey = await ApiKey.create({
      userId: req.user._id,
      name,
      key: generateApiKey(),
      permissions: PERMISSIONS,
    });

    res.json(ok(apiKey));
  } catch (e) {
    respondFailure(res, e, fail);
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
    respondFailure(res, e, fail);
  }
});

// POST /api/devhub/test - Validate an x-api-key header against a real,
// stored, unrevoked key and record real usage (used++/lastUsed). Previously
// nothing in the backend ever checked a `mk_...` key against anything — a
// freshly created key returned 401 on every real call, and `used` could
// never move off 0 no matter what a developer did with it (confirmed live:
// created a key, called an endpoint with it, got rejected as unauthorized).
// This is the endpoint the DevHub UI's "Test key" action should call.
router.post('/test', async (req, res) => {
  try {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json(fail('x-api-key header is required'));

    const apiKey = await ApiKey.findOneAndUpdate(
      { key, revoked: false },
      { $inc: { used: 1 }, $set: { lastUsed: new Date() } },
      { new: true }
    );
    if (!apiKey) return res.status(401).json(fail('Invalid or revoked API key'));

    res.json(ok({ valid: true, keyName: apiKey.name, permissions: apiKey.permissions, used: apiKey.used }));
  } catch (e) {
    respondFailure(res, e, fail);
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
    respondFailure(res, e, fail);
  }
});

// GET /api/devhub/docs - API documentation, generated from what is really mounted
router.get('/docs', async (_req, res) => {
  try {
    const baseUrl = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    const docs = {
      version: '1.0',
      baseUrl,
      authentication: {
        developer: {
          header: 'x-api-key',
          prefix: 'mk_',
          description: 'A Developer Hub key. Grants read on /api/devhub/v1 only, is rate-limited per key, and every call increments the key\'s usage counter. Never send it as a query parameter.',
          permission: DEVHUB_PERMISSION,
          rateLimitPerMinute: 120,
        },
        user: {
          header: 'Authorization: Bearer <jwt>',
          description: 'The token POST /api/auth/login returns. Required for account routes such as key management; a developer key cannot manage keys.',
        },
      },
      endpoints: [
        { path: '/api/devhub/v1/whoami', method: 'GET', auth: 'x-api-key', description: 'The key\'s owner, permission, call count and rate limit' },
        { path: '/api/devhub/v1/status', method: 'GET', auth: 'x-api-key', description: 'Chain head: height, hash, chain ID and latest block time, read from the node RPC' },
        { path: '/api/devhub/v1/blocks', method: 'GET', auth: 'x-api-key', description: 'Recent blocks, newest first. ?limit=1..50 (default 20)' },
        { path: '/api/devhub/v1/blocks/:height', method: 'GET', auth: 'x-api-key', description: 'One block by height, or "latest"' },
        { path: '/api/devhub/v1/tx/:hash', method: 'GET', auth: 'x-api-key', description: 'One transaction by hash, with its result code and gas' },
        { path: '/api/devhub/v1/wallet/:address', method: 'GET', auth: 'x-api-key', description: 'MLCNS balance in base units and display amounts, including locked funds' },
        { path: '/api/devhub/v1/staking/:address', method: 'GET', auth: 'x-api-key', description: 'Active and historical MLCNS reward-pool stakes for an address' },
        { path: '/api/devhub/test', method: 'POST', auth: 'x-api-key', description: 'Validate a key and record one call. Returns its name, permission and total usage' },
        { path: '/api/devhub/keys', method: 'GET', auth: 'bearer', description: 'List your active keys' },
        { path: '/api/devhub/keys', method: 'POST', auth: 'bearer', description: 'Create a key. Body: { name }' },
        { path: '/api/devhub/keys/:id', method: 'PUT', auth: 'bearer', description: 'Rename a key. Body: { name }' },
        { path: '/api/devhub/keys/:id', method: 'DELETE', auth: 'bearer', description: 'Revoke a key. Immediate and permanent' },
        { path: '/api/devhub/usage', method: 'GET', auth: 'bearer', description: 'Call totals per key, including revoked ones' },
        { path: '/api/auth/login', method: 'POST', auth: false, description: 'Authenticate and receive the JWT the account routes need' },
      ],
      notes: [
        'Responses are enveloped as { ok: true, data } or { ok: false, error }.',
        'A 502 or 503 from a v1 route means the chain node was unreachable — the data was not silently zeroed.',
        'Transactions are signed on your own device. No endpoint here accepts a recovery phrase or broadcasts on your behalf.',
      ],
    };
    res.json(ok(docs));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// PUT /api/devhub/keys/:id - Rename an API key
router.put('/keys/:id', auth, async (req, res) => {
  try {
    const name = keyName(req.body?.name);
    if (!name) return res.status(400).json(fail('A key name cannot be empty'));

    const apiKey = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, revoked: false },
      { $set: { name } },
      { new: true }
    );
    if (!apiKey) {
      return res.status(404).json(fail('API key not found'));
    }

    res.json(ok(apiKey));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

module.exports = router;
