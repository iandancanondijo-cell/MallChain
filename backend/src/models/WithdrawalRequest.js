/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

const WithdrawalRequestSchema = new mongoose.Schema({
  withdrawalId: { type: String, required: true, unique: true },
  walletAddress: { type: String, required: true },
  phone: { type: String, required: true },
  amountMlcns: { type: Number, required: true },
  amountKes: { type: Number, required: true },
  currency: { type: String, default: 'KES' },
  status: {
    type: String,
    enum: ['pending_review', 'payout_initiated', 'completed', 'failed'],
    default: 'pending_review',
  },
  payoutProvider: { type: String, default: 'mpesa' },
  payoutRef: { type: String },
  settlementMode: { type: String, enum: ['review', 'signed_sell'], default: 'review' },
  saleId: { type: String },
  sellTxHash: { type: String },
  burnTxHash: { type: String },
  notes: { type: String },
}, {
  timestamps: true,
});

// Add indexes for common query patterns
WithdrawalRequestSchema.index({ walletAddress: 1 })
WithdrawalRequestSchema.index({ phone: 1 })
WithdrawalRequestSchema.index({ status: 1 })
WithdrawalRequestSchema.index({ payoutRef: 1 })
WithdrawalRequestSchema.index({ saleId: 1 })
WithdrawalRequestSchema.index({ sellTxHash: 1 })
WithdrawalRequestSchema.index({ burnTxHash: 1 })
WithdrawalRequestSchema.index({ createdAt: -1 })
WithdrawalRequestSchema.index({ walletAddress: 1, status: 1 })
WithdrawalRequestSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
