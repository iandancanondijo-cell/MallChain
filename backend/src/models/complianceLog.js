const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Compliance Log model
 * Audit trail for all compliance events (age verification, KYC submission, terms acceptance, etc.)
 * Required for regulatory reporting and user audit trails
 */
const ComplianceLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Event type: 'age_verification', 'tos_acceptance', 'kyc_submission', 'aml_screening', etc.
  eventType: {
    type: String,
    enum: [
      'age_verification',
      'terms_acceptance',
      'kyc_submission',
      'aml_screening',
      'geographic_restriction',
      'account_freeze',
      'compliance_check',
      'manual_review',
      'escalation',
      'resolution'
    ],
    required: true,
    index: true
  },
  
  // Event status
  status: {
    type: String,
    enum: ['initiated', 'success', 'failed', 'flagged', 'accepted', 'rejected', 'pending'],
    default: 'initiated',
    index: true
  },
  
  // Human-readable description
  description: String,
  
  // Metadata (flexible for different event types)
  metadata: Schema.Types.Mixed,
  
  // Required compliance fields for audit
  ipAddress: { type: String }, // User's IP at time of event
  userAgent: { type: String }, // Browser/client info
  
  // Geographic data (from IP)
  country: { type: String },
  
  // Regulatory references
  regulatoryBasis: String, // e.g., "GDPR", "FinCEN", "KYC_AML", etc.
  
  // Who initiated (if applicable)
  initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Could be admin or system
  
  // Action taken
  actionTaken: String,
  
  // Result/notes
  result: String,
  resultData: Schema.Types.Mixed,
  
  // Linked records
  relatedSubmissionId: { type: Schema.Types.ObjectId }, // Link to KYC/AML submission if applicable
  
  // Timestamp
  createdAt: { type: Date, default: Date.now, index: true },
  
  // TTL: Compliance logs older than 7 years may be deleted (regulatory retention)
  // This TTL index will automatically delete documents 7 years after creation
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
    index: { expireAfterSeconds: 0 }
  }
});

// Indexes for compliance queries and auditing
ComplianceLogSchema.index({ userId: 1, createdAt: -1 });
ComplianceLogSchema.index({ eventType: 1, createdAt: -1 });
ComplianceLogSchema.index({ status: 1, eventType: 1 });
ComplianceLogSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
ComplianceLogSchema.index({ createdAt: -1 }); // For compliance reports
ComplianceLogSchema.index({ regulatoryBasis: 1, createdAt: -1 });
ComplianceLogSchema.index({ country: 1, eventType: 1 });

module.exports = mongoose.models.ComplianceLog || mongoose.model('ComplianceLog', ComplianceLogSchema);
