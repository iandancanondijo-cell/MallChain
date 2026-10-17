/**
 * Mallchain Unified Notification Engine
 *
 * Central dispatch that:
 *  - Looks up templates from the catalogue
 *  - Validates required data fields
 *  - Resolves recipients (decrypts PII)
 *  - Bridges both preference systems (NotificationPreferences + UserSettings)
 *  - Renders title/body/subject with {{variable}} substitution
 *  - Dispatches to enabled channels (in-app, email, SMS, WhatsApp)
 *  - Records delivery status in the Notification model
 *  - Pushes real-time via Socket.IO for in-app
 *  - Supports idempotency deduplication
 *
 * Two entry points:
 *  - dispatchEvent(userId, eventType, data) — template-driven, preferred
 *  - notify(userId, { kind, title, body, data }) — backward-compatible, raw
 *  - notifyUser(user, { kind, title, body, category, data }) — backward-compatible
 */

const crypto = require('crypto');
const Notification = require('../models/Notification');
const User = require('../models/user');
const NotificationPreferences = require('../models/notificationPreferences');
const { templateByEvent } = require('./notificationCatalogue');
const { decryptField } = require('../utils/fieldEncryption');
const logger = require('../utils/logger');

// ─── TEMPLATE RENDERING ──────────────────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderText(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

function validateRequired(template, data) {
  const missing = [];
  for (const field of template.required) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }
  return missing;
}

// ─── RECIPIENT RESOLUTION ────────────────────────────────────────────

async function resolveRecipient(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  return {
    userId: user._id.toString(),
    email: decryptField(user.email) || null,
    phone: decryptField(user.phone) || null,
    name: user.name || user.username || null,
    username: user.username || null,
    walletAddress: decryptField(user.walletAddress) || null,
    userDoc: user,
  };
}

// ─── PREFERENCE BRIDGE ───────────────────────────────────────────────

const CATEGORY_MAP = {
  account: 'security',
  wallet: 'transactions',
  transaction: 'transactions',
  mlcns: 'transactions',
  mlpts: 'campaigns',
  campaign: 'campaigns',
  mining: 'campaigns',
  marketplace: 'transactions',
  badge: 'badgeAlerts',
  badges: 'badgeAlerts',
  network: 'security',
  security: 'security',
  governance: 'governance',
  administration: 'security',
  support: 'system',
  system: 'security',
  marketing: 'marketing',
  referrals: 'campaigns',
  badgeAlerts: 'badgeAlerts',
  transactions: 'transactions',
  campaigns: 'campaigns',
};

function categoryToFrequencyKey(category) {
  return CATEGORY_MAP[category] || 'security';
}

/**
 * Bridge both preference systems into a single shape.
 * Priority: NotificationPreferences model > UserSettings model > defaults.
 */
async function resolvePreferences(userId, category) {
  const freqKey = categoryToFrequencyKey(category);

  let prefs = null;
  try {
    prefs = await NotificationPreferences.findOne({ userId }).lean();
  } catch { /* ignore */ }

  let userSettings = null;
  try {
    const UserSettings = require('../models/UserSettings');
    userSettings = await UserSettings.findOne({ userId }).lean();
  } catch { /* ignore */ }

  const globalEnabled = prefs?.enableNotifications ?? true;
  const frequency = prefs?.frequency?.[freqKey] ?? 'immediate';
  const unsubscribed = prefs?.unsubscribedCategories?.includes(category) ?? false;

  const dnd = prefs?.doNotDisturb;
  const dndActive = dnd?.enabled ? isWithinDND(dnd) : false;

  const channels = {
    inApp: prefs?.channels?.inApp ?? userSettings?.notifications?.push?.[freqKey] ?? true,
    email: prefs?.channels?.email ?? userSettings?.notifications?.email?.[freqKey] ?? true,
    sms: prefs?.channels?.sms ?? userSettings?.notifications?.sms?.[freqKey] ?? false,
    whatsapp: prefs?.channels?.whatsapp ?? userSettings?.notifications?.whatsapp?.[freqKey] ?? false,
  };

  const whatsappOptIn = userSettings?.contactInfo?.whatsappOptIn ?? false;
  const contactPhone = userSettings?.contactInfo?.phoneNumber ?? null;

  return {
    globalEnabled,
    frequency,
    unsubscribed,
    dndActive,
    channels,
    whatsappOptIn,
    contactPhone,
  };
}

