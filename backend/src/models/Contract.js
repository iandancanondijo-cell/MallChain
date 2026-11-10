const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// A contract record is metadata for a real wasm instance deployed by its owner
// (see routes/contracts.js and the client-side signing in the SPA), plus the
// two-party sharing state: an owner names one counterparty, who then reads and
// accepts the offer before they may record executions against it.
const ContractSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  code: { type: String, required: true },
  description: { type: String, default: '' },
  address: { type: String, required: true },
  deployedAt: { type: Date, default: Date.now },
  txs: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },

  // Sharing. counterpartyAddress is the string the owner typed; counterpartyUserId
  // is the account that actually has that wallet linked, which is the id every
  // authorization check below uses. '' offerStatus means never shared.
  counterpartyAddress: { type: String, default: '' },
  counterpartyUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  offerStatus: {
    type: String,
    enum: ['', 'offered', 'accepted', 'declined', 'revoked'],
    default: '',
  },
  offerNote: { type: String, default: '' },
  offeredAt: { type: Date, default: null },
  respondedAt: { type: Date, default: null },
});

ContractSchema.index({ userId: 1, deployedAt: -1 });
ContractSchema.index({ counterpartyUserId: 1, offerStatus: 1 });

module.exports = mongoose.models.Contract || mongoose.model('Contract', ContractSchema);
