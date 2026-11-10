const ApiKey = require('../models/devhubApiKey');
const logger = require('../utils/logger');

/**
 * Authenticates a DevHub developer key (models/devhubApiKey.js, the `mk_…`
 * keys the Developer Hub issues) and records real usage.
 *
 * Distinct from middleware/apiKeyAuth.js, which guards server-to-server admin
 * keys in a different collection with hashed secrets, scopes and IP allowlists.
 * A DevHub key belongs to one user and grants exactly one thing: `read` on the
 * developer API at /api/devhub/v1. Nothing here accepts a query-string key —
 * query strings land in access logs and browser history.
 *
 * Sets req.user to the key's owner so the v1 handlers can scope per-user reads,
 * and req.devhubKey to the key document.
 */

const PERMISSION = 'read';
const WINDOW_MS = 60 * 1000;
const DEFAULT_PER_MINUTE = 120;

/** keyId -> { count, resetAt }. Pruned lazily so no extra timer is needed. */
const windows = new Map();

function takeHit(keyId, limit) {
  const now = Date.now();
  if (windows.size > 5000) {
    for (const [id, w] of windows) if (now > w.resetAt) windows.delete(id);
  }
  let w = windows.get(keyId);
  if (!w || now > w.resetAt) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(keyId, w);
  }
  w.count += 1;
  return { remaining: Math.max(0, limit - w.count), resetAt: w.resetAt, exceeded: w.count > limit };
}

function devhubKeyAuth(opts = {}) {
  const limit = Number(opts.perMinute) > 0 ? Number(opts.perMinute) : DEFAULT_PER_MINUTE;

  return async (req, res, next) => {
    try {
      const key = req.headers['x-api-key'];
      if (typeof key !== 'string' || !key.trim()) {
        return res.status(401).json({ ok: false, error: 'x-api-key header is required' });
      }
      if (key.length > 200) {
        return res.status(401).json({ ok: false, error: 'Invalid API key' });
      }

      const apiKey = await ApiKey.findOne({ key: key.trim(), revoked: false }).lean();
      if (!apiKey) {
        logger.warn('devhubKeyAuth', 'Unknown or revoked developer key presented', { prefix: key.slice(0, 6) });
        return res.status(401).json({ ok: false, error: 'Invalid or revoked API key' });
      }

      const permissions = Array.isArray(apiKey.permissions) ? apiKey.permissions : [];
      if (!permissions.includes(PERMISSION)) {
        return res.status(403).json({ ok: false, error: `This key does not grant ${PERMISSION}` });
      }

      const id = String(apiKey._id);
      const hit = takeHit(id, limit);
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(hit.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(hit.resetAt / 1000)));
      if (hit.exceeded) {
        res.setHeader('Retry-After', String(Math.ceil((hit.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ ok: false, error: 'Rate limit exceeded for this API key' });
      }

      // Usage is the product: a developer must be able to see their own call
      // count move. A failed write here must not fail an otherwise valid read.
      const updated = await ApiKey.findOneAndUpdate(
        { _id: apiKey._id, revoked: false },
        { $inc: { used: 1 }, $set: { lastUsed: new Date() } },
        { new: true }
      ).lean().catch((e) => {
        logger.error('devhubKeyAuth', 'Could not record key usage', { error: e.message });
        return null;
      });

      req.devhubKey = updated || apiKey;
      req.user = { _id: apiKey.userId };
      next();
    } catch (e) {
      logger.error('devhubKeyAuth', 'Developer key authentication error', { error: e.message });
      res.status(503).json({ ok: false, error: 'API key check is unavailable right now' });
    }
  };
}

module.exports = { devhubKeyAuth, DEVHUB_PERMISSION: PERMISSION };