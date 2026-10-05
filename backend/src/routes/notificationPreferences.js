const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const NotificationPreferences = require('../models/notificationPreferences');
const logger = require('../utils/logger');

// Middleware: require JWT auth
router.use(requireAuth());

/**
 * GET /api/notification-preferences
 * Get user's notification preferences
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    let prefs = await NotificationPreferences.findOne({ userId }).lean();

    if (!prefs) {
      // Create default preferences if not exists
      prefs = new NotificationPreferences({ userId });
      await prefs.save();
      prefs = prefs.toObject();
    }

    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to get preferences', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * PATCH /api/notification-preferences/frequency
 * Update notification frequency settings
 */
router.patch('/frequency', async (req, res) => {
  try {
    const userId = req.user._id;
    const { frequency } = req.body;

    if (!frequency) {
      return res.status(400).json({ error: 'Frequency object required' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { frequency },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Frequency updated', { userId: userId.toString() });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to update frequency', error);
    res.status(500).json({ error: 'Failed to update frequency' });
  }
});

/**
 * PATCH /api/notification-preferences/do-not-disturb
 * Update do-not-disturb settings
 */
router.patch('/do-not-disturb', async (req, res) => {
  try {
    const userId = req.user._id;
    const { doNotDisturb } = req.body;

    if (!doNotDisturb) {
      return res.status(400).json({ error: 'Do not disturb object required' });
    }

    // Validate time format HH:MM
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (doNotDisturb.enabled && (!timeRegex.test(doNotDisturb.startTime) || !timeRegex.test(doNotDisturb.endTime))) {
      return res.status(400).json({ error: 'Invalid time format (use HH:MM)' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { doNotDisturb },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Do not disturb updated', { userId: userId.toString() });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to update do not disturb', error);
    res.status(500).json({ error: 'Failed to update do not disturb' });
  }
});

/**
 * PATCH /api/notification-preferences/channels
 * Update notification channel preferences
 */
router.patch('/channels', async (req, res) => {
  try {
    const userId = req.user._id;
    const { channels } = req.body;

    if (!channels) {
      return res.status(400).json({ error: 'Channels object required' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { channels },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Channels updated', { userId: userId.toString() });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to update channels', error);
    res.status(500).json({ error: 'Failed to update channels' });
  }
});

/**
 * PATCH /api/notification-preferences/global-toggle
 * Toggle all notifications on/off
 */
router.patch('/global-toggle', async (req, res) => {
  try {
    const userId = req.user._id;
    const { enableNotifications } = req.body;

    if (typeof enableNotifications !== 'boolean') {
      return res.status(400).json({ error: 'Boolean value required' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { enableNotifications },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Global toggle updated', {
      userId: userId.toString(),
      enableNotifications,
    });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to update global toggle', error);
    res.status(500).json({ error: 'Failed to update global toggle' });
  }
});

/**
 * POST /api/notification-preferences/unsubscribe
 * Unsubscribe from a notification category
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const userId = req.user._id;
    const { category } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category required' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { $addToSet: { unsubscribedCategories: category } },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Unsubscribed from category', {
      userId: userId.toString(),
      category,
    });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to unsubscribe', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * POST /api/notification-preferences/resubscribe
 * Resubscribe to a notification category
 */
router.post('/resubscribe', async (req, res) => {
  try {
    const userId = req.user._id;
    const { category } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category required' });
    }

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { userId },
      { $pull: { unsubscribedCategories: category } },
      { new: true, upsert: true }
    );

    logger.info('notificationPreferences', 'Resubscribed to category', {
      userId: userId.toString(),
      category,
    });
    res.json(prefs);
  } catch (error) {
    logger.error('notificationPreferences', 'Failed to resubscribe', error);
    res.status(500).json({ error: 'Failed to resubscribe' });
  }
});

module.exports = router;
