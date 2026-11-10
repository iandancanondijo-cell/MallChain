const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * One application to one opening by one account. The unique index is the
 * duplicate guard: the route also answers a friendly 409, but the index is
 * what stops two concurrent clicks from creating two records.
 */
const JobApplicationSchema = new Schema({
  openingId: { type: Schema.Types.ObjectId, ref: 'JobOpening', required: true, index: true },
  applicantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['submitted', 'shortlisted', 'rejected', 'hired', 'withdrawn'],
    default: 'submitted',
  },
  respondedAt: { type: Date, default: null },
  authorNote: { type: String, default: '' },
}, { timestamps: true });

JobApplicationSchema.index({ openingId: 1, applicantId: 1 }, { unique: true });
JobApplicationSchema.index({ applicantId: 1, createdAt: -1 });

module.exports = mongoose.models.JobApplication || mongoose.model('JobApplication', JobApplicationSchema);
