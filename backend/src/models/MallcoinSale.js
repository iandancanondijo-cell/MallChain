/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../utils/fieldEncryption');

// A held signed transaction is at least as sensitive as KYC PII — anyone who
// obtains it can broadcast it verbatim — so it's encrypted at rest the same
// way, not just stored as plaintext because it "looks like" opaque base64.
const ENCRYPTED_FIELDS = ['pendingTxBytes'];

const MallcoinSaleSchema = new mongoose.Schema({
  saleId: { type: String, required: true, unique: true },
  sellerAddress: { type: String, required: true },
  amount: { type: Number, required: true }, // MLCNS sold
  phone: { type: String },
  status: {
    type: String,
    // queued_liquidity/resign_required: held, unbroadcast — see
    // pendingTxBytes below and withdrawalLiquidityQueueService.js.
    enum: ['pending', 'broadcasted', 'completed', 'failed', 'queued_liquidity', 'resign_required'],
    default: 'pending',
  },
  txHash: { type: String }, // on-chain sale tx
  burnAmount: { type: Number, default: 0 }, // MLCNS burned
  burnTxHash: { type: String }, // on-chain burn tx
  treasuryAmount: { type: Number, default: 0 }, // MLCNS to treasury
  burnPercentage: { type: Number, default: 30 }, // applied burn rate
  reason: { type: String },
  // The client-signed tx bytes held while queued_liquidity — decrypted and
  // broadcast once withdrawalLiquidityQueueService.js releases this sale.
  // Cleared back to null once actually broadcast (successfully or not);
  // no reason to retain a spent signed blob.
  pendingTxBytes: { type: String, default: null },
  pendingTxBytesSetAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Add indexes for common query patterns
MallcoinSaleSchema.index({ sellerAddress: 1 })
MallcoinSaleSchema.index({ status: 1 })
MallcoinSaleSchema.index({ phone: 1 })
MallcoinSaleSchema.index({ txHash: 1 })
MallcoinSaleSchema.index({ burnTxHash: 1 })
MallcoinSaleSchema.index({ createdAt: -1 })
MallcoinSaleSchema.index({ sellerAddress: 1, status: 1 })
MallcoinSaleSchema.index({ status: 1, createdAt: -1 })

// Synchronous, zero-argument pre-hook — Mongoose 9's Kareem middleware runner
// only recognizes this style as promise-returning-or-synchronous. A
// `function(next)` param here throws "next is not a function" the moment a
// real .save() runs (see the identical fix + comment in models/kyc.js).
MallcoinSaleSchema.pre('save', function encryptPendingTxBytesOnSave() {
  for (const field of ENCRYPTED_FIELDS) {
    if (this.isModified(field) && this[field] != null) {
      this[field] = encryptField(this[field]);
    }
  }
});

/** Decrypts pendingTxBytes on a hydrated document or a .lean() plain object. */
function decryptPendingTxBytes(sale) {
  if (!sale || sale.pendingTxBytes == null) return sale?.pendingTxBytes ?? null;
  return decryptField(sale.pendingTxBytes);
}

const MallcoinSaleModel = mongoose.model('MallcoinSale', MallcoinSaleSchema);
MallcoinSaleModel.decryptPendingTxBytes = decryptPendingTxBytes;

module.exports = MallcoinSaleModel;
