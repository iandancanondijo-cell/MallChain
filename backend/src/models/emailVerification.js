const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * One email-address challenge: changing the primary address, confirming the
 * address a signup was made with, or attaching a backup address for recovery.
 *
 * Two things this record deliberately does NOT hold, both learned the hard way:
 *
 * - The code itself. The previous schema stored `verificationCode` in plain
 *   text next to its hash (with a unique index on the plaintext), so any read
 *   of this collection — a backup, an operator query, a leaked replica — handed
 *   over live, unexpired challenges. Only the SHA-256 of the code is stored
 *   now, and `select: false` keeps even that out of an ordinary query, so a
 *   route that serialises the document cannot leak it by accident.
 *
 * - A single code shared by two addresses. The email-change flow used to send
 *   the SAME code to the current and the new address, which made its
 *   "verify your current email, then verify the new one" dance one factor
 *   wearing two hats: whoever received either message could complete both
 *   steps. `currentCodeHash` and `newCodeHash` are separate secrets, and each
 *   step only ever checks its own.
 */
const EmailVerificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // What the challenge is for. This is not decoration: a `backup` record used
  // to satisfy the `change` flow's queries, which filtered on status alone, so
  // verifying a code sent to an attacker-chosen backup address completed a
  // primary-email change. Every read now filters on purpose as well as status.
  purpose: {
    type: String,
    enum: ['change', 'backup', 'signup'],
    default: 'change',
    index: true,
  },

  // Email change request details. For `signup` both are the account's own
  // address; for `backup`, `currentEmail` is the primary at the time.
  currentEmail: { type: String, required: true },
  newEmail: { type: String, required: true },

  // Challenges. A single-step purpose (`backup`, `signup`) sets newCodeHash
  // only, and its verify route reads only that field.
  currentCodeHash: { type: String, select: false },
  newCodeHash: { type: String, select: false },
  codeExpiry: { type: Date, required: true },

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'current-verified', 'new-verified', 'completed', 'expired', 'rejected'],
    default: 'pending',
    index: true,
  },

  // When each half of a two-step change was confirmed
  currentEmailVerifiedAt: Date,
  newEmailVerifiedAt: Date,

  // Attempts — five wrong guesses burn a challenge. Without a counter a
  // 6-digit code is guessable by script inside its own lifetime.
  attempts: {
    currentEmailAttempts: { type: Number, default: 0, max: 5 },
    newEmailAttempts: { type: Number, default: 0, max: 5 },
  },

  // Timing
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: true }, // TTL: 24 hours
  completedAt: Date,

  // Audit trail
  ipAddress: String, // IP that initiated the change
  userAgent: String, // Browser/device that initiated the change
  reason: String, // Why the user is changing email (optional)
});

EmailVerificationSchema.index({ userId: 1, purpose: 1, status: 1 });
EmailVerificationSchema.index({ userId: 1, createdAt: -1 });
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.EmailVerification ||
  mongoose.model('EmailVerification', EmailVerificationSchema);
