/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// Track treasury inflows/outflows and balances
const TreasuryLedgerSchema = new mongoose.Schema({
  txHash: { type: String },
  activity: {
    type: String,
    enum: ['inflow_cash_out', 'outflow_reward', 'outflow_payout', 'burn', 'reconciliation'],
    required: true,
  },
  amount: { type: Number, required: true }, // MLCNS in base units
  direction: { type: String, enum: ['inflow', 'outflow', 'burn'], required: true },
  relatedSaleId: { type: String },
  relatedQuoteId: { type: String },
  description: { type: String },
  balance: { type: Number }, // running balance after this tx
  createdAt: { type: Date, default: Date.now },
  recordedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TreasuryLedger', TreasuryLedgerSchema);
