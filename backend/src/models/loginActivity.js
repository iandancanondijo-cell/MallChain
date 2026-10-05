const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LoginActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Login success/failure
  success: { type: Boolean, required: true, index: true },
  
  // Only populated if login failed
  failureReason: String, // 'invalid_credentials', 'account_locked', 'mfa_failed', 'unknown'
  
  // Device & Browser info
  device: String, // 'desktop', 'mobile', 'tablet'
  browser: String, // 'Chrome', 'Safari', etc.
  browserVersion: String,
  os: String, // 'MacOS', 'Windows', 'iOS', etc.
  
  // Network info
  ipAddress: { type: String, required: true },
  country: String, // From IP geolocation
  city: String,
  
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
