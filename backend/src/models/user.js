const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { encryptField, decryptField, blindIndex } = require('../utils/fieldEncryption');

// Fields encrypted at rest with AES-256-GCM (see utils/fieldEncryption.js).
// email and walletAddress also have deterministic blind-index fields
// (email_blind, walletAddress_blind) for exact-match lookups — blind indexes
// use a separate HMAC key so recovering the index key doesn't decrypt data.
// Phone has no blind index because no code path queries User by phone, but
// it's encrypted for consistency with the other financial models.
const ENCRYPTED_FIELDS = ['email', 'phone', 'walletAddress'];

const UserSchema = new Schema({
  // Auth — email is encrypted at rest; email_blind holds a deterministic
  // HMAC for exact-match lookups (login, registration duplicate check).
  // The unique constraint moved from email → email_blind.
  email: { type: String, required: true },
  email_blind: { type: String, unique: true, sparse: true },
  password: { type: String, select: false },
  googleId: { type: String },

  // Roles & moderation
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user', index: true },
  banned: { type: Boolean, default: false },
  banReason: { type: String },

  // Profile (used by mines / task system)
  name: { type: String },
  username: { type: String },
  phone: { type: String },
  phone_blind: { type: String, sparse: true },
  creator_level: { type: Number, default: 0 },

  // The on-chain wallet this account has linked (see POST /api/auth/link-wallet).
  // Wallets are otherwise purely client-side/self-custodied — this is the
  // only place a login identity is associated with an address, needed so
  // the badge snapshot job knows which address to issue a badge to.
  // Encrypted at rest like email; walletAddress_blind for exact-match lookups.
  walletAddress: { type: String },
  walletAddress_blind: { type: String, sparse: true },

  // Balances
  mlpts_balance: { type: Number, default: 0, min: 0 },
  mallcoin_balance: { type: Number, default: 0, min: 0 },

  // Activity / reputation
  streak_count: { type: Number, default: 0 },
  tasks_completed: { type: Number, default: 0 },
  rank_points: { type: Number, default: 0 },

  // Fraud tracking
  fraud_strikes: { type: Number, default: 0 },
  fraud_status: { type: String, enum: ['clear', 'warned', 'suspended', 'banned'], default: 'clear' },

  // KYC: 1 = unverified/pending, 2 = approved. Set by kycController on a low-risk KYC decision.
  kycLevel: { type: Number, default: 1 },

  // Referrals
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referralClaimed: { type: Number, default: 0 },

  // Timestamps
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },

  // Set by services/gdprService.js on a self-service erasure request. The
  // account is anonymized in place rather than deleted outright — deleting
  // the document would orphan every `ref: 'User'` elsewhere (KYC.reviewedBy,
  // referredBy on OTHER users' accounts, AuditLog history, etc.) and break
  // the referral tree. banned:true is also forced at erasure time as a
  // second, independent guard against ever logging into an erased account.
  erasedAt: { type: Date },
});

// Add additional indexes for common query patterns
// NOTE: the old indexes { email: 1 } (unique), { phone: 1 } (sparse), and
// { walletAddress: 1 } (sparse) were replaced by blind-index equivalents
// below when PII encryption was added. A production migration must drop
// the old indexes first — `db.users.dropIndex('email_1')`, etc. — before
// Mongoose can create the new ones via syncIndexes().
UserSchema.index({ googleId: 1 }, { sparse: true })
UserSchema.index({ email_blind: 1 }, { unique: true, sparse: true })
UserSchema.index({ phone_blind: 1 }, { sparse: true })
UserSchema.index({ walletAddress_blind: 1 }, { sparse: true })
UserSchema.index({ username: 1 }, { sparse: true })
UserSchema.index({ banned: 1 })
UserSchema.index({ fraud_status: 1 })
UserSchema.index({ createdAt: -1 })
UserSchema.index({ lastLoginAt: -1 })
UserSchema.index({ role: 1, banned: 1 })
UserSchema.index({ fraud_status: 1, banned: 1 })

// Encrypt PII fields before writing to the database. Also computes
// deterministic blind indexes for email and walletAddress so exact-match
// queries can still work without decrypting every record.
//
// Blind indexes are computed from the PLAINTEXT value BEFORE encrypting,
// since encryption overwrites the field with ciphertext.
//
// Synchronous, zero-argument form — Mongoose 9's Kareem middleware runner
// detects this as a sync-or-promise hook and does not pass a `next`
// callback (see the same pattern in models/kyc.js for the full rationale).
UserSchema.pre('save', function encryptPiiOnSave() {
  // 1. Blind indexes first (plaintext still available)
  if (this.isModified('email') && this.email != null) {
    this.email_blind = blindIndex(this.email.toLowerCase().trim());
  } else if (this.email == null) {
    this.email_blind = undefined;
  }
  if (this.isModified('walletAddress') && this.walletAddress != null) {
    this.walletAddress_blind = blindIndex(this.walletAddress);
  } else if (this.walletAddress == null) {
    this.walletAddress_blind = undefined;
  }
  if (this.isModified('phone') && this.phone != null) {
    this.phone_blind = blindIndex(this.phone);
  } else if (this.phone == null) {
    this.phone_blind = undefined;
  }
  // 2. Encrypt after (overwrites plaintext with ciphertext)
  for (const field of ENCRYPTED_FIELDS) {
    if (this.isModified(field) && this[field] != null) {
      this[field] = encryptField(this[field]);
    }
  }
});

/**
 * Decrypts PII fields on a plain object (from `.lean()`) or a hydrated
 * document. Every route that reads email/phone/walletAddress for display
 * or downstream querying must pass results through this first.
 */
function decryptUserPii(user) {
  if (!user) return user;
  const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  for (const field of ENCRYPTED_FIELDS) {
    if (plain[field] != null) plain[field] = decryptField(plain[field]);
  }
  return plain;
}

const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
UserModel.decryptUserPii = decryptUserPii;
module.exports = UserModel;
