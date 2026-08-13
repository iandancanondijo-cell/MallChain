/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

const LiquidityPoolActivitySchema = new mongoose.Schema(
  {
    flow: {
      type: String,
      enum: ['buy', 'withdraw', 'reconciliation'],
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
LiquidityPoolActivitySchema.index({ phone: 1, createdAt: -1 });
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

module.exports = mongoose.model('LiquidityPoolActivity', LiquidityPoolActivitySchema);
