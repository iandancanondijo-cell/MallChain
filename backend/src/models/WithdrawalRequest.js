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
    enum: [
      'pending_review', 'payout_initiated', 'completed', 'failed', 'refunded',
      // queued_liquidity/resign_required: the signed sell tx is held (see
      // MallcoinSale.pendingTxBytes) — nothing has broadcast yet, so the
      // user's MLCNS hasn't moved. aml_rejected: the compliance declaration
      // was rejected before the user ever signed anything (see
      // withdrawalAmlGateService.js — AML is resolved before signing).
      'queued_liquidity', 'resign_required', 'aml_rejected',
    ],
    default: 'pending_review',
  },
  payoutProvider: { type: String, default: 'mpesa' },
  payoutRef: { type: String },
  settlementMode: { type: String, enum: ['review', 'signed_sell'], default: 'review' },
  saleId: { type: String },
  sellTxHash: { type: String },
  burnTxHash: { type: String },
  notes: { type: String },
  // Set on entering queued_liquidity and kept as-is across a resign — the
  // queue position reflects when the user first joined the queue, not when
  // their last (re-)signed transaction happened to arrive.
  queuedAt: { type: Date },
  amlReviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalAmlReview' },
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
// FIFO scan of the liquidity-hold queue (withdrawalLiquidityQueueService.js).
WithdrawalRequestSchema.index({ status: 1, queuedAt: 1 })
// Rolling-window rate-limit/structuring queries (withdrawalRateLimitService.js,
// withdrawalAmlGateService.js) — both scan "this wallet's requests since N days ago".
WithdrawalRequestSchema.index({ walletAddress: 1, createdAt: -1 })

module.exports = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
