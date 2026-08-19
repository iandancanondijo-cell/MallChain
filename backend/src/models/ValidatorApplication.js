const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ValidatorApplicationSchema = new Schema({
  // The logged-in account that submitted this (auth middleware sets req.user
  // at apply-time) — lets us notify the applicant on review without having
  // to reverse-map a chain address back to an account (no such mapping exists).
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  applicantAddress: { type: String, required: true, index: true },
  validatorAddress: { type: String, default: '' },
  moniker: { type: String, required: true },
  website: { type: String, default: '' },
  details: { type: String, default: '' },
  selfDelegationAmount: { type: String, default: '0' },
  denom: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  // Despite the name, this is an off-chain review-eligibility flag, not
  // proof of real on-chain validator bonding: it's set purely by admin
  // review (routes/adminPanel.js) and is what routes/taskAssignment.js
  // uses to pick the mines task-review reviewer pool — a separate,
  // intentionally off-chain system (see models/MinesReviewer.js). Real
  // chain bonding happens independently via the applicant's own signed
  // MsgCreateValidator self-bond (mallchain-os-v14/src/services/validatorCreateTx.ts)
  // and is NOT reflected here. Use getMyApplication's `onChainBonded`
  // field (controllers/validatorController.js) for actual chain state.
  isActiveValidator: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewer: { type: String, default: '' },
  reviewNotes: { type: String, default: '' },
}, {
  timestamps: true,
});

ValidatorApplicationSchema.index({ status: 1, submittedAt: -1 });
ValidatorApplicationSchema.index({ validatorAddress: 1 });

module.exports = mongoose.model('ValidatorApplication', ValidatorApplicationSchema);
