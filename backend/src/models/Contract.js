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
  // Null means "this record has no contract on-chain behind it" — which is the
  // honest state for a deployment whose MsgInstantiateContract was never
  // broadcast (or never confirmed). The route used to substitute a random
  // 0x-prefixed string here, which was indistinguishable from a real address in
  // the list, could be pasted into a transfer, and read as proof of a deploy
  // that had not happened. Absence is now stored as absence.
  address: { type: String, default: null },
  // The hash of the transaction that actually created (or last executed) this
  // contract. This field was missing from the schema entirely, so mongoose
  // strict mode silently dropped whatever /deploy was given — a real
  // instantiate txHash was recorded nowhere, and the UI's "tx:" line could never
  // render. Declared here so a genuine hash survives the round trip.
  txHash: { type: String, default: null },
  deployedAt: { type: Date, default: Date.now },
  // Number of executions the chain confirmed. Only /interact with a real
  // txHash moves it — a call that broadcast nothing must not inflate a count
  // that users read as on-chain activity.
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
