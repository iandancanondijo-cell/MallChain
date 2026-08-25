const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Audit trail for every badge granted — how (streak/purchase/admin), to
// whom, and the resulting on-chain tx. Read by the admin Badges tab.
const BadgeIssuanceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  walletAddress: { type: String, required: true, index: true },
  method: { type: String, enum: ['streak', 'purchase', 'admin_manual'], required: true, index: true },
  badgeType: { type: String, default: 'gold' },
  txHash: { type: String },
}, { timestamps: { createdAt: 'issuedAt', updatedAt: false } });

BadgeIssuanceSchema.index({ issuedAt: -1 });
BadgeIssuanceSchema.index({ method: 1, issuedAt: -1 });

module.exports = mongoose.models.BadgeIssuance || mongoose.model('BadgeIssuance', BadgeIssuanceSchema);
