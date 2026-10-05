const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationPreferencesSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  
  // Global settings
  enableNotifications: { type: Boolean, default: true },
  
  // Frequency settings (immediate, daily-digest, weekly-digest, disabled)
  frequency: {
    transactions: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'immediate' },
    campaigns: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'daily' },
    governance: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'immediate' },
    security: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'immediate' },
    marketing: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'disabled' },
    badgeAlerts: { type: String, enum: ['immediate', 'daily', 'weekly', 'disabled'], default: 'immediate' },
  },

  // Do Not Disturb settings
  doNotDisturb: {
    enabled: { type: Boolean, default: false },
    startTime: String, // HH:MM format (24-hour)
    endTime: String,   // HH:MM format (24-hour)
    timezone: String,  // e.g., "Africa/Nairobi"
    days: [String],    // ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  },

  // Channel preferences
  channels: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    inApp: { type: Boolean, default: true },
  },

  // Archive settings
  archiveSettings: {
    autoArchiveAfterDays: { type: Number, default: 30 },
    archiveRead: { type: Boolean, default: true },
  },

  // Unsubscribe tracking
  unsubscribedCategories: [String], // e.g., ['marketing', 'campaigns']

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt on save
NotificationPreferencesSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.NotificationPreferences ||
  mongoose.model('NotificationPreferences', NotificationPreferencesSchema);
