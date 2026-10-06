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
const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
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
 * Map notification category to preference frequency key.
 */
function categoryToFrequencyKey(category) {
  const mapping = {
    transaction: 'transactions',
    security: 'security',
    governance: 'governance',
    campaign: 'campaigns',
    badge: 'badgeAlerts',
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
 * @returns {Promise<{success: boolean, notificationId?: string, channels?: Object}>}
 */
async function dispatchNotification(userId, category, payload) {
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

    if (prefs.unsubscribedCategories.includes(category)) {
      logger.info('notificationDispatcher', 'User unsubscribed from category', { userId, category });
      return { success: false, error: 'Unsubscribed from category' };
    }

    if (isWithinDND(prefs.doNotDisturb)) {
      logger.info('notificationDispatcher', 'Within DND window — skipping', { userId });
      return { success: false, error: 'Do not disturb active' };
    }

    const channels = {
      email: false,
      sms: false,
      whatsapp: false,
      inApp: prefs.channels.inApp,
    };

    const deliveryStatus = {
      email: 'skipped',
      sms: 'skipped',
      whatsapp: 'skipped',
    };

    if (prefs.channels.email && user.email) {
      const emailResult = await sendEmailNotification(user, category, payload);
      channels.email = true;
      deliveryStatus.email = emailResult.success ? 'sent' : 'failed';
    }

    if (prefs.channels.sms && user.phone) {
      const smsResult = await sendSMSNotification(user, category, payload);
      channels.sms = true;
      deliveryStatus.sms = smsResult.success ? 'sent' : 'failed';
    }

    if (prefs.channels.whatsapp && user.phone) {
      const whatsappResult = await sendWhatsAppNotification(user, category, payload);
      channels.whatsapp = true;
      deliveryStatus.whatsapp = whatsappResult.success ? 'sent' : 'failed';
    }

    const notification = new Notification({
      userId,
      type: category,
      title: payload.title,
      message: payload.message,
      data: payload.data,
      channels,
      deliveryStatus,
    });

    await notification.save();

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

    const subject = `[Mallchain] ${payload.title}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #06b6d4;">${payload.title}</h2>
        <p>${payload.message}</p>
        ${payload.data?.actionUrl ? `<p><a href="${payload.data.actionUrl}" style="background: #06b6d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Details</a></p>` : ''}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          You received this email because you have notifications enabled for ${category}.
          <a href="https://mallchain.network/settings/notifications">Manage preferences</a>
        </p>
      </div>
    `;

    return await emailService.sendEmail(email, subject, html);
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
    return await smsService.sendSMS(phone, message);
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
    return await whatsappService.sendWhatsApp(phone, message);
  } catch (error) {
    logger.error('notificationDispatcher', 'WhatsApp notification failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  dispatchNotification,
};
