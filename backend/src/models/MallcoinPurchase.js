/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');
const { encryptField, decryptField, blindIndex } = require('../utils/fieldEncryption');

// Phone numbers are PII — encrypted at rest like KYC fields. A blind index
// supports exact-match queries (GDPR erasure looks up by phone).
const ENCRYPTED_FIELDS = ['phone'];

const MallcoinPurchaseSchema = new mongoose.Schema({
  quoteId: { type: String, required: true, unique: true },
  walletAddress: { type: String, required: true },
  amount: { type: Number, required: true }, // MLCNS
  fiatAmount: { type: Number, required: true },
  currency: { type: String, default: 'KES' },
  phone: { type: String, required: true },
  phone_blind: { type: String },
  status: { type: String, enum: ['pending', 'payment_initiated', 'confirmed', 'processing', 'credited', 'failed'], default: 'pending' },
  paymentId: { type: String },
  paymentIds: { type: [String], default: [] },
  mpesaRef: { type: String },
  txHash: { type: String }, // blockchain tx hash
  liquidityAdded: { type: Boolean, default: false },
  lpTokens: { type: Number, default: 0 },
  liquidityPoolId: { type: Number },
  liquidityError: { type: String },
  reason: { type: String }, // failure reason
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, // 10 min
});

// Add indexes for common query patterns
MallcoinPurchaseSchema.index({ walletAddress: 1 })
MallcoinPurchaseSchema.index({ status: 1 })
MallcoinPurchaseSchema.index({ phone_blind: 1 })
MallcoinPurchaseSchema.index({ paymentId: 1 })
MallcoinPurchaseSchema.index({ mpesaRef: 1 })
MallcoinPurchaseSchema.index({ txHash: 1 })
MallcoinPurchaseSchema.index({ createdAt: -1 })
MallcoinPurchaseSchema.index({ expiresAt: 1 })
MallcoinPurchaseSchema.index({ walletAddress: 1, status: 1 })
MallcoinPurchaseSchema.index({ status: 1, createdAt: -1 })

// Synchronous, zero-argument pre-hook — Mongoose 9's Kareem middleware runner
// only recognizes this style as promise-returning-or-synchronous. Encrypts
// phone on save and populates the blind index for exact-match queries.
MallcoinPurchaseSchema.pre('save', function encryptPhoneOnSave() {
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
function decryptMallcoinPurchasePhone(purchase) {
  if (!purchase) return purchase;
  const plain = typeof purchase.toObject === 'function' ? purchase.toObject() : { ...purchase };
  if (plain.phone != null) plain.phone = decryptField(plain.phone);
  return plain;
}

const MallcoinPurchaseModel = mongoose.model('MallcoinPurchase', MallcoinPurchaseSchema);
MallcoinPurchaseModel.decryptPhone = decryptMallcoinPurchasePhone;

module.exports = MallcoinPurchaseModel;
