const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Simulated smart-contract records — there's no real wasm upload pipeline in
// this repo, so deploy/interact are simulated (see routes/contracts.js), but
// the records themselves are real and persist per user.
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
});

ContractSchema.index({ userId: 1, deployedAt: -1 });

module.exports = mongoose.models.Contract || mongoose.model('Contract', ContractSchema);
