const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Notification = require('../models/Notification');
const { dispatchNotification } = require('../services/notificationDispatcher');
const logger = require('../utils/logger');

router.use(requireAuth());

/**
 * GET /api/notifications
 * List user's notifications with pagination.
 * Query params: limit (default 20), offset (default 0), unreadOnly (boolean)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    const query = { userId, archived: false };
    if (unreadOnly) query.read = false;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
    ]);

    const unreadCount = await Notification.countDocuments({ userId, read: false, archived: false });

    res.json({
      notifications,
      total,
      unreadCount,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('notifications', 'Failed to list notifications', error);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications.
 */
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ userId, read: false, archived: false });
    res.json({ count });
  } catch (error) {
    logger.error('notifications', 'Failed to get unread count', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read.
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    logger.error('notifications', 'Failed to mark notification as read', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read.
 */
router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );

    logger.info('notifications', 'Marked all as read', {
      userId: userId.toString(),
      count: result.modifiedCount,
    });

    res.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    logger.error('notifications', 'Failed to mark all as read', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete (archive) a notification.
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { archived: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('notifications', 'Failed to delete notification', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * POST /api/notifications/test
 * Send a test notification to the current user.
 */
router.post('/test', async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await dispatchNotification(userId, 'system', {
      title: 'Test Notification',
      message: 'This is a test notification from Mallchain. If you received this, your notification settings are working correctly.',
      data: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });

    res.json(result);
  } catch (error) {
    logger.error('notifications', 'Failed to send test notification', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
