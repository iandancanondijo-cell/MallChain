/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// System-generated anti-structuring flag: raised when a wallet's completed
// withdrawals within a rolling 7-day window sum to
// AML_WITHDRAWAL_THRESHOLD_KES or more even though no single withdrawal
// crossed it (see withdrawalAmlGateService.js's checkAndFlagStructuring()).
// Deliberately a separate model from WithdrawalAmlReview: this has no user
// submission or document, and is admin-*acknowledged* rather than
// approved/rejected — forcing both into one schema/lifecycle would produce
// an awkward dual-purpose status enum. Never blocks a withdrawal on its own.
const WithdrawalStructuringFlagSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, index: true },
  windowStartAt: { type: Date, required: true },
  windowEndAt: { type: Date, required: true },
  cumulativeKes: { type: Number, required: true },
  relatedWithdrawalIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest' }],
  acknowledged: { type: Boolean, default: false },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: { type: Date },
}, {
  timestamps: true,
});

// Upserted (not duplicated) per rolling-window crossing.
WithdrawalStructuringFlagSchema.index({ walletAddress: 1, windowStartAt: 1 }, { unique: true });
WithdrawalStructuringFlagSchema.index({ acknowledged: 1, createdAt: -1 });

module.exports = mongoose.models.WithdrawalStructuringFlag
  || mongoose.model('WithdrawalStructuringFlag', WithdrawalStructuringFlagSchema);