function isWithinDND(dnd) {
  if (!dnd?.enabled) return false;

  const now = new Date();
  const tz = dnd.timezone || 'Africa/Nairobi';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const currentHour = parseInt(parts.find(p => p.type === 'hour').value);
  const currentMinute = parseInt(parts.find(p => p.type === 'minute').value);
  const currentDay = parts.find(p => p.type === 'weekday').value.toUpperCase();

  if (!dnd.startTime || !dnd.endTime) return false;

  const [startHour, startMinute] = dnd.startTime.split(':').map(Number);
  const [endHour, endMinute] = dnd.endTime.split(':').map(Number);

  const currentMinutes = currentHour * 60 + currentMinute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const dayMatch = !dnd.days || dnd.days.length === 0 || dnd.days.includes(currentDay);
  if (!dayMatch) return false;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// ─── IDEMPOTENCY ─────────────────────────────────────────────────────

const processedKeys = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function idempotencyKey(eventType, eventId, userId) {
  return `${eventType}:${eventId}:${userId}`;
}

function isDuplicate(key) {
  const entry = processedKeys.get(key);
  if (!entry) return false;
  if (Date.now() - entry.timestamp > DEDUP_TTL_MS) {
    processedKeys.delete(key);
    return false;
  }
  return true;
}

function markProcessed(key) {
  processedKeys.set(key, { timestamp: Date.now() });
}

// ─── CHANNEL DELIVERY ────────────────────────────────────────────────

async function deliverInApp(userId, rendered, data) {
  try {
    if (global.io) {
      global.io.to(`user:${userId}`).emit('notification', {
        _id: data.notificationId,
        type: data.type,
        title: rendered.title,
        message: rendered.body,
        severity: rendered.severity,
        category: rendered.category,
        referenceId: rendered.referenceId,
        occurredAt: rendered.occurredAt,
        read: false,
        createdAt: new Date(),
      });
    }
    return { channel: 'inApp', status: 'sent' };
  } catch (err) {
    logger.warn('notificationEngine', 'in-app delivery failed', { userId, error: err.message });
    return { channel: 'inApp', status: 'failed', reason: err.message };
  }
}

async function deliverEmail(recipient, rendered) {
  if (!recipient.email) {
    return { channel: 'email', status: 'skipped', reason: 'No email address' };
  }
  try {
    const { sendEmail, complianceFooter } = require('./brevoService');
    const subject = rendered.subject
      ? `[Mallchain] ${rendered.subject}`
      : `[Mallchain] ${rendered.title}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#06b6d4;">${escapeHtml(rendered.title)}</h2>
      <p>${escapeHtml(rendered.body).replace(/\n/g, '<br>')}</p>
      ${complianceFooter()}
    </div>`;
    const result = await sendEmail(recipient.email, subject, html);
    return {
      channel: 'email',
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId,
      reason: result.error,
    };
  } catch (err) {
    logger.warn('notificationEngine', 'email delivery failed', { userId: recipient.userId, error: err.message });
    return { channel: 'email', status: 'failed', reason: err.message };
  }
}

async function deliverSMS(recipient, rendered) {
  const phone = recipient.phone;
  if (!phone) {
    return { channel: 'sms', status: 'skipped', reason: 'No phone number' };
  }
  try {
    const { sendSMS } = require('./brevoService');
    const message = `Mallchain: ${rendered.title} — ${rendered.body}`;
    const result = await sendSMS(phone, message.substring(0, 765));
    return {
      channel: 'sms',
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId,
      reason: result.error,
    };
  } catch (err) {
    logger.warn('notificationEngine', 'SMS delivery failed', { userId: recipient.userId, error: err.message });
    return { channel: 'sms', status: 'failed', reason: err.message };
  }
}

async function deliverWhatsApp(recipient, rendered, prefs) {
  const phone = prefs.contactPhone || recipient.phone;
  if (!phone) {
    return { channel: 'whatsapp', status: 'skipped', reason: 'No phone number' };
  }
  if (!prefs.whatsappOptIn) {
    return { channel: 'whatsapp', status: 'skipped', reason: 'WhatsApp not opted in' };
  }
  try {
    const { sendWhatsApp } = require('./brevoService');
    const message = `*${rendered.title}*\n${rendered.body}`;
    const result = await sendWhatsApp(phone, message);
    return {
      channel: 'whatsapp',
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId,
      reason: result.error,
    };
  } catch (err) {
    logger.warn('notificationEngine', 'WhatsApp delivery failed', { userId: recipient.userId, error: err.message });
    return { channel: 'whatsapp', status: 'failed', reason: err.message };
  }
}

// ─── CORE DISPATCH ───────────────────────────────────────────────────

/**
 * Dispatch a template-driven notification event.
 *
 * @param {string} userId - MongoDB ObjectId string
 * @param {string} eventType - e.g. 'account.created', 'wallet.deposit_confirmed'
 * @param {Object} data - template variables + optional eventId, referenceId, network
 * @returns {Promise<{success: boolean, notificationId?: string, channels?: Object, deliveryStatus?: Object, error?: string}>}
 */
async function dispatchEvent(userId, eventType, data = {}) {
  const template = templateByEvent.get(eventType);
  if (!template) {
    logger.warn('notificationEngine', 'No template for event type', { eventType });
    return { success: false, error: `Unknown event type: ${eventType}` };
  }

  const missing = validateRequired(template, data);
  if (missing.length > 0) {
    logger.warn('notificationEngine', 'Missing required fields', { eventType, missing });
    return { success: false, error: `Missing required fields: ${missing.join(', ')}` };
  }

  const eventId = data.eventId || crypto.randomUUID();
  const dedupKey = idempotencyKey(eventType, eventId, userId);
  if (isDuplicate(dedupKey)) {
    logger.info('notificationEngine', 'Duplicate event suppressed', { eventType, eventId, userId });
    return { success: false, error: 'Duplicate event' };
  }

  const recipient = await resolveRecipient(userId);
  if (!recipient) {
    logger.warn('notificationEngine', 'User not found', { userId });
    return { success: false, error: 'User not found' };
  }

  const prefs = await resolvePreferences(userId, template.category);

  if (!prefs.globalEnabled) {
    logger.info('notificationEngine', 'Notifications disabled', { userId });
    return { success: false, error: 'Notifications disabled' };
  }

  if (prefs.unsubscribed) {
    logger.info('notificationEngine', 'Unsubscribed from category', { userId, category: template.category });
    return { success: false, error: 'Unsubscribed from category' };
  }

  if (prefs.frequency === 'disabled') {
    logger.info('notificationEngine', 'Category frequency disabled', { userId, category: template.category });
    return { success: false, error: 'Category disabled' };
  }

  if (prefs.dndActive && !template.transactional) {
    logger.info('notificationEngine', 'DND active — skipping non-transactional', { userId });
    return { success: false, error: 'Do not disturb active' };
  }

  const renderData = { ...data, network_name: data.network || 'Mallchain' };
  const rendered = {
    templateId: template.id,
    version: template.version,
    title: renderText(template.title, renderData),
    body: renderText(template.body, renderData),
    subject: template.subject ? renderText(template.subject, renderData) : null,
    severity: template.severity,
    category: template.category,
    referenceId: data.referenceId || null,
    occurredAt: new Date().toISOString(),
  };

  const channels = { email: false, sms: false, whatsapp: false, inApp: false };
  const deliveryStatus = { email: 'skipped', sms: 'skipped', whatsapp: 'skipped' };
  const results = [];

  let notificationId;
  try {
    const doc = await Notification.create({
      userId,
      type: template.category === 'badges' ? 'badge' : (template.category === 'administration' ? 'system' : template.category),
      title: rendered.title,
      message: rendered.body,
      data: { ...data, templateId: template.id, eventType, severity: template.severity },
      channels: { email: false, sms: false, whatsapp: false, inApp: true },
      deliveryStatus: { email: 'skipped', sms: 'skipped', whatsapp: 'skipped' },
    });
    notificationId = doc._id.toString();
  } catch (err) {
    logger.error('notificationEngine', 'Failed to persist notification', err, { eventType, userId });
    return { success: false, error: err.message };
  }

  const persistData = { notificationId, type: template.category };

  for (const ch of template.channels) {
    let result;
    switch (ch) {
      case 'in_app':
        if (prefs.channels.inApp) {
          channels.inApp = true;
          result = await deliverInApp(userId, rendered, persistData);
        }
        break;
      case 'email':
        if (prefs.channels.email && recipient.email) {
          channels.email = true;
          result = await deliverEmail(recipient, rendered);
          deliveryStatus.email = result.status;
        }
        break;
      case 'sms':
        if (prefs.channels.sms && recipient.phone) {
          channels.sms = true;
          result = await deliverSMS(recipient, rendered);
          deliveryStatus.sms = result.status;
        }
        break;
      case 'push':
        if (prefs.channels.inApp) {
          result = await deliverInApp(userId, rendered, persistData);
        }
        break;
    }
    if (result) results.push(result);
  }

  if (channels.whatsapp || (template.channels.includes('sms') && prefs.channels.whatsapp)) {
    channels.whatsapp = true;
    const waResult = await deliverWhatsApp(recipient, rendered, prefs);
    deliveryStatus.whatsapp = waResult.status;
    results.push(waResult);
  }

  try {
    await Notification.findByIdAndUpdate(notificationId, {
      channels,
      deliveryStatus,
    });
  } catch (err) {
    logger.warn('notificationEngine', 'Failed to update delivery status', { notificationId, error: err.message });
  }

  markProcessed(dedupKey);

  logger.info('notificationEngine', 'Notification dispatched', {
    eventType,
    userId,
    notificationId,
    channels,
    deliveryStatus,
  });

  return {
    success: true,
    notificationId,
    channels,
    deliveryStatus,
  };
}

// ─── BACKWARD-COMPATIBLE RAW DISPATCH ────────────────────────────────

const KIND_TO_TYPE = {
  transaction: 'transaction',
  security: 'security',
  governance: 'governance',
  campaign: 'campaign',
  badge: 'badge',
  marketing: 'marketing',
  mining: 'campaign',
  wallet: 'transaction',
  mlcns: 'transaction',
  mlpts: 'campaign',
  marketplace: 'transaction',
  network: 'system',
  support: 'system',
  system: 'system',
};

function resolveType(kind) {
  return KIND_TO_TYPE[kind] || 'system';
}

/**
 * Raw notification — no template, just title/body.
 * Backward-compatible with existing notify() callers.
 */
async function notify(userId, { kind = 'system', title, body = '', data } = {}) {
  if (!userId || !title) return null;
  const type = resolveType(kind);
  try {
    const doc = await Notification.create({ userId, type, title, message: body, data });
    if (global.io) {
      global.io.to(`user:${userId}`).emit('notification', {
        _id: doc._id,
        type: doc.type,
        title: doc.title,
        message: doc.message,
        data: doc.data,
        read: doc.read,
        createdAt: doc.createdAt,
      });
    }
    return doc;
  } catch (err) {
    logger.error('notificationEngine', 'Failed to create notification', err, { userId, kind, title });
    return null;
  }
}

/**
 * Multi-channel fan-out with raw title/body.
 * Backward-compatible with existing notifyUser() callers.
 */
async function notifyUser(user, { kind = 'system', title, body = '', category = 'badgeAlerts', data } = {}) {
  if (!user?._id || !title) return;

  await notify(user._id, { kind, title, body, data });

  const prefs = await resolvePreferences(user._id.toString(), category);
  if (!prefs.globalEnabled) return;

  const recipient = {
    userId: user._id.toString(),
    email: decryptField(user.email) || null,
    phone: decryptField(user.phone) || null,
  };

  const rendered = { title, body, subject: title };

  if (prefs.channels.email && recipient.email) {
    await deliverEmail(recipient, rendered);
  }
  if (prefs.channels.sms && recipient.phone) {
    await deliverSMS(recipient, rendered);
  }
  if (prefs.channels.whatsapp && prefs.whatsappOptIn) {
    await deliverWhatsApp(recipient, rendered, prefs);
  }
}

module.exports = {
  dispatchEvent,
  notify,
  notifyUser,
  resolveRecipient,
  resolvePreferences,
};
