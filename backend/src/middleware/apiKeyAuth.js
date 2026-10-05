const APIKey = require('../models/apiKey');
const logger = require('../utils/logger');

/**
 * Middleware: Authenticate using API key
 * 
 * Expected header: Authorization: Bearer <api_key>
 * Or query parameter: ?api_key=<api_key>
 * 
 * Sets req.apiKey and req.user (userId) for downstream handlers
 */
function apiKeyAuth(requiredScopes = []) {
  return async (req, res, next) => {
    try {
      // Extract API key from header or query
      const authHeader = req.headers.authorization || '';
      const keyFromQuery = req.query.api_key;
      
      let apiKeyString = null;
      
      if (authHeader.startsWith('Bearer ')) {
        apiKeyString = authHeader.substring(7);
      } else if (keyFromQuery) {
        apiKeyString = keyFromQuery;
      }

      if (!apiKeyString) {
        return res.status(401).json({ error: 'API key required' });
      }

      // Hash the provided key and find it in database
      const APIKeyModel = require('../models/apiKey');
      const keyHash = APIKeyModel.hashKey(apiKeyString);
      
      const apiKey = await APIKey.findOne({ keyHash }).populate('userId');
      
      if (!apiKey) {
        logger.warn('apiKeyAuth', 'Invalid API key attempted', {
          keyPrefix: apiKeyString.substring(0, 8),
        });
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check if key is valid (not revoked, not expired)
      if (!apiKey.isValid()) {
        logger.warn('apiKeyAuth', 'Invalid/expired API key used', {
          keyId: apiKey._id.toString(),
          status: apiKey.revokedAt ? 'revoked' : 'expired',
        });
        return res.status(401).json({
          error: apiKey.revokedAt ? 'API key has been revoked' : 'API key has expired',
        });
      }

      // Check IP whitelist
      const clientIp = req.ip || req.connection.remoteAddress;
      if (!apiKey.isIpAllowed(clientIp)) {
        logger.warn('apiKeyAuth', 'API key used from unauthorized IP', {
          keyId: apiKey._id.toString(),
          ip: clientIp,
        });
        return res.status(403).json({ error: 'API key not allowed from this IP' });
      }

      // Check scopes (if required scopes specified)
      if (requiredScopes.length > 0) {
        if (!apiKey.hasScopeAny(requiredScopes)) {
          logger.warn('apiKeyAuth', 'API key lacks required scope', {
            keyId: apiKey._id.toString(),
            requiredScopes,
            keyScopes: apiKey.scope,
          });
          return res.status(403).json({
            error: 'API key does not have required scope',
            required: requiredScopes,
            available: apiKey.scope,
          });
        }
      }

      // Update last used timestamp and increment usage counter
      apiKey.lastUsedAt = new Date();
      apiKey.usageCount = (apiKey.usageCount || 0) + 1;
      await apiKey.save().catch((err) => {
        logger.error('apiKeyAuth', 'Failed to update key usage', err);
        // Don't fail the request if we can't update stats
      });

      // Set auth context for downstream handlers
      req.apiKey = apiKey;
      req.user = {
        _id: apiKey.userId._id || apiKey.userId,
      };

      logger.debug('apiKeyAuth', 'API key authenticated', {
        keyId: apiKey._id.toString(),
        userId: req.user._id.toString(),
        scope: apiKey.scope.join(','),
      });

      next();
    } catch (error) {
      logger.error('apiKeyAuth', 'API key authentication error', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
}

/**
 * Middleware: Require specific scope(s)
 * Usage: app.get('/endpoint', requireScope(['read:wallet']), handler)
 */
function requireScope(requiredScopes) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'API key authentication required' });
    }

    if (!req.apiKey.hasScopeAny(requiredScopes)) {
      return res.status(403).json({
        error: 'Insufficient scope',
        required: requiredScopes,
        available: req.apiKey.scope,
      });
    }

    next();
  };
}

/**
 * Middleware: Rate limiting per API key
 * Uses in-memory tracking (for production, use Redis)
 */
const keyRateLimits = new Map(); // key -> { count, resetAt }

function rateLimit() {
  return (req, res, next) => {
    if (!req.apiKey) return next();

    const keyId = req.apiKey._id.toString();
    const now = Date.now();
    const limit = req.apiKey.rateLimitPerMinute || 60;

    let record = keyRateLimits.get(keyId);

    if (!record || now > record.resetAt) {
      // New window
      record = {
        count: 0,
        resetAt: now + 60000, // 1 minute
      };
      keyRateLimits.set(keyId, record);
    }

    record.count++;

    if (record.count > limit) {
      logger.warn('apiKeyAuth', 'API key rate limit exceeded', {
        keyId,
        limit,
        current: record.count,
      });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit,
        resetIn: Math.ceil((record.resetAt - now) / 1000) + 's',
      });
    }

    // Add rate limit info to response headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - record.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    next();
  };
}

/**
 * Cleanup old rate limit records (runs every 5 minutes)
 */
setInterval(() => {
  const now = Date.now();
  for (const [keyId, record] of keyRateLimits.entries()) {
    if (now > record.resetAt) {
      keyRateLimits.delete(keyId);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  apiKeyAuth,
  requireScope,
  rateLimit,
};
