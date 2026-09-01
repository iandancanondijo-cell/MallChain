/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../utils/fieldEncryption');

// Enhanced-due-diligence submission for a single withdrawal attempt that
// crossed AML_WITHDRAWAL_THRESHOLD_KES (see withdrawalAmlGateService.js).
// Distinct from services/amlProvider.js's account-level sanctions/PEP
// screening (run once, at KYC time) — this is a transaction-level check,
// resolved BEFORE the user signs anything (see routes/withdrawalAml.js and
// buy.js's /sell handler), so approval never needs to hold a live signed tx.
const ENCRYPTED_FIELDS = ['narrative'];

const NATIVE_EARNINGS_SOURCES = ['mining_staking_rewards', 'mallpoints_conversion', 'referral_bonus'];

const WithdrawalAmlReviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  walletAddress: { type: String, required: true, index: true },
  triggerAmountKes: { type: Number, required: true },
  fundsSource: {
    type: String,
    enum: [
      'mining_staking_rewards', 'mallpoints_conversion', 'referral_bonus',
      'salary', 'business_income', 'gift', 'asset_sale', 'other',
    ],
    required: true,
  },
  // Derived server-side from fundsSource at submission time — never trust a
  // client-supplied boolean for something this decision-relevant.
  isNativeEarnings: { type: Boolean, required: true },
  narrative: { type: String, required: true }, // encrypted
  documentRef: { type: String, default: null }, // required unless isNativeEarnings — enforced in Joi
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // Single-use: once an approved review is linked to a withdrawal, it can't
  // cover a different, later withdrawal attempt — each qualifying attempt
  // gets its own review rather than a time-windowed "good for N days" pass,
  // which would leave the exact amount/date range it covers ambiguous.
  consumedByWithdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest', default: null },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: { type: String },
});

WithdrawalAmlReviewSchema.index({ walletAddress: 1, status: 1 });
WithdrawalAmlReviewSchema.index({ status: 1, submittedAt: 1 });

WithdrawalAmlReviewSchema.pre('save', function encryptNarrativeOnSave() {
  for (const field of ENCRYPTED_FIELDS) {
    if (this.isModified(field) && this[field] != null) {
      this[field] = encryptField(this[field]);
    }
  }
});

/** Decrypts the narrative on a hydrated document or a .lean() plain object. */
function decryptAmlPii(review) {
  if (!review) return review;
  const plain = typeof review.toObject === 'function' ? review.toObject() : { ...review };
  for (const field of ENCRYPTED_FIELDS) {
    if (plain[field] != null) plain[field] = decryptField(plain[field]);
  }
  return plain;
}

const WithdrawalAmlReviewModel = mongoose.models.WithdrawalAmlReview
  || mongoose.model('WithdrawalAmlReview', WithdrawalAmlReviewSchema);
WithdrawalAmlReviewModel.decryptAmlPii = decryptAmlPii;
WithdrawalAmlReviewModel.NATIVE_EARNINGS_SOURCES = NATIVE_EARNINGS_SOURCES;

module.exports = WithdrawalAmlReviewModel;
