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

      // Create pending idempotency record. The unique index on `key` is
      // what actually enforces idempotency under concurrent requests —
      // the findOne above is just an optimization to avoid the insert
      // attempt in the common case.
      try {
        await IdempotencyKey.create({
          key: idempotencyKey,
          walletAddress: req.body?.walletAddress || req.body?.userId || 'unknown',
          // Different money-moving routes name their amount field
          // differently (e.g. withdraw/mpesa uses amountMlcns, not amount)
          // — this record is audit/monitoring metadata only (dedup itself
          // is keyed on `key`), but it should still reflect the real size.
          amount: req.body?.amount ?? req.body?.amountMlcns ?? req.body?.amountKes ?? 0,
          status: 'pending',
          result: null,
        });
      } catch (createError) {
        if (createError?.code === 11000) {
          // Lost the race: another request with the same key is already
          // in flight or completed. Do NOT fall through to next() here —
          // that would let both requests execute the underlying
          // (possibly money-moving) operation. Return the same responses
          // the pre-existing-key branch above would have.
          logger.info('Idempotency key race detected, blocking duplicate', { key: idempotencyKey });
          const existingAfterRace = await IdempotencyKey.findOne({ key: idempotencyKey }).lean();
          if (existingAfterRace?.status === 'success') {
            return res.status(200).json({
              ok: true,
              data: existingAfterRace.result,
              idempotent: true,
            });
          } else if (existingAfterRace?.status === 'failed') {
            return res.status(400).json({
              ok: false,
              error: existingAfterRace.error || 'Previous request failed',
              idempotent: true,
            });
          }
          return res.status(202).json({
            ok: false,
            error: 'Request still processing',
            idempotent: true,
          });
        }
        throw createError;
      }

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
