const Notification = require('../models/Notification');

// Delivery frequency → how long to hold external-channel copies before the
// digest job flushes them. 'realtime' is absent on purpose (send immediately).
const FREQUENCY_INTERVAL_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

/**
 * Persist a notification for a user and push it live over Socket.IO if a
 * client is subscribed to that user's room (see index.js `subscribe:user`
 * handler — mirrors the existing `wallet:*` room pattern used by
 * blockchainListener.js's `global.io.emit('tx:update', ...)`).
 *
 * Failures are logged, never thrown — a notification is a side effect of a
 * real action (submission resolved, ban applied, etc.) and must never block
 * or fail that action.
 */
async function notify(userId, { kind = 'system', title, body = '' } = {}) {
  if (!userId || !title) return null;
  try {
    const doc = await Notification.create({ userId, kind, title, body });
    if (global.io) {
      global.io.to(`user:${userId}`).emit('notification', {
        _id: doc._id,
        kind: doc.kind,
        title: doc.title,
        body: doc.body,
        read: doc.read,
        createdAt: doc.createdAt,
      });
    }
    return doc;
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('notify', 'Failed to create notification', err, { userId, kind, title });
    return null;
  }
}

/**
 * Send one already-decided notification over a single external channel.
 * Best-effort per channel — never throws.
 */
async function dispatchChannel(channel, user, title, body) {
  try {
    if (channel === 'email') {
      const { sendEmail } = require('./emailService');
      await sendEmail(user.email, title, body);
    } else if (channel === 'sms') {
      const { sendSms } = require('./smsService');
      await sendSms(user.phone, `${title} — ${body}`);
    } else if (channel === 'whatsapp') {
      const { sendWhatsApp } = require('./whatsappService');
      await sendWhatsApp(user.phone, `${title}\n${body}`);
    }
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('notify', `failed to dispatch ${channel}`, err, { userId: String(user._id) });
  }
}

/**
 * Fans a notification out across every channel the user has opted into for
 * this `category` (see UserSettings.notifications.{email,sms,whatsapp}),
 * always writing the in-app notification (existing `notify()`) regardless of
 * preferences or frequency — that one's free and has no delivery cost to gate.
 *
 * Delivery frequency (UserSettings.notifications.frequency) controls only the
 * paid external channels:
 *   - 'realtime' (default): send immediately, one message per event.
 *   - 'hourly'/'daily': queue the external copies and let
 *     jobs/notificationDigest.js flush them batched per (user, channel).
 * `user` must have at least `_id`; `email`/`phone` are used if present.
 * Never throws — each channel is independently best-effort.
 */
async function notifyUser(user, { kind = 'system', title, body = '', category = 'badgeAlerts' } = {}) {
  if (!user?._id || !title) return;

  await notify(user._id, { kind, title, body });

  let prefs = null;
  try {
    const UserSettings = require('../models/UserSettings');
    prefs = await UserSettings.findOne({ userId: user._id }).lean();
  } catch (err) {
    const logger = require('../utils/logger');
    logger.warn('notify', 'failed to load notification preferences', { userId: user._id, error: err.message });
  }

  const emailEnabled = prefs?.notifications?.email?.[category] ?? true;
  const smsEnabled = prefs?.notifications?.sms?.[category] ?? false;
  const whatsappEnabled = prefs?.notifications?.whatsapp?.[category] ?? false;

  // Resolve the external channels this user actually wants for this category
  // and has a deliverable destination for.
  const channels = [];
  if (emailEnabled && user.email) channels.push('email');
  if (smsEnabled && user.phone) channels.push('sms');
  if (whatsappEnabled && user.phone) channels.push('whatsapp');
  if (channels.length === 0) return;

  const frequency = prefs?.notifications?.frequency || 'realtime';
  const interval = FREQUENCY_INTERVAL_MS[frequency];

  if (!interval) {
    // realtime (or an unknown value — default to immediate) — send now.
    for (const channel of channels) {
      await dispatchChannel(channel, user, title, body);
    }
    return;
  }

  // Digest mode — queue the external copies for batched flush. A failure to
  // queue is logged and dropped rather than falling back to an immediate send
  // (which would defeat the user's chosen frequency and its cost savings).
  try {
    const NotificationQueue = require('../models/NotificationQueue');
    const flushAfter = new Date(Date.now() + interval);
    await NotificationQueue.insertMany(
      channels.map((channel) => ({ userId: user._id, channel, kind, title, body, flushAfter }))
    );
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('notify', 'failed to queue digest notification', err, { userId: String(user._id), frequency });
  }
}

module.exports = { notify, notifyUser, dispatchChannel, FREQUENCY_INTERVAL_MS };
