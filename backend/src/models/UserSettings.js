const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSettingsSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

  prefs: {
    accent: { type: String, default: 'gold' },
    // No default here on purpose — the frontend derives an initial currency
    // from the browser's locale (services/locale.ts) and only writes a real
    // value back once the user (or that detection) explicitly sets one.
    // A hardcoded default here would silently overwrite that on first load.
    currency: { type: String },
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
      badgeAlerts: { type: Boolean, default: true },
    },
    push: {
      transactions: { type: Boolean, default: true },
      campaigns: { type: Boolean, default: true },
      governance: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      security: { type: Boolean, default: true },
      badgeAlerts: { type: Boolean, default: true },
    },
    sms: {
      transactions: { type: Boolean, default: false },
      campaigns: { type: Boolean, default: false },
      governance: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      security: { type: Boolean, default: false },
      badgeAlerts: { type: Boolean, default: true },
    },
    whatsapp: {
      transactions: { type: Boolean, default: false },
      campaigns: { type: Boolean, default: false },
      governance: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      security: { type: Boolean, default: false },
      badgeAlerts: { type: Boolean, default: true },
    },
    frequency: { type: String, default: 'realtime' },
  },

  // Contact information for notification delivery
  contactInfo: {
    // Phone number for SMS/WhatsApp (E.164 format: +1234567890)
    phoneNumber: { type: String, default: null },
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date },
    // WhatsApp-specific opt-in (separate from phone verification)
    whatsappOptIn: { type: Boolean, default: false },
    whatsappOptInAt: { type: Date },
    // Email verification status (email itself is on User model)
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    // Temporary OTP for phone verification — cleared after use or expiry.
    pendingPhoneOtp: { type: String, select: false },
    pendingPhoneOtpExpiry: { type: Date, select: false },
  },

  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorEnabledAt: { type: Date },
    twoFactorDisabledAt: { type: Date },
    // Pending secret from /2fa/setup, promoted to twoFactorSecret only once
    // a real TOTP code generated from it is verified in /2fa/enable.
    twoFactorPendingSecret: { type: String, select: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorBackupCodeHashes: { type: [String], default: undefined, select: false },
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
