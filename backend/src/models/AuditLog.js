const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actor: { type: String, required: true }, // userId or system identifier
  actorType: { type: String, enum: ['user', 'admin', 'system'], default: 'user' },
  resourceType: { type: String, index: true }, // e.g., 'campaign', 'submission', 'balance'
  resourceId: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  requestId: { type: String },
  outcome: { type: String, enum: ['success', 'failure', 'partial'], default: 'success' },
  errorMessage: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

// Indexes for efficient querying
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
