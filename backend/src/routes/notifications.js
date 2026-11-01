const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Notification = require('../models/Notification');
const { dispatchNotification } = require('../services/notificationDispatcher');
const logger = require('../utils/logger');

router.use(requireAuth());

// Frontend preference keys are plural (transactions, badgeAlerts, campaigns)
// but the Notification schema's `type` enum is singular. Map here so the
// dispatcher persists a valid row; the dispatcher also normalizes
// defensively (services/notificationDispatcher.js toNotificationType).
const CATEGORY_TO_NOTIF_TYPE = {
  transactions: 'transaction',
  transaction: 'transaction',
  campaigns: 'campaign',
  campaign: 'campaign',
  badgeAlerts: 'badge',
  badge: 'badge',
  governance: 'governance',
  security: 'security',
  marketing: 'marketing',
  system: 'system',
};

function resolveNotifType(category, kind) {
  if (category && CATEGORY_TO_NOTIF_TYPE[category]) return CATEGORY_TO_NOTIF_TYPE[category];
  if (kind && CATEGORY_TO_NOTIF_TYPE[kind]) return CATEGORY_TO_NOTIF_TYPE[kind];
  return 'system';
}

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
 * GET /api/notifications/providers
 * Which outbound notification providers are configured — never exposes
 * keys. Consumed by notificationsApi.getProviderStatus() (frontend) and
 * the admin Platform window.
 */
router.get('/providers', (_req, res) => {
  const emailConfigured = !!process.env.BREVO_API_KEY;
  res.json({
    email: { provider: 'brevo', configured: emailConfigured },
    sms: { provider: 'brevo', configured: false },
    whatsapp: { provider: 'not_configured', configured: false },
    push: { provider: 'not_configured', configured: false },
  });
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
 * POST /api/notifications/send
 * Dispatch a notification to the current user through their configured
 * channels (dispatcher honors preferences, DND, and writes the in-app
 * Notification row + socket push). This is the endpoint
 * notificationsApi.send() in the frontend has always targeted — it was
 * missing here, so every in-app notification raised client-side 404'd.
 */
router.post('/send', async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, body, message, kind, category } = req.body || {};
    if (!title || !(body || message)) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const validCategories = ['transactions', 'campaigns', 'governance', 'security', 'marketing', 'badgeAlerts'];
    // Plural preference keys (and unknown ones) are normalized to the
    // Notification `type` enum; an unknown `kind` falls back to 'system'
    // rather than crashing the row insert downstream.
    const preferred = validCategories.includes(category) ? category : (category || kind);
    const notifCategory = resolveNotifType(preferred, kind);

    const result = await dispatchNotification(userId, notifCategory, {
      title,
      message: body || message,
      data: req.body?.metadata || undefined,
    });

    if (!result.success) {
      return res.status(200).json({ ok: false, skipped: true, reason: result.error });
    }
    res.json({ ok: true, notificationId: result.notificationId, channels: result.channels, deliveryStatus: result.deliveryStatus });
  } catch (error) {
    logger.error('notifications', 'Failed to send notification', error);
    res.status(500).json({ error: 'Failed to send notification' });
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
