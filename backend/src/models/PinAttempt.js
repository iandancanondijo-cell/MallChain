/**
 * PinAttempt - Track PIN verification attempts for brute-force protection
 * Implements 3-strike lockout with 5-minute cooldown per user
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PinAttemptSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ipAddress: { type: String }, // For cross-device tracking
  attempts: { type: Number, default: 0, min: 0 },
  lockedUntil: { type: Date, index: true }, // When lockout expires
  lastAttemptAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: 3600 }, // Auto-delete after 1 hour
  updatedAt: { type: Date, default: Date.now },
});

// Compound index for cleanup: find expired attempts
PinAttemptSchema.index({ userId: 1, lockedUntil: 1 });

/**
 * Get or create attempt tracker for user
 */
PinAttemptSchema.statics.getOrCreate = async function(userId) {
  const doc = await this.findOne({ userId });
  if (doc) return doc;
  return new this({ userId });
};

/**
 * Check if user is currently locked out
 */
PinAttemptSchema.statics.isLocked = async function(userId) {
  const doc = await this.findOne({ userId });
  if (!doc || !doc.lockedUntil) return false;
  if (new Date() > doc.lockedUntil) {
    // Lockout expired, reset
    await this.updateOne({ _id: doc._id }, { attempts: 0, lockedUntil: null });
    return false;
  }
  return true;
};

/**
 * Record failed attempt and check if should lock out
 * Returns: { attempts: N, locked: bool, lockedUntil: Date|null }
 */
PinAttemptSchema.statics.recordFailedAttempt = async function(userId) {
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

  let doc = await this.findOne({ userId });
  if (!doc) {
    doc = new this({ userId });
  }

  // Check if lockout has expired
  if (doc.lockedUntil && new Date() < doc.lockedUntil) {
    return {
      attempts: doc.attempts,
      locked: true,
      lockedUntil: doc.lockedUntil,
      remainingSeconds: Math.ceil((doc.lockedUntil - Date.now()) / 1000),
    };
  }

  // Reset if lockout expired
  if (doc.lockedUntil && new Date() >= doc.lockedUntil) {
    doc.attempts = 0;
    doc.lockedUntil = null;
  }

  // Increment attempts
  doc.attempts += 1;
  doc.lastAttemptAt = new Date();

  // Lock if max attempts reached
  if (doc.attempts >= MAX_ATTEMPTS) {
    doc.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
  }

  await doc.save();

  return {
    attempts: doc.attempts,
    locked: doc.attempts >= MAX_ATTEMPTS,
    lockedUntil: doc.lockedUntil,
    remainingSeconds: doc.lockedUntil ? Math.ceil((doc.lockedUntil - Date.now()) / 1000) : null,
  };
};

/**
 * Reset attempts after successful verification
 */
PinAttemptSchema.statics.resetAttempts = async function(userId) {
  await this.updateOne({ userId }, { attempts: 0, lockedUntil: null, lastAttemptAt: new Date() });
};

module.exports = mongoose.models.PinAttempt || mongoose.model('PinAttempt', PinAttemptSchema);
