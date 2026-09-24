const Notification = require('../models/Notification');

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
 * Fans a notification out across every channel the user has opted into for
 * this `category` (see UserSettings.notifications.{email,push,sms}), always
 * writing the in-app notification (existing `notify()`) regardless of
 * preferences — that one's free and has no delivery cost to gate.
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
  const phoneNumber = prefs?.contactInfo?.phoneNumber;
  const whatsappOptIn = prefs?.contactInfo?.whatsappOptIn ?? false;

  if (emailEnabled && user.email) {
    const { sendEmail } = require('./emailService');
    await sendEmail(user.email, title, body);
  }
  if (smsEnabled && user.phone) {
    const { sendSms } = require('./smsService');
    await sendSms(user.phone, `${title} — ${body}`);
  }
  // WhatsApp requires both opt-in at the channel level AND per-category enable,
  // plus a verified phone number on file.
  if (whatsappEnabled && whatsappOptIn && phoneNumber) {
    const { sendTransactionAlert } = require('./whatsappService');
    await sendTransactionAlert(phoneNumber, title, body);
  }
}

module.exports = { notify, notifyUser };
