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
  // When approved, set to true to indicate validator is active
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
