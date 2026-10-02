const mongoose = require('mongoose');
const { encryptField, decryptField, blindIndex } = require('../utils/fieldEncryption');

// Phone numbers are PII — encrypted at rest like KYC fields. A blind index
// supports exact-match queries (GDPR erasure looks up by phone).
const ENCRYPTED_FIELDS = ['phone'];

// Mirrors MallcoinPurchase.js's pending -> confirmed -> credited lifecycle,
// with 'issued' as the terminal success state instead of 'credited'.
const BadgePurchaseSchema = new mongoose.Schema({
  quoteId: { type: String, required: true, unique: true },
  walletAddress: { type: String, required: true },
  phone: { type: String, required: true },
  phone_blind: { type: String },
  fiatAmount: { type: Number, required: true, default: 17 },
  currency: { type: String, default: 'KES' },
  status: {
    type: String,
    enum: ['pending', 'payment_initiated', 'confirmed', 'processing', 'issued', 'failed'],
    default: 'pending',
  },
  paymentId: { type: String },
  paymentIds: { type: [String], default: [] },
  mpesaRef: { type: String },
  badgeTxHash: { type: String },
  reason: { type: String },
}, { timestamps: true });

BadgePurchaseSchema.index({ walletAddress: 1 });
BadgePurchaseSchema.index({ status: 1 });
BadgePurchaseSchema.index({ paymentId: 1 });
BadgePurchaseSchema.index({ mpesaRef: 1 });
BadgePurchaseSchema.index({ walletAddress: 1, status: 1 });
BadgePurchaseSchema.index({ status: 1, createdAt: -1 });
BadgePurchaseSchema.index({ phone_blind: 1 });

// Synchronous, zero-argument pre-hook — Mongoose 9's Kareem middleware runner
// only recognizes this style as promise-returning-or-synchronous. Encrypts
// phone on save and populates the blind index for exact-match queries.
BadgePurchaseSchema.pre('save', function encryptPhoneOnSave() {
  if (this.isModified('phone') && this.phone != null) {
    this.phone = encryptField(this.phone);
    this.phone_blind = blindIndex(this.phone);
  }
});

/**
 * Decrypts phone on a plain object or hydrated document. Every route that
 * reads this field for display must pass its result through this before
 * sending it anywhere.
 */
function decryptBadgePurchasePhone(purchase) {
  if (!purchase) return purchase;
  const plain = typeof purchase.toObject === 'function' ? purchase.toObject() : { ...purchase };
  if (plain.phone != null) plain.phone = decryptField(plain.phone);
  return plain;
}

const BadgePurchaseModel = mongoose.model('BadgePurchase', BadgePurchaseSchema);
BadgePurchaseModel.decryptPhone = decryptBadgePurchasePhone;

module.exports = BadgePurchaseModel;
