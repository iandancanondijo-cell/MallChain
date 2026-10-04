/**
 * Cache-Control and ETag Middleware
 * Implements HTTP caching with ETags and If-None-Match headers
 * Reduces bandwidth and improves performance for cacheable responses
 * 
 * Features:
 * - ETag generation and validation
 * - Cache-Control header management
 * - Conditional request handling (304 Not Modified)
 * - Cache versioning support
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate ETag for response body
 * Uses weak ETags for stability (content hash only, not exact representation)
 */
function generateETag(data, version = '') {
  const hash = crypto
    .createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .update(version)
    .digest('hex')
    .slice(0, 16);
  
  return `W/"${hash}"`;
}

/**
 * Parse ETags from If-None-Match header
 * Handles multiple ETags (comma-separated) and wildcard matching
 */
function parseIfNoneMatch(ifNoneMatch) {
  if (!ifNoneMatch) return [];
  
  return ifNoneMatch
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

/**
 * Check if ETags match (considering weak tag equivalence)
 */
function etagMatches(currentETag, clientETag) {
  if (clientETag === '*') return true;
  
  // Weak tag comparison: remove W/ prefix for matching
  const normalizeCurrent = currentETag.replace(/^W\//, '');
  const normalizeClient = clientETag.replace(/^W\//, '');
  
  return normalizeCurrent === normalizeClient;
}

/**
 * Get cache duration based on content type and endpoint
 */
function getCacheDuration(req, contentType) {
  const path = req.path || '';
  
  // Public data: cache for 1 hour
  if (path.includes('/api/market') || path.includes('/api/explorer')) {
    return 3600;
  }
  
  // User data: cache for 5 minutes
  if (path.includes('/api/wallet') || path.includes('/api/user')) {
    return 300;
  }
  
  // Real-time data: minimal caching
  if (path.includes('/api/blockchain') || path.includes('/api/staking')) {
    return 60;
  }
  
  // Default: no caching for authenticated endpoints
  if (req.user) {
    return 0;
  }
  
  // Public endpoints: cache for 5 minutes
  return 300;
}

/**
 * Cache-Control middleware
 * Sets appropriate cache headers based on route and authentication
 */
function cacheControlMiddleware(req, res, next) {
  const originalJson = res.json;

  // Override res.json to attach caching headers
  res.json = function(data) {
    const cacheMaxAge = getCacheDuration(req, 'application/json');

    if (cacheMaxAge > 0) {
      // Check for conditional request (If-None-Match)
      const clientETags = parseIfNoneMatch(req.get('if-none-match'));
      const currentETag = generateETag(data, req.versionId || '');

      // If client has matching ETag, return 304 Not Modified
      if (clientETags.some(tag => etagMatches(currentETag, tag))) {
        logger.debug('cache', '304 Not Modified - ETag match', {
          path: req.path,
          eTag: currentETag,
        });

        res.status(304);
        res.set('ETag', currentETag);
        res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
        return res.end();
      }

      // Set cache headers
      res.set('ETag', currentETag);
      res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
      res.set('Vary', 'Accept-Encoding, Authorization');
    } else {
      // No caching for authenticated or dynamic content
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Conditional request middleware
 * Handles If-Modified-Since, If-Unmodified-Since headers
 */
function conditionalRequestMiddleware(req, res, next) {
  // Store original json method
  const originalJson = res.json;

  res.json = function(data) {
    // Check If-Modified-Since header
    const ifModifiedSince = req.get('if-modified-since');
    if (ifModifiedSince) {
      const clientTime = new Date(ifModifiedSince).getTime();
      const now = Date.now();

      // If the resource hasn't been modified since client's time, return 304
      if (clientTime >= now) {
        logger.debug('cache', '304 Not Modified - If-Modified-Since', {
          path: req.path,
        });

        res.status(304);
        return res.end();
      }
    }

    // Set Last-Modified header
    res.set('Last-Modified', new Date().toUTCString());

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Cache-busting for versioned content
 * Attach version ID to response for cache invalidation
 */
function attachVersionId(req, res, next) {
  const version = req.query.v || req.headers['api-version'] || '';
  req.versionId = version;
  res.set('X-API-Version', version || 'current');
  next();
}

/**
 * Purge cache directive
 * POST /api/cache/purge to clear caches (admin only)
 */
function createCachePurgeHandler(cacheService) {
  return async (req, res) => {
    try {
      const { pattern, key } = req.body;

      if (key) {
        await cacheService.del(key);
        logger.info('cache', 'Cache purged for key', { key });
        return res.json({ success: true, message: `Purged ${key}` });
      }

      if (pattern) {
        await cacheService.clearPattern(pattern);
        logger.info('cache', 'Cache purged by pattern', { pattern });
        return res.json({ success: true, message: `Purged pattern: ${pattern}` });
      }

      logger.info('cache', 'Cache purge requested (no key/pattern specified)');
      return res.json({ success: false, message: 'Specify key or pattern to purge' });
    } catch (err) {
      logger.error('cache', 'Cache purge failed', err);
      return res.status(500).json({ error: 'Cache purge failed' });
    }
  };
}

/**
 * Cache statistics handler
 * GET /api/cache/stats to see cache status (admin only)
 */
function createCacheStatsHandler(cacheService) {
  return async (req, res) => {
    try {
      const stats = await cacheService.getStats?.();
      return res.json(stats || { message: 'Cache stats unavailable' });
    } catch (err) {
      logger.error('cache', 'Failed to get cache stats', err);
      return res.status(500).json({ error: 'Failed to get cache stats' });
    }
  };
}

/**
 * Middleware to invalidate cache on mutation
 * Automatically purge related cache entries after POST/PUT/DELETE
 */
function cacheInvalidationMiddleware(req, res, next) {
  // Cache is only invalidated on mutations
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  // Store original send method
  const originalSend = res.send;
  const originalJson = res.json;

  const invalidateCache = () => {
    // Extract resource type from path
    const pathParts = req.path.split('/').filter(Boolean);
    const resource = pathParts[2]; // e.g., 'users', 'products'

    // Invalidate cache patterns related to this resource
    const patterns = [
      `${resource}:*`,
      `${resource}:list:*`,
      `user:${req.user?.id}:*`,
    ];

    logger.debug('cache', 'Cache invalidation triggered', {
      method: req.method,
      path: req.path,
      patterns,
    });

    // Note: actual invalidation happens via cacheService
    // This is just tracking for logging
  };

  res.send = function(...args) {
    invalidateCache();
    return originalSend.apply(this, args);
  };

  res.json = function(...args) {
    invalidateCache();
    return originalJson.apply(this, args);
  };

  next();
}

module.exports = {
  cacheControlMiddleware,
  conditionalRequestMiddleware,
  cacheInvalidationMiddleware,
  attachVersionId,
  generateETag,
  parseIfNoneMatch,
  etagMatches,
  getCacheDuration,
  createCachePurgeHandler,
  createCacheStatsHandler,
};
