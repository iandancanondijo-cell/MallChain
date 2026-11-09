const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LoginActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Login success/failure
  success: { type: Boolean, required: true, index: true },
  
  // Only populated if login failed
  failureReason: String, // 'invalid_credentials', 'account_locked', 'mfa_failed', 'unknown'
  
  // Device & Browser info (null = the request did not state it; see
  // utils/deviceInfo.js — these used to be written as the literal 'Unknown'
  // and the Settings UI displayed them as if they were observations)
  device: { type: String, default: 'unknown' }, // 'desktop', 'mobile', 'tablet', 'unknown'
  browser: { type: String, default: null }, // 'Chrome', 'Safari', etc.
  browserVersion: { type: String, default: null },
  os: { type: String, default: null }, // 'macOS', 'Windows', 'iOS', etc.

  // Network info. Not `required`: behind some proxies this server cannot see
  // a client address at all, and a mandatory field with no value made every
  // insert from services/sessionRegistry.js fail validation — which it
  // swallows, so the log would silently stay empty.
  ipAddress: { type: String, default: null },
  country: { type: String, default: null }, // ISO alpha-2 from Cloudflare's edge header
  city: { type: String, default: null }, // No GeoIP lookup is wired up — stays null
  
  // Timing
  timestamp: { type: Date, default: Date.now, index: true },
  
  // Session reference (if successful)
  sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
  
  // Risk scoring (for suspicious activity detection)
  riskScore: { type: Number, default: 0 }, // 0-100
  suspicious: { type: Boolean, default: false }, // Flagged as unusual
  suspiciousReasons: [String], // Why it was flagged
  
  // Additional metadata
  userAgent: String, // Full user agent for debugging
  loginMethod: String, // 'password', 'google', 'github', 'apple', 'passkey'
  mfaUsed: { type: Boolean, default: false },
});

// Indexes for performance and querying
LoginActivitySchema.index({ userId: 1, timestamp: -1 }); // For user's activity history
LoginActivitySchema.index({ userId: 1, success: 1 }); // For filtering by success/failure
LoginActivitySchema.index({ ipAddress: 1 }); // For tracking IP-based attacks
LoginActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // TTL: 90 days (3 months)
LoginActivitySchema.index({ suspicious: 1 }); // For alerting on suspicious logins

module.exports = mongoose.models.LoginActivity || mongoose.model('LoginActivity', LoginActivitySchema);
