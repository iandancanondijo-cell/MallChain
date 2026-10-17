const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReportSchema = new Schema({
  // The category admin who submitted this report. Self-references back to
  // User so a category admin sees only their own sends and a superadmin
  // sees every report in the system.
  fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Snapshot of the sender's adminCategory at submission time. Snapshotted
  // rather than read off req.user at render time so an admin who later
  // gets reassigned still has their historical reports labelled correctly.
  fromCategory: {
    type: String,
    enum: ['users', 'blockchain', 'validator', 'kyc', 'mining', 'treasury', 'marketplace', 'mlpts', 'reports'],
    required: true,
  },

  subject: { type: String, required: true, maxlength: 200, trim: true },
  body: { type: String, required: true, maxlength: 5000, trim: true },

  // Lifecycle:
  //   sent     — created, nobody has opened it yet
  //   read     — a superadmin opened it (sender-side colour → blue)
  //   actioned — a superadmin marked it for action (sender-side colour → green)
  //
  // These transitions are append-only timestamps so a category admin can
  // see when the superadmin became aware of their report.
  status: {
    type: String,
    enum: ['sent', 'read', 'actioned'],
    default: 'sent',
    index: true,
  },
  readAt: { type: Date },
  actionedAt: { type: Date },

  // A short note from the superadmin explaining what they're going to do
  // (or already did). Optional at every stage; superadmin can edit until
  // they mark actioned.
  superadminReply: { type: String, maxlength: 1000, trim: true },
  repliedAt: { type: Date },

  createdAt: { type: Date, default: Date.now, index: true },
});

// Superadmin inbox query is "the newest reports across all categories,
// un-actioned first". The compound index covers that exact shape.
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ fromUserId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);