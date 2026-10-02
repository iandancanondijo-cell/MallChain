/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');
const { encryptField, decryptField, blindIndex } = require('../utils/fieldEncryption');

// Phone numbers are PII — encrypted at rest like KYC fields. A blind index
// supports exact-match queries (GDPR erasure looks up by phone).
const ENCRYPTED_FIELDS = ['phone'];

const LiquidityPoolActivitySchema = new mongoose.Schema(
  {
    flow: {
      type: String,
      enum: ['buy', 'withdraw', 'reconciliation', 'mallpoints_convert'],
      required: true,
    },
    stage: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'info'],
      default: 'info',
    },
    poolId: { type: Number },
    quoteId: { type: String },
    paymentId: { type: String },
    withdrawalId: { type: String },
    saleId: { type: String },
    payoutRef: { type: String },
    walletAddress: { type: String },
    phone: { type: String },
    phone_blind: { type: String },
    currency: { type: String, default: 'KES' },
    amountMlcns: { type: Number, default: 0 },
    fiatAmount: { type: Number, default: 0 },
    lpTokens: { type: Number, default: 0 },
    creditTxHash: { type: String },
    liquidityTxHash: { type: String },
    sellTxHash: { type: String },
    burnTxHash: { type: String },
    provider: { type: String },
    providerMode: { type: String },
    note: { type: String },
    reason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    recordedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Add indexes for common query patterns
LiquidityPoolActivitySchema.index({ flow: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ status: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ walletAddress: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ phone_blind: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ quoteId: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ saleId: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ withdrawalId: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ paymentId: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ poolId: 1, createdAt: -1 });
LiquidityPoolActivitySchema.index({ creditTxHash: 1 });
LiquidityPoolActivitySchema.index({ liquidityTxHash: 1 });
LiquidityPoolActivitySchema.index({ sellTxHash: 1 });
LiquidityPoolActivitySchema.index({ burnTxHash: 1 });
LiquidityPoolActivitySchema.index({ flow: 1, status: 1 });
LiquidityPoolActivitySchema.index({ recordedAt: -1 });

// Synchronous, zero-argument pre-hook — Mongoose 9's Kareem middleware runner
// only recognizes this style as promise-returning-or-synchronous. Encrypts
// phone on save and populates the blind index for exact-match queries.
LiquidityPoolActivitySchema.pre('save', function encryptPhoneOnSave() {
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
function decryptLiquidityPoolActivityPhone(activity) {
  if (!activity) return activity;
  const plain = typeof activity.toObject === 'function' ? activity.toObject() : { ...activity };
  if (plain.phone != null) plain.phone = decryptField(plain.phone);
  return plain;
}

const LiquidityPoolActivityModel = mongoose.model('LiquidityPoolActivity', LiquidityPoolActivitySchema);
LiquidityPoolActivityModel.decryptPhone = decryptLiquidityPoolActivityPhone;

module.exports = LiquidityPoolActivityModel;
