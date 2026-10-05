const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * AML Review model
 * Tracks AML (Anti-Money Laundering) screening results for users
 * Typically integrated with third-party AML providers (Sanction Scanner, Lexis Nexis, etc.)
 */
const AMLReviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // AML screening status: 'clear', 'flagged', 'under_review', 'high_risk'
  status: {
    type: String,
    enum: ['clear', 'flagged', 'under_review', 'high_risk', 'blocked'],
    default: 'clear',
    index: true
  },
  
  // Reason if flagged
  reason: { type: String },
  
  // Risk level (1-5, where 5 is highest risk)
  riskLevel: { type: Number, min: 1, max: 5, default: 1 },
  
  // Third-party screening data (typically from external AML provider)
  screeningData: Schema.Types.Mixed,
  
  // Screening provider used
  provider: { type: String, default: 'internal' }, // 'internal', 'sanction_scanner', 'lexis_nexis', etc.
  
  // Reference ID from external provider (for tracking/appeals)
  externalReferenceId: { type: String },
  
  // Timestamps
  screenedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date }, // When compliance team reviewed
  
  // Review metadata
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Admin who reviewed
  reviewNotes: { type: String },
  
  // If under manual review, who's assigned?
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Resolution
  resolution: { type: String, enum: ['approved', 'denied', 'pending'] },
  resolutionNotes: { type: String },
  
  // Does this require escalation?
  requiresEscalation: { type: Boolean, default: false },
  escalatedAt: { type: Date },
  escalatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for common queries
AMLReviewSchema.index({ userId: 1, createdAt: -1 });
AMLReviewSchema.index({ status: 1, screenedAt: -1 });
AMLReviewSchema.index({ riskLevel: 1, status: 1 });
AMLReviewSchema.index({ userId: 1, status: 1 });
AMLReviewSchema.index({ assignedTo: 1, status: 1 });
AMLReviewSchema.index({ requiresEscalation: 1, status: 1 });

// Auto-update updatedAt
AMLReviewSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.AMLReview || mongoose.model('AMLReview', AMLReviewSchema);
