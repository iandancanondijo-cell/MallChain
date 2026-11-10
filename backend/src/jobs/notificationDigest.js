/**
 * Digest flush job: sends batched notifications to users who chose a
 * non-realtime delivery frequency (hourly/daily). notify.js queues each
 * external-channel copy into NotificationQueue with a `flushAfter` time; this
 * job runs hourly and flushes everything now due as ONE message per
 * (user, channel) — so a user on "daily" gets a single morning summary instead
 * of a separate email/SMS/WhatsApp per event.
 */
const cron = require('node-cron');
const NotificationQueue = require('../models/NotificationQueue');
const User = require('../models/user');
const logger = require('../utils/logger');

// Channels, in the order they're grouped/sent. Each queued entry is destined
// for exactly one of these.
const CHANNELS = ['email', 'sms', 'whatsapp'];

/**
 * Build the batched body text for one (user, channel) group. A single entry
 * reads as a plain notification; multiple entries become a numbered digest.
 */
function buildDigestBody(entries) {
  if (entries.length === 1) return entries[0].body || entries[0].title;
  const lines = entries.map((e, i) => `${i + 1}. ${e.title}${e.body ? ` — ${e.body}` : ''}`);
  return `You have ${entries.length} new notifications:\n${lines.join('\n')}`;
}

function buildDigestSubject(entries) {
  return entries.length === 1 ? entries[0].title : `You have ${entries.length} new notifications`;
}

/**
 * Flush every queued notification whose flushAfter has passed. Groups due
 * entries by (user, channel), sends one message per group, and deletes only
 * the entries that were actually delivered — a failed send is left queued to
 * retry on the next run rather than silently dropped.
 *
 * @param {Date} [now] override "now" (tests)
 * @returns {Promise<{flushed:number, sent:number, failed:number}>}
 */
async function flushDueDigests(now = new Date()) {
  const due = await NotificationQueue.find({ flushAfter: { $lte: now } })
    .sort({ createdAt: 1 })
    .lean();

  const stats = { flushed: 0, sent: 0, failed: 0 };
  if (due.length === 0) return stats;

  // Group by userId + channel so each group becomes a single message.
  const groups = new Map();
  for (const entry of due) {
    const key = `${entry.userId}:${entry.channel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  for (const [key, entries] of groups) {
    const [userId, channel] = key.split(':');
    if (!CHANNELS.includes(channel)) {
      // Unknown channel — drop it rather than loop on it forever.
      await NotificationQueue.deleteMany({ _id: { $in: entries.map((e) => e._id) } });
      continue;
    }

    let user = null;
    try {
      user = await User.findById(userId).select('email phone').lean();
    } catch (err) {
      logger.error('notificationDigest', 'failed to load user for digest', err, { userId, channel });
    }

    // No user or no destination for this channel — nothing to send, drop it.
    const hasDestination =
      (channel === 'email' && user?.email) ||
      (channel === 'sms' && user?.phone) ||
      (channel === 'whatsapp' && user?.phone);
    if (!hasDestination) {
      await NotificationQueue.deleteMany({ _id: { $in: entries.map((e) => e._id) } });
      continue;
    }

    const subject = buildDigestSubject(entries);
    const body = buildDigestBody(entries);

    // dispatchChannel swallows its own errors and returns void, so probe the
    // underlying sender's success by re-checking: send directly here instead
    // so we know whether to keep or drop the batch. We call the channel
    // services directly (mirroring notify.js's dispatch) to get a boolean.
    const ok = await sendGroup(channel, user, subject, body);
    if (ok) {
      await NotificationQueue.deleteMany({ _id: { $in: entries.map((e) => e._id) } });
      stats.sent++;
    } else {
      // Leave queued for retry next run.
      stats.failed++;
    }
    stats.flushed += entries.length;
  }

  logger.info('notificationDigest', 'digest flush complete', stats);
  return stats;
}

/** Send one grouped digest over one channel; returns true on success. */
async function sendGroup(channel, user, subject, body) {
  try {
    if (channel === 'email') {
      const { sendEmail } = require('../services/emailService');
      return await sendEmail(user.email, subject, body);
    }
    if (channel === 'sms') {
      const { sendSms } = require('../services/smsService');
      return await sendSms(user.phone, `${subject} — ${body}`);
    }
    if (channel === 'whatsapp') {
      const { sendWhatsApp } = require('../services/whatsappService');
      return await sendWhatsApp(user.phone, `${subject}\n${body}`);
    }
  } catch (err) {
    logger.error('notificationDigest', 'digest send threw', err, { channel });
  }
  return false;
}

function start() {
  // Hourly at minute 0 UTC. Hourly-frequency digests flush ~within the hour;
  // daily-frequency digests flush ~24h after they were queued.
  cron.schedule('0 * * * *', () => {
    flushDueDigests().catch((err) => logger.error('notificationDigest', 'digest flush threw', err));
  }, { timezone: 'UTC' });
}

module.exports = { flushDueDigests, buildDigestBody, buildDigestSubject, start };
