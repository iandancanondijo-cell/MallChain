/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

const MallcoinSaleSchema = new mongoose.Schema({
  saleId: { type: String, required: true, unique: true },
  sellerAddress: { type: String, required: true },
  amount: { type: Number, required: true }, // MLCNS sold
  phone: { type: String },
  status: { type: String, enum: ['pending', 'broadcasted', 'completed', 'failed'], default: 'pending' },
  txHash: { type: String }, // on-chain sale tx
  burnAmount: { type: Number, default: 0 }, // MLCNS burned
  burnTxHash: { type: String }, // on-chain burn tx
  treasuryAmount: { type: Number, default: 0 }, // MLCNS to treasury
  burnPercentage: { type: Number, default: 30 }, // applied burn rate
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MallcoinSale', MallcoinSaleSchema);
