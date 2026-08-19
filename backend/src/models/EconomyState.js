const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Singleton document (fixed _id) tracking one-way economic gates. Once the
// MLCN/KES liquidity pool (id 2) has ever reached the direct-buy threshold,
// fiat->MLCNS buying is permanently disabled — even if the pool's KES
// reserve later drops — so this must be durable state, not a live
// recompute-each-time threshold check.
const EconomyStateSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  directBuyLocked: { type: Boolean, default: false },
  directBuyLockedAt: { type: Date, default: null },
  poolKesReserveAtLock: { type: Number, default: null },
}, {
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

module.exports = mongoose.models.EconomyState || mongoose.model('EconomyState', EconomyStateSchema);
