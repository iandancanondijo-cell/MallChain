const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EmailVerificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Email change request details
  currentEmail: { type: String, required: true },
  newEmail: { type: String, required: true },
  
  // Verification codes
  verificationCode: { type: String, required: true, unique: true },
  verificationCodeHash: { type: String, required: true }, // SHA256 hashed code
  verificationCodeExpiry: { type: Date, required: true },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'current-verified', 'new-verified', 'completed', 'expired', 'rejected'],
    default: 'pending',
    index: true,
  },
  
  // Verification attempts
  currentEmailVerifiedAt: Date, // When user verified current email
  newEmailVerifiedAt: Date, // When user verified new email
  
  // Timing
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: true }, // TTL: 24 hours
  completedAt: Date,
  
  // Additional metadata
  ipAddress: String, // IP that initiated the change
  userAgent: String, // Browser/device that initiated change
  reason: String, // Why user is changing email (optional)
  
  // Backup email (separate field for recovery)
  isBackupEmail: { type: Boolean, default: false },
  
  // Audit trail
  attempts: {
    currentEmailAttempts: { type: Number, default: 0, max: 5 },
    newEmailAttempts: { type: Number, default: 0, max: 5 },
  },
});

// Indexes
EmailVerificationSchema.index({ userId: 1, status: 1 });
EmailVerificationSchema.index({ userId: 1, createdAt: -1 });
EmailVerificationSchema.index({ verificationCodeHash: 1 });
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: 24 hours
EmailVerificationSchema.index({ newEmail: 1 }); // Prevent duplicate email registrations

module.exports = mongoose.models.EmailVerification ||
  mongoose.model('EmailVerification', EmailVerificationSchema);
