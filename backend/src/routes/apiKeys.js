const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const APIKey = require('../models/apiKey');
const logger = require('../utils/logger');

// Middleware: require JWT auth
router.use(requireAuth());

/**
 * GET /api/api-keys
 * List all API keys for current user (keys masked)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const keys = await APIKey.find({ userId })
      .select('_id name keyPrefix scope expiresAt revokedAt lastUsedAt usageCount environment createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Add computed status field
    const enrichedKeys = keys.map((key) => ({
      ...key,
      status: key.revokedAt ? 'revoked' : new Date() > key.expiresAt ? 'expired' : 'active',
      isValid: !key.revokedAt && new Date() <= key.expiresAt,
    }));

    res.json(enrichedKeys);
  } catch (error) {
    logger.error('apiKeys', 'Failed to list keys', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/**
 * POST /api/api-keys
 * Generate a new API key
 * Body: { name, scope, expiresInDays?, environment?, ipWhitelist?, rateLimitPerMinute? }
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, scope, expiresInDays = 30, environment = 'development', ipWhitelist = [], rateLimitPerMinute = 60 } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Key name required' });
    }

    if (!scope || !Array.isArray(scope) || scope.length === 0) {
      return res.status(400).json({ error: 'At least one scope required' });
    }

    if (expiresInDays < 1 || expiresInDays > 365) {
      return res.status(400).json({ error: 'Expiration must be between 1 and 365 days' });
    }

    // Check rate limit: max 50 active keys per user
    const activeKeyCount = await APIKey.countDocuments({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (activeKeyCount >= 50) {
      return res.status(429).json({ error: 'Maximum 50 active keys per user' });
    }

    // Generate key
    const plainKey = APIKey.generateKey();
    const keyHash = APIKey.hashKey(plainKey);
    const keyPrefix = plainKey.substring(0, 8);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create key document
    const apiKey = new APIKey({
      userId,
      name: name.trim(),
      keyHash,
      keyPrefix,
      scope,
      expiresAt,
      environment,
      ipWhitelist: ipWhitelist || [],
      rateLimitPerMinute: Math.min(rateLimitPerMinute || 60, 10000),
    });

    await apiKey.save();

    logger.info('apiKeys', 'New API key generated', {
      userId: userId.toString(),
      keyId: apiKey._id.toString(),
      name,
      scope: scope.join(','),
    });

    // Return key only once (never stored in plaintext)
    res.status(201).json({
      key: plainKey, // ⚠️  Important: shown only once
      _id: apiKey._id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scope: apiKey.scope,
      expiresAt: apiKey.expiresAt,
      environment: apiKey.environment,
      createdAt: apiKey.createdAt,
      message: 'Save this key in a secure location. You will not be able to see it again.',
    });
  } catch (error) {
    logger.error('apiKeys', 'Failed to generate key', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Update API key (name, scope, rateLimitPerMinute, ipWhitelist)
 */
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user._id;
    const keyId = req.params.id;
    const { name, scope, rateLimitPerMinute, ipWhitelist } = req.body;

    const apiKey = await APIKey.findOne({ _id: keyId, userId });
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Update allowed fields
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      apiKey.name = name.trim();
    }

    if (scope !== undefined) {
      if (!Array.isArray(scope) || scope.length === 0) {
        return res.status(400).json({ error: 'At least one scope required' });
      }
      apiKey.scope = scope;
    }

    if (rateLimitPerMinute !== undefined) {
      if (rateLimitPerMinute < 1 || rateLimitPerMinute > 10000) {
        return res.status(400).json({ error: 'Rate limit must be between 1 and 10000' });
      }
      apiKey.rateLimitPerMinute = rateLimitPerMinute;
    }

    if (ipWhitelist !== undefined) {
      if (!Array.isArray(ipWhitelist)) {
        return res.status(400).json({ error: 'IP whitelist must be an array' });
      }
      apiKey.ipWhitelist = ipWhitelist;
    }

    await apiKey.save();

    logger.info('apiKeys', 'API key updated', {
      userId: userId.toString(),
      keyId: keyId,
    });

    res.json({
      _id: apiKey._id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scope: apiKey.scope,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      ipWhitelist: apiKey.ipWhitelist,
      updatedAt: apiKey.updatedAt,
    });
  } catch (error) {
    logger.error('apiKeys', 'Failed to update key', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Revoke (soft delete) an API key
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user._id;
    const keyId = req.params.id;

    const apiKey = await APIKey.findOne({ _id: keyId, userId });
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (apiKey.revokedAt) {
      return res.status(400).json({ error: 'Key is already revoked' });
    }

    apiKey.revokedAt = new Date();
    await apiKey.save();

    logger.info('apiKeys', 'API key revoked', {
      userId: userId.toString(),
      keyId: keyId,
    });

    res.json({
      message: 'API key revoked',
      _id: apiKey._id,
      revokedAt: apiKey.revokedAt,
    });
  } catch (error) {
    logger.error('apiKeys', 'Failed to revoke key', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

/**
 * POST /api/api-keys/:id/rotate
 * Rotate a compromised key (revoke old, generate new)
 */
router.post('/:id/rotate', async (req, res) => {
  try {
    const userId = req.user._id;
    const keyId = req.params.id;

    const oldKey = await APIKey.findOne({ _id: keyId, userId });
    if (!oldKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Revoke old key
    oldKey.revokedAt = new Date();
    await oldKey.save();

    // Generate new key with same properties
    const plainKey = APIKey.generateKey();
    const keyHash = APIKey.hashKey(plainKey);
    const keyPrefix = plainKey.substring(0, 8);

    const newKey = new APIKey({
      userId,
      name: oldKey.name + ' (rotated)',
      keyHash,
      keyPrefix,
      scope: oldKey.scope,
      expiresAt: oldKey.expiresAt,
      environment: oldKey.environment,
      ipWhitelist: oldKey.ipWhitelist,
      rateLimitPerMinute: oldKey.rateLimitPerMinute,
    });

    await newKey.save();

    logger.info('apiKeys', 'API key rotated', {
      userId: userId.toString(),
      oldKeyId: keyId,
      newKeyId: newKey._id.toString(),
    });

    res.status(201).json({
      key: plainKey, // ⚠️  Shown only once
      _id: newKey._id,
      name: newKey.name,
      keyPrefix: newKey.keyPrefix,
      scope: newKey.scope,
      expiresAt: newKey.expiresAt,
      createdAt: newKey.createdAt,
      oldKeyId: keyId,
      message: 'Save this new key. Your old key has been revoked.',
    });
  } catch (error) {
    logger.error('apiKeys', 'Failed to rotate key', error);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

/**
 * GET /api/api-keys/:id/usage
 * View usage statistics for a specific key
 */
router.get('/:id/usage', async (req, res) => {
  try {
    const userId = req.user._id;
    const keyId = req.params.id;

    const apiKey = await APIKey.findOne({ _id: keyId, userId }).lean();
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      _id: apiKey._id,
      keyPrefix: apiKey.keyPrefix,
      name: apiKey.name,
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      scope: apiKey.scope,
      status: apiKey.revokedAt ? 'revoked' : new Date() > apiKey.expiresAt ? 'expired' : 'active',
    });
  } catch (error) {
    logger.error('apiKeys', 'Failed to get key usage', error);
    res.status(500).json({ error: 'Failed to get API key usage' });
  }
});

/**
 * GET /api/api-keys/stats/aggregate
 * Get aggregate usage statistics for all user's keys
 */
router.get('/stats/aggregate', async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await APIKey.aggregate([
      {
        $match: {
          userId,
          revokedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          totalKeys: { $sum: 1 },
          totalUsage: { $sum: '$usageCount' },
          activeKeys: {
            $sum: {
              $cond: [{ $gt: ['$expiresAt', new Date()] }, 1, 0],
            },
          },
        },
      },
    ]);

    res.json(
      stats[0] || {
        totalKeys: 0,
        totalUsage: 0,
        activeKeys: 0,
      }
    );
  } catch (error) {
    logger.error('apiKeys', 'Failed to get aggregate stats', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;
