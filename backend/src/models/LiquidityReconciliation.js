/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// Track failed or incomplete liquidity add attempts for reconciliation
const LiquidityReconciliationSchema = new mongoose.Schema({
  purchaseId: { type: String, required: true, unique: true },
  quoteId: { type: String },
  creditTxHash: { type: String, required: true }, // credit succeeded but liq add failed
  walletAddress: { type: String, required: true },
  mlcnsAmount: { type: Number, required: true },
  fiatAmount: { type: Number, required: true },
  reason: { type: String }, // error message from failed liquidity add
  status: { type: String, enum: ['detected', 'compensating', 'resolved'], default: 'detected' },
  compensationTx: { type: String }, // tx hash of compensation (e.g., refund or rollback)
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
});

module.exports = mongoose.model('LiquidityReconciliation', LiquidityReconciliationSchema);
