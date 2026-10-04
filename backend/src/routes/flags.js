/**
 * Feature Flags API Routes
 * Expose feature flags to frontend and admin management endpoints
 */

const express = require('express');
const router = express.Router();
const { flagManager, FLAG_DEFINITIONS } = require('../utils/featureFlags');
const { getVersionInfo, CURRENT_VERSION } = require('../middleware/apiVersioning');
const { requireAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * GET /api/flags
 * Get all feature flags for current user context
 * Public endpoint - frontend needs this to configure UI
 */
router.get('/', async (req, res) => {
  try {
    // Build context from request (user, role, etc.)
    const context = {
      userId: req.user?._id || req.user?.id,
      role: req.user?.role,
    };

    const flags = await flagManager.getAllFlags(context);
    res.json({ flags });
  } catch (err) {
    logger.error('Failed to get feature flags', err);
    res.status(500).json({ error: 'failed_to_load_flags' });
  }
});

/**
 * GET /api/flags/:flagName
 * Get specific flag value
 */
router.get('/:flagName', async (req, res) => {
  try {
    const { flagName } = req.params;
    const context = {
      userId: req.user?._id || req.user?.id,
      role: req.user?.role,
    };

    const value = await flagManager.getFlag(flagName, context);
    const definition = flagManager.getFlagDefinition(flagName);

    if (!definition) {
      return res.status(404).json({ error: 'flag_not_found' });
    }

    res.json({
      name: flagName,
      value,
      definition,
    });
  } catch (err) {
    logger.error('Failed to get feature flag', err);
    res.status(500).json({ error: 'failed_to_load_flag' });
  }
});

/**
 * GET /api/flags/definitions/all
 * Get all flag definitions (admin only)
 */
router.get('/definitions/all', requireAdmin, (req, res) => {
  res.json({ definitions: FLAG_DEFINITIONS });
});

/**
 * POST /api/flags/cache/clear
 * Clear feature flag cache (admin only)
 */
router.post('/cache/clear', requireAdmin, (req, res) => {
  flagManager.clearCache();
  logger.info('Feature flag cache cleared by admin', { adminId: req.user?._id || req.user?.id });
  res.json({ success: true, message: 'Cache cleared' });
});

/**
 * GET /api/version
 * Get API version information
 */
router.get('/version', (req, res) => {
  const versionInfo = getVersionInfo();
  res.json({
    current: CURRENT_VERSION,
    ...versionInfo,
  });
});

module.exports = router;
