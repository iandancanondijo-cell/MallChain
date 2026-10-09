const Notification = require('../models/Notification');
const User = require('../models/user');
const logger = require('../utils/logger');

// GET /api/notifications/me — list the authenticated user's notifications.
exports.list = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/notifications/read/:id — mark one notification as read.
exports.markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'notification not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/notifications/read-all — mark every notification as read.
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/notifications/providers — which channel/provider is active and
 * whether it's actually configured, per channel. Read-only and secret-free:
 * reports the selected provider name and a boolean, never the API keys. Lets
 * the settings UI show "Email: SendGrid (ready)" vs "SMS: Twilio (not set up)"
 * so a user understands why a channel is (or isn't) delivering.
 */
exports.providers = async (req, res) => {
  try {
    const { config } = require('../config');
    const emailService = require('../services/emailService');
    const smsService = require('../services/smsService');
    const whatsappService = require('../services/whatsappService');

    res.json({
      email: {
        provider: config.notifications.email.provider,
        configured: emailService.isConfigured(),
      },
      sms: {
        provider: config.notifications.sms.provider,
        configured: smsService.isConfigured(),
      },
      whatsapp: {
        provider: config.notifications.whatsapp.provider,
        configured: whatsappService.isConfigured(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/notifications/test — send a one-off test notification to the
 * caller across the channels they actually have a destination for, so they
 * can confirm delivery before relying on real alerts. Email is always tried
 * (every account has one); SMS/WhatsApp only if a phone is on file. Each
 * channel is independent and best-effort — the response reports per-channel
 * success so the UI can say exactly what landed and what didn't.
 *
 * Rate-limited (limiters.strict) because a misconfigured/abused caller could
 * otherwise run up per-message provider costs (especially SMS/WhatsApp).
 */
exports.test = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('email phone').lean();
    if (!user) return res.status(404).json({ error: 'user not found' });

    const title = 'MallChain test notification';
    const body = 'If you received this, your notification channel is working correctly.';
    const results = { email: false, sms: false, whatsapp: false };

    const tasks = [];
    if (user.email) {
      tasks.push(
        require('../services/emailService').sendEmail(user.email, title, body).then((ok) => { results.email = ok; })
      );
    }
    if (user.phone) {
      tasks.push(
        require('../services/smsService').sendSms(user.phone, `${title} — ${body}`).then((ok) => { results.sms = ok; })
      );
      // forceText: a test is only meaningful to the user inside their active
      // WhatsApp session, and we don't want to burn a template send on a test.
      tasks.push(
        require('../services/whatsappService').sendWhatsApp(user.phone, `${title}\n${body}`, { forceText: true })
          .then((ok) => { results.whatsapp = ok; })
      );
    }

    await Promise.all(tasks);

    logger.info('notifications:test', 'sent test notification', { userId: String(req.user._id), results });
    res.json({ ok: true, results });
  } catch (err) {
    logger.error('notifications:test', 'failed to send test notification', err, { userId: String(req.user._id) });
    res.status(500).json({ error: err.message });
  }
};
