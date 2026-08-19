const MaintenanceMode = require('../models/MaintenanceMode');
const logger = require('../utils/logger');

const CACHE_TTL_MS = 3000;
let cache = null; // { doc, fetchedAt }

// Called by the admin toggle endpoint right after a write so a pause takes
// effect on the very next request instead of waiting out the cache TTL.
function invalidateCache() {
  cache = null;
}

async function getState() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.doc;
  }
  const doc = await MaintenanceMode.findById('singleton').lean();
  cache = { doc, fetchedAt: Date.now() };
  return doc;
}

/**
 * Emergency pause for money-moving routes. Checked before the request
 * reaches its real handler; fails open (allows the request, logs a
 * warning) if the state can't be read, so a transient Mongo blip doesn't
 * itself become an outage for every send/withdraw/buy call.
 */
function maintenanceGuard(scope) {
  return async function maintenanceGuardMiddleware(req, res, next) {
    try {
      const state = await getState();
      if (!state) return next();

      if (state.global) {
        return res.status(503).json({
          ok: false,
          error: 'maintenance_mode',
          message: state.reason || 'This operation is temporarily paused for maintenance.',
        });
      }

      const scopePaused = state.scopes && state.scopes[scope];
      if (scopePaused) {
        return res.status(503).json({
          ok: false,
          error: 'maintenance_mode',
          scope,
          message: state.reason || `${scope} is temporarily paused for maintenance.`,
        });
      }

      return next();
    } catch (err) {
      logger.warn('maintenanceGuard check failed; failing open', { scope, error: err.message });
      return next();
    }
  };
}

module.exports = { maintenanceGuard, invalidateCache };
