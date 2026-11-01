/**
 * Notification dispatcher service.
 *
 * Reads user notification preferences and routes notifications to enabled channels
 * (email, SMS, WhatsApp, in-app). Respects do-not-disturb schedules and category
 * unsubscribes.
 */

const User = require('../models/user');
const NotificationPreferences = require('../models/notificationPreferences');
const Notification = require('../models/Notification');
const brevoService = require('./brevoService');
const { decryptField } = require('../utils/fieldEncryption');
const logger = require('../utils/logger');

/**
 * Check if current time is within user's do-not-disturb window.
 */
function isWithinDND(dnd) {
  if (!dnd.enabled) return false;

  const now = new Date();
  const userTimezone = dnd.timezone || 'Africa/Nairobi';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const currentHour = parseInt(parts.find(p => p.type === 'hour').value);
  const currentMinute = parseInt(parts.find(p => p.type === 'minute').value);
  const currentDay = parts.find(p => p.type === 'weekday').value.toUpperCase();

  const [startHour, startMinute] = dnd.startTime.split(':').map(Number);
  const [endHour, endMinute] = dnd.endTime.split(':').map(Number);

  const currentMinutes = currentHour * 60 + currentMinute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const dayMatch = !dnd.days || dnd.days.length === 0 || dnd.days.includes(currentDay);
  if (!dayMatch) return false;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Map a category (plural preference-key, singular enum value, or raw kind)
 * to the Notification schema's `type` enum
 * (transaction|security|governance|campaign|badge|marketing|system). Callers
 * historically passed the plural preference keys ('transactions',
 * 'badgeAlerts'), which crashed Notification.create with a ValidationError
 * and silently lost every row — normalize centrally so no caller can hit
 * that again.
 */
const TYPE_BY_CATEGORY = {
  transactions: 'transaction', transaction: 'transaction', wallet: 'transaction',
  mlcns: 'transaction', marketplace: 'transaction',
  campaigns: 'campaign', campaign: 'campaign', mlpts: 'campaign',
  mining: 'campaign', referrals: 'campaign',
  badgeAlerts: 'badge', badge: 'badge',
  governance: 'governance',
  security: 'security', account: 'security',
  marketing: 'marketing',
  system: 'system', network: 'system', support: 'system', administration: 'system',
};

function toNotificationType(category) {
  return TYPE_BY_CATEGORY[category] || 'system';
}

/**
 * Map notification category to preference frequency key.
 */
function categoryToFrequencyKey(category) {
  const mapping = {
    transaction: 'transactions',
    transactions: 'transactions',
    wallet: 'transactions',
    security: 'security',
    governance: 'governance',
    campaign: 'campaigns',
    campaigns: 'campaigns',
    badge: 'badgeAlerts',
    badgeAlerts: 'badgeAlerts',
    marketing: 'marketing',
    system: 'security',
  };
  return mapping[category] || 'security';
}

/**
 * Dispatch a notification to a user based on their preferences.
 *
 * @param {string} userId - User ID (MongoDB ObjectId string)
 * @param {string} category - Notification category (transaction, security, etc.)
 * @param {Object} payload - { title, message, data? }
 * @param {Object} [options] - optional { channels: { email, sms, whatsapp, inApp }, pushInApp }.
 *   `channels` is a per-dispatch gate used by admin broadcasts: a channel is
 *   only attempted when BOTH the admin requested it and the user's prefs
 *   enable it. `pushInApp: false` persists the row but skips the socket push.
 * @returns {Promise<{success: boolean, notificationId?: string, channels?: Object}>}
 */
async function dispatchNotification(userId, category, payload, options = {}) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn('notificationDispatcher', 'User not found', { userId });
      return { success: false, error: 'User not found' };
    }

    let prefs = await NotificationPreferences.findOne({ userId });
    if (!prefs) {
      prefs = new NotificationPreferences({ userId });
      await prefs.save();
    }

    if (!prefs.enableNotifications) {
      logger.info('notificationDispatcher', 'Notifications disabled for user', { userId });
      return { success: false, error: 'Notifications disabled' };
    }

    const frequencyKey = categoryToFrequencyKey(category);
    const frequency = prefs.frequency[frequencyKey];
    if (frequency === 'disabled') {
      logger.info('notificationDispatcher', 'Category disabled for user', { userId, category });
      return { success: false, error: 'Category disabled' };
    }

    // unsubscribedCategories stores the plural preference keys ('marketing',
    // 'campaigns'); accept either form so a plural category from the route is
    // still honored.
    const unsubscribed = prefs.unsubscribedCategories || [];
    if (unsubscribed.includes(category) || unsubscribed.includes(frequencyKey)) {
      logger.info('notificationDispatcher', 'User unsubscribed from category', { userId, category });
      return { success: false, error: 'Unsubscribed from category' };
    }

    if (isWithinDND(prefs.doNotDisturb)) {
      logger.info('notificationDispatcher', 'Within DND window — skipping', { userId });
      return { success: false, error: 'Do not disturb active' };
    }

    // Per-dispatch channel gate (admin broadcast) — a channel requested as
    // false here is never attempted, even when user prefs would allow it.
    const gate = options.channels || {};
    const gateOpen = (name) => gate[name] !== false;

    const channels = {
      email: false,
      sms: false,
      whatsapp: false,
      inApp: prefs.channels.inApp && gateOpen('inApp'),
    };

    const willEmail = prefs.channels.email && user.email && gateOpen('email');
    const willSms = prefs.channels.sms && user.phone && gateOpen('sms');
    const willWhatsapp = prefs.channels.whatsapp && user.phone && gateOpen('whatsapp');

    const deliveryStatus = {
      email: willEmail ? 'pending' : 'skipped',
      sms: willSms ? 'pending' : 'skipped',
      whatsapp: willWhatsapp ? 'pending' : 'skipped',
    };

    const notifType = toNotificationType(category);

    // PERSIST FIRST: the Notification row is written before any channel send.
    // If the process dies mid fan-out (or an outbound provider call throws
    // outside its try/catch), the in-app bell still has the row. Previously
    // rows were saved only after all sends completed, so any crash lost the
    // row while email/SMS had already gone out.
    const notification = new Notification({
      userId,
      type: notifType,
      title: payload.title,
      message: payload.message,
      data: payload.data,
      channels: { ...channels },
      deliveryStatus: { ...deliveryStatus },
    });

    await notification.save();

    if (willEmail) {
      const emailResult = await sendEmailNotification(user, notifType, payload);
      channels.email = true;
      deliveryStatus.email = emailResult.success ? 'sent' : 'failed';
    }

    if (willSms) {
      const smsResult = await sendSMSNotification(user, notifType, payload);
      channels.sms = true;
      deliveryStatus.sms = smsResult.success ? 'sent' : 'failed';
    }

    if (willWhatsapp) {
      const whatsappResult = await sendWhatsAppNotification(user, notifType, payload);
      channels.whatsapp = true;
      deliveryStatus.whatsapp = whatsappResult.success ? 'sent' : 'failed';
    }

    notification.channels = channels;
    notification.deliveryStatus = deliveryStatus;
    try {
      await notification.save();
    } catch (err) {
      logger.warn('notificationDispatcher', 'Failed to update delivery status', {
        notificationId: notification._id, error: err.message,
      });
    }

    if (global.io && channels.inApp && options.pushInApp !== false) {
      global.io.to(`user:${userId}`).emit('notification', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        read: false,
        createdAt: notification.createdAt,
      });
    }

    logger.info('notificationDispatcher', 'Notification dispatched', {
      userId,
      category,
      notificationId: notification._id,
      channels,
      deliveryStatus,
    });

    return {
      success: true,
      notificationId: notification._id.toString(),
      channels,
      deliveryStatus,
    };
  } catch (error) {
    logger.error('notificationDispatcher', 'Failed to dispatch notification', error, {
      userId,
      category,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send email notification.
 */
async function sendEmailNotification(user, category, payload) {
  try {
    const email = decryptField(user.email);
    if (!email) {
      return { success: false, error: 'No email address' };
    }

    const { complianceFooter } = require('./brevoService');
    const subject = `[Mallchain] ${payload.title}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #06b6d4;">${payload.title}</h2>
        <p>${payload.message}</p>
        ${payload.data?.actionUrl ? `<p><a href="${payload.data.actionUrl}" style="background: #06b6d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Details</a></p>` : ''}
        ${complianceFooter()}
      </div>
    `;

    return await brevoService.sendEmail(email, subject, html);
  } catch (error) {
    logger.error('notificationDispatcher', 'Email notification failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS notification.
 */
async function sendSMSNotification(user, category, payload) {
  try {
    const phone = decryptField(user.phone);
    if (!phone) {
      return { success: false, error: 'No phone number' };
    }

    const message = `Mallchain: ${payload.title} - ${payload.message}`;
    return await brevoService.sendSMS(phone, message);
  } catch (error) {
    logger.error('notificationDispatcher', 'SMS notification failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification.
 */
async function sendWhatsAppNotification(user, category, payload) {
  try {
    const phone = decryptField(user.phone);
    if (!phone) {
      return { success: false, error: 'No phone number' };
    }

    const message = `*${payload.title}*\n${payload.message}`;
    return await brevoService.sendWhatsApp(phone, message);
  } catch (error) {
    logger.error('notificationDispatcher', 'WhatsApp notification failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  dispatchNotification,
};
