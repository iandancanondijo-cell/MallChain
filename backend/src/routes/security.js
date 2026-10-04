const express = require('express');
const router = express.Router();
const { rotationManager, ROTATION_POLICIES } = require('../utils/secretRotation');
const { requireAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

router.get('/rotation/status', requireAdmin, (req, res) => {
  const status = rotationManager.getStatus();
  const schedule = rotationManager.getSchedule();

  res.json({
    policies: ROTATION_POLICIES,
    schedule,
    secrets: status,
  });
});

router.post('/rotation/rotate/:type', requireAdmin, async (req, res) => {
  const { type } = req.params;

  if (!ROTATION_POLICIES[type]) {
    return res.status(400).json({
      error: 'unknown_secret_type',
      validTypes: Object.keys(ROTATION_POLICIES),
    });
  }

  try {
    logger.warn('security', 'Manual secret rotation triggered', {
      type,
      adminId: req.user?._id || req.user?.id,
    });

    const newSecret = await rotationManager.forceRotate(type);

    res.json({
      success: true,
      type,
      message: `Secret rotated successfully`,
      newSecretPrefix: newSecret.slice(0, 8) + '...',
    });
  } catch (err) {
    logger.error('security', 'Manual secret rotation failed', err, { type });
    res.status(500).json({ error: 'rotation_failed', message: err.message });
  }
});

router.get('/rotation/schedule', requireAdmin, (req, res) => {
  res.json(rotationManager.getSchedule());
});

module.exports = router;
