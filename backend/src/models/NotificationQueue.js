const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Pending outbound notification for a user who chose a non-realtime delivery
 * frequency (hourly/daily digest) — see services/notify.js. Instead of
 * sending each event over email/SMS/WhatsApp the moment it happens, the
 * external-channel copy is queued here and flushed in one batched message per
 * (user, channel) by jobs/notificationDigest.js once `flushAfter` passes.
 *
 * The in-app notification (models/Notification) is always written instantly
 * regardless of frequency — only the paid external channels are batched.
 */
const NotificationQueueSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Which external channel this queued copy is destined for.
  channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
  kind: { type: String, default: 'system' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  // Earliest time this entry may be flushed (createdAt + frequency interval).
  flushAfter: { type: Date, required: true, index: true },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
});

// The flush job's hot query: due entries, oldest first, for stable batching.
NotificationQueueSchema.index({ flushAfter: 1, createdAt: 1 });

module.exports = mongoose.models.NotificationQueue || mongoose.model('NotificationQueue', NotificationQueueSchema);
