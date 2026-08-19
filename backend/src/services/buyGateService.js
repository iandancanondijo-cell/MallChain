const EconomyState = require('../models/EconomyState');
const liquidityController = require('../controllers/liquidityController');
const logger = require('../utils/logger');

// Once the MLCN/KES pool (id 2) has accumulated this much KES on its KES
// side (reserve1), direct fiat buying is permanently disabled. From then on
// users can only acquire MLCNS by converting Mallpoints or receiving a
// peer-to-peer send.
const DIRECT_BUY_LOCK_THRESHOLD_KES = 500000;

const CACHE_TTL_MS = 3000;
let cache = null; // { locked, fetchedAt }

function invalidateCache() {
  cache = null;
}

/**
 * Returns { locked, reserveKes, thresholdKes }. Once locked, stays locked
 * forever (durable Mongo flag) regardless of what the pool does afterward.
 * Fails open (not locked) if either the DB read or the chain read fails, so
 * a transient outage doesn't itself take down the whole buy flow.
 */
async function getBuyGateStatus() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.status;
  }

  let status;
  try {
    const existing = await EconomyState.findById('singleton').lean();
    if (existing?.directBuyLocked) {
      status = { locked: true, reserveKes: existing.poolKesReserveAtLock, thresholdKes: DIRECT_BUY_LOCK_THRESHOLD_KES };
    } else {
      const pools = await liquidityController.fetchPoolsFromBlockchain();
      const kesPool = pools.find((p) => p.id === 2);
      const reserveKes = kesPool?.reserve1 || 0;

      if (reserveKes >= DIRECT_BUY_LOCK_THRESHOLD_KES) {
        await EconomyState.findByIdAndUpdate(
          'singleton',
          {
            $set: {
              directBuyLocked: true,
              directBuyLockedAt: new Date(),
              poolKesReserveAtLock: reserveKes,
            },
          },
          { upsert: true }
        );
        logger.warn('Direct MLCNS buying permanently locked: pool reached KES threshold', {
          reserveKes,
          thresholdKes: DIRECT_BUY_LOCK_THRESHOLD_KES,
        });
        status = { locked: true, reserveKes, thresholdKes: DIRECT_BUY_LOCK_THRESHOLD_KES };
      } else {
        status = { locked: false, reserveKes, thresholdKes: DIRECT_BUY_LOCK_THRESHOLD_KES };
      }
    }
  } catch (err) {
    logger.warn('buyGateService status check failed; failing open', { error: err.message });
    status = { locked: false, reserveKes: null, thresholdKes: DIRECT_BUY_LOCK_THRESHOLD_KES, error: true };
  }

  cache = { status, fetchedAt: Date.now() };
  return status;
}

/**
 * Express middleware for routes that start a direct fiat buy. Rejects with
 * 403 once the gate is permanently locked.
 */
function requireDirectBuyUnlocked() {
  return async function directBuyGateMiddleware(req, res, next) {
    const status = await getBuyGateStatus();
    if (status.locked) {
      return res.status(403).json({
        ok: false,
        error: 'Direct MLCNS purchases are closed — the liquidity pool has reached its KES threshold. Acquire MLCNS by converting Mallpoints or receiving a transfer instead.',
        code: 'direct_buy_locked',
        thresholdKes: status.thresholdKes,
      });
    }
    return next();
  };
}

module.exports = { getBuyGateStatus, requireDirectBuyUnlocked, invalidateCache, DIRECT_BUY_LOCK_THRESHOLD_KES };
