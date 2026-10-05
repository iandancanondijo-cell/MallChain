const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Token reference (hashed, not stored in plain)
  tokenHash: { type: String, required: true, unique: true },
  
  // Device & Browser info (parsed from User-Agent)
  device: String, // 'desktop', 'mobile', 'tablet'
  browser: String, // 'Chrome', 'Safari', etc.
  browserVersion: String,
  os: String, // 'MacOS', 'Windows', 'iOS', etc.
  
  // Network info
  ipAddress: { type: String, required: true },
  country: String, // From IP geolocation
  city: String,
  
  // Activity tracking
  createdAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  
  // Lifecycle
  isActive: { type: Boolean, default: true, index: true },
  expiresAt: { type: Date, index: true }, // Auto-delete after expiration
  
  // Session metadata
  ipChangeCount: { type: Number, default: 0 }, // Suspicious activity detector
  userAgent: String, // Full user agent for debugging
});

// Indexes for performance
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
