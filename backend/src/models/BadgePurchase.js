const mongoose = require('mongoose');

// Mirrors MallcoinPurchase.js's pending -> confirmed -> credited lifecycle,
// with 'issued' as the terminal success state instead of 'credited'.
const BadgePurchaseSchema = new mongoose.Schema({
  quoteId: { type: String, required: true, unique: true },
  walletAddress: { type: String, required: true },
  phone: { type: String, required: true },
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

module.exports = mongoose.models.BadgePurchase || mongoose.model('BadgePurchase', BadgePurchaseSchema);
