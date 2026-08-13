const IdempotencyKey = require('../models/IdempotencyKey');
const logger = require('../utils/logger');

/**
 * Idempotency middleware for POST/PUT requests
 * Requires client to provide an Idempotency-Key header
 * Returns cached response if key exists, otherwise processes and caches
 */
function idempotency(options = {}) {
  const { keyHeader = 'Idempotency-Key', ttl = 86400 } = options;

  return async (req, res, next) => {
    // Only apply to POST/PUT/PATCH requests
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers[keyHeader.toLowerCase()];

    if (!idempotencyKey) {
      // Optional: require idempotency key for certain endpoints
      if (options.required) {
        return res.status(400).json({
          ok: false,
          error: `Missing ${keyHeader} header`,
        });
      }
      return next();
    }

    try {
      // Check if key already exists
      const existing = await IdempotencyKey.findOne({ key: idempotencyKey }).lean();

      if (existing) {
        // Return cached response
        logger.info('Idempotency key hit', { key: idempotencyKey, status: existing.status });

        if (existing.status === 'success') {
          return res.status(200).json({
            ok: true,
            data: existing.result,
            idempotent: true,
          });
        } else if (existing.status === 'failed') {
          return res.status(400).json({
            ok: false,
            error: existing.error || 'Previous request failed',
            idempotent: true,
          });
        } else {
          // Pending - return 202 to indicate processing
          return res.status(202).json({
            ok: false,
            error: 'Request still processing',
            idempotent: true,
          });
        }
      }

      // Create pending idempotency record
      await IdempotencyKey.create({
        key: idempotencyKey,
        walletAddress: req.body?.walletAddress || req.body?.userId || 'unknown',
        amount: req.body?.amount || 0,
        status: 'pending',
        result: null,
      });

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);

      res.json = function (data) {
        // Update idempotency record with result
        IdempotencyKey.findOneAndUpdate(
          { key: idempotencyKey },
          {
            status: data.ok ? 'success' : 'failed',
            result: data.ok ? data : null,
            error: !data.ok ? data.error : null,
          },
          { new: true }
        ).catch(err => {
          logger.error('Failed to update idempotency record', { error: err.message, key: idempotencyKey });
        });

        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Idempotency middleware error', { error: error.message, key: idempotencyKey });
      // Continue processing even if idempotency check fails
      next();
    }
  };
}

module.exports = idempotency;
