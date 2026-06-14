/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// Track idempotent credit requests by key
const IdempotencyKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // client-provided unique key
  walletAddress: { type: String, required: true },
  amount: { type: Number, required: true },
  result: {
    txHash: { type: String },
    balance: { type: Number },
    transfer: { type: mongoose.Schema.Types.Mixed },
  },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  error: { type: String },
  createdAt: { type: Date, default: Date.now, index: { expires: 86400 } }, // auto-expire after 24h
});

module.exports = mongoose.model('IdempotencyKey', IdempotencyKeySchema);
