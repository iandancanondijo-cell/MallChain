const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { devhubKeyAuth } = require('../middleware/devhubKey');
const explorer = require('../services/explorerService');
const mallcoinService = require('../services/mallcoinService');
const stakingService = require('../services/stakingService');
const User = require('../models/user');
const { respondFailure } = require('../utils/respondFailure');

/**
 * The developer API a DevHub `mk_…` key actually unlocks.
 *
 * Before this existed the keys were decorative: POST /api/devhub/test was the
 * only route that ever looked at one, so a developer could create a key, copy
 * it, and be rejected by every endpoint they tried. These routes are read-only
 * chain queries backed by the same services the app itself uses, authenticated
 * by the key, rate-limited per key, and counted in the key's `used` field.
 *
 * Mounted at /api/devhub/v1 by routes/devhub.js.
 */

const guard = devhubKeyAuth();

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('devhubApi', 'Developer API error', { error: err.message || err });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

/** Services throw {status, message} for bad input and unreachable chains. */
function sendError(res, e) {
  const code = e.status || (e.code === 'STAKING_DATA_UNAVAILABLE' ? 503 : 502);
  res.status(code).json({ ok: false, error: e.message || 'The chain query failed', code: e.code });
}

function addressParam(req, res) {
  const address = String(req.params.address || '');
  if (!mallcoinService.isValidAddress(address)) {
    res.status(400).json(fail('Not a valid Mallchain address'));
    return null;
  }
  return address;
}

router.use(guard);

// GET /api/devhub/v1/whoami - what this key is and what it has cost so far
router.get('/whoami', async (req, res) => {
  try {
    const key = req.devhubKey;
    const owner = await User.findById(key.userId).select('name username').lean();
    res.json(ok({
      keyId: String(key._id),
      keyName: key.name,
      permissions: key.permissions,
      used: key.used || 0,
      lastUsed: key.lastUsed,
      created: key.created,
      owner: owner ? (owner.username || owner.name || 'A Mallchain member') : null,
      rateLimitPerMinute: Number(res.getHeader('X-RateLimit-Limit')) || 120,
    }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/devhub/v1/status - chain head, straight from the node's RPC
router.get('/status', async (_req, res) => {
  try {
    res.json(ok(await explorer.getLatest()));
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/devhub/v1/blocks?limit=20 - newest blocks, capped at 50 by the service
router.get('/blocks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    res.json(ok({ blocks: await explorer.getRecentBlocks(limit), limit }));
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/devhub/v1/blocks/:height
router.get('/blocks/:height', async (req, res) => {
  try {
    const result = await explorer.getBlock(req.params.height);
    res.json(ok({ ...result.block, source: result.source }));
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/devhub/v1/tx/:hash
router.get('/tx/:hash', async (req, res) => {
  try {
    const result = await explorer.getTransaction(req.params.hash);
    res.json(ok({ ...result.transaction, source: result.source }));
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/devhub/v1/wallet/:address - base units and display amounts
router.get('/wallet/:address', async (req, res) => {
  const address = addressParam(req, res);
  if (!address) return;
  try {
    res.json(ok(await mallcoinService.getWalletBalance(address)));
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/devhub/v1/staking/:address - the chain's MLCNS reward-pool staking
router.get('/staking/:address', async (req, res) => {
  const address = addressParam(req, res);
  if (!address) return;
  try {
    res.json(ok(await stakingService.getStakingSummary(address)));
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;