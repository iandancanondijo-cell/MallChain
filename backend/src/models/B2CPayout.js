/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// Track B2C (Business-to-Consumer) payouts to sellers
const B2CPayoutSchema = new mongoose.Schema({
  saleId: { type: String, required: true, unique: true },
  sellerPhone: { type: String, required: true },
  sellerAddress: { type: String, required: true },
  amount: { type: Number, required: true }, // MLCNS sold
  pesaAmount: { type: Number }, // KES to transfer (calculated from price)
  txHash: { type: String }, // on-chain sale tx hash
  payoutStatus: { type: String, enum: ['pending', 'initiated', 'succeeded', 'failed'], default: 'pending' },
  payoutRef: { type: String }, // M-Pesa B2C reference
  payoutResult: { type: mongoose.Schema.Types.Mixed },
  payoutError: { type: String },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
  payoutAttemptedAt: { type: Date },
});

module.exports = mongoose.model('B2CPayout', B2CPayoutSchema);
