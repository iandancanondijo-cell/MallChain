const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, default: 'system' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  read: { type: Boolean, default: false },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
});

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
