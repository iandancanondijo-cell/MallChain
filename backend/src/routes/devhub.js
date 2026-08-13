const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

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
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

// In-memory storage for API keys (replace with database in production)
const apiKeys = [];
const apiUsage = {};

// Generate random API key
function generateApiKey() {
  return 'mk_' + crypto.randomBytes(32).toString('hex');
}

// GET /api/devhub/keys - List API keys
router.get('/keys', verifyToken, async (req, res) => {
  try {
    const userKeys = apiKeys.filter(k => k.userId === req.userId && !k.revoked);
    res.json(ok(userKeys));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/devhub/keys - Create new API key
router.post('/keys', verifyToken, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name) {
      return res.status(400).json(fail('name is required'));
    }

    const apiKey = {
      id: 'key_' + Date.now() + Math.random().toString(36).slice(2, 9),
      userId: req.userId,
      name,
      key: generateApiKey(),
      permissions: permissions || ['read'],
      used: 0,
      created: new Date().toISOString(),
      lastUsed: null,
      revoked: false
    };

    apiKeys.push(apiKey);
    apiUsage[apiKey.id] = {
      total: 0,
      today: 0,
      week: 0,
      month: 0
    };

    res.json(ok(apiKey));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// DELETE /api/devhub/keys/:id - Revoke API key
router.delete('/keys/:id', verifyToken, async (req, res) => {
  try {
    const apiKey = apiKeys.find(k => k.id === req.params.id && k.userId === req.userId);
    if (!apiKey) {
      return res.status(404).json(fail('API key not found'));
    }
    apiKey.revoked = true;
    apiKey.revokedAt = new Date().toISOString();
    res.json(ok({ revoked: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/devhub/usage - API usage stats
router.get('/usage', verifyToken, async (req, res) => {
  try {
    const userKeys = apiKeys.filter(k => k.userId === req.userId);
    const totalUsage = userKeys.reduce((sum, k) => sum + (apiUsage[k.id]?.total || 0), 0);
    
    const stats = {
      totalRequests: totalUsage,
      keysActive: userKeys.filter(k => !k.revoked).length,
      keysTotal: userKeys.length,
      usage: userKeys.map(k => ({
        keyId: k.id,
        keyName: k.name,
        ...apiUsage[k.id]
      })),
      lastUpdated: new Date().toISOString()
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
        {
          path: '/api/auth/login',
          method: 'POST',
          description: 'Authenticate user and get JWT token',
          auth: false
        },
        {
          path: '/api/wallet/balance',
          method: 'GET',
          description: 'Get wallet balance',
          auth: true
        },
        {
          path: '/api/mines/campaigns/active',
          method: 'GET',
          description: 'List active campaigns',
          auth: false
        },
        {
          path: '/api/staking/delegate',
          method: 'POST',
          description: 'Delegate tokens to validator',
          auth: true
        }
      ]
    };
    res.json(ok(docs));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/devhub/keys/:id - Update API key
router.put('/keys/:id', verifyToken, async (req, res) => {
  try {
    const apiKey = apiKeys.find(k => k.id === req.params.id && k.userId === req.userId);
    if (!apiKey) {
      return res.status(404).json(fail('API key not found'));
    }

    const { name, permissions } = req.body;
    if (name) apiKey.name = name;
    if (permissions) apiKey.permissions = permissions;
    apiKey.updated = new Date().toISOString();

    res.json(ok(apiKey));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
