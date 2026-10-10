const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Notification type/category
  type: {
    type: String,
    enum: [
      'transaction',
      'security',
      'governance',
      'campaign',
      'badge',
      'marketing',
      'system',
    ],
    required: true,
    index: true,
  },

  // Display content
  title: { type: String, required: true },
  message: { type: String, required: true },

  // Optional structured data (e.g., transaction hash, amount, sender)
  data: { type: Schema.Types.Mixed },

  // Channels this notification was sent to
  channels: {
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    inApp: { type: Boolean, default: true },
  },

  // Delivery status per channel
  deliveryStatus: {
    email: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
    sms: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
    whatsapp: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
  },

  // Read state
  read: { type: Boolean, default: false, index: true },
  readAt: { type: Date },

  // Archived state
  archived: { type: Boolean, default: false, index: true },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
});

// Compound index for efficient user notification queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
