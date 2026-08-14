const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSettingsSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

  prefs: {
    accent: { type: String, default: 'gold' },
    currency: { type: String, default: 'USD' },
    lang: { type: String, default: 'EN' },
    theme: { type: String, default: 'dark' },
  },

  notifications: {
    email: {
      transactions: { type: Boolean, default: true },
      campaigns: { type: Boolean, default: true },
      governance: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
      security: { type: Boolean, default: true },
    },
    push: {
      transactions: { type: Boolean, default: true },
      campaigns: { type: Boolean, default: true },
      governance: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      security: { type: Boolean, default: true },
    },
    frequency: { type: String, default: 'realtime' },
  },

  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorEnabledAt: { type: Date },
    twoFactorDisabledAt: { type: Date },
    sessionTimeout: { type: Number, default: 120 },
    loginNotifications: { type: Boolean, default: true },
    deviceManagement: { type: Boolean, default: true },
    trustedDevices: { type: [String], default: [] },
  },

  privacy: {
    profileVisibility: { type: String, default: 'public' },
    showActivity: { type: Boolean, default: true },
    showBalance: { type: Boolean, default: false },
    allowMessages: { type: Boolean, default: true },
    dataSharing: { type: Boolean, default: false },
  },

  display: {
    compactMode: { type: Boolean, default: false },
    showBalances: { type: Boolean, default: true },
    defaultView: { type: String, default: 'dashboard' },
    itemsPerPage: { type: Number, default: 20 },
  },
}, {
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

module.exports = mongoose.models.UserSettings || mongoose.model('UserSettings', UserSettingsSchema);
