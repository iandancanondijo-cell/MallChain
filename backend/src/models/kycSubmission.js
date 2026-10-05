const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * KYC Submission model
 * Tracks identity verification documents and status for each user
 */
const KYCSubmissionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Document type: 'passport', 'drivers_license', 'national_id', etc.
  documentType: { type: String, required: true, enum: ['passport', 'drivers_license', 'national_id', 'residence_permit'] },
  
  // Document URLs (stored on secure storage or CDN)
  documentUrl: { type: String, required: true },
  selfieUrl: { type: String }, // Selfie with document for liveness check
  
  // KYC status: 'pending' -> 'approved' or 'rejected'
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'expired'], 
    default: 'pending',
    index: true
  },
  
  // If rejected, why?
  rejectionReason: { type: String },
  
  // Extracted data from document (OCR results, typically)
  extractedData: {
    fullName: String,
    dateOfBirth: Date,
    documentNumber: String,
    issueDate: Date,
    expiryDate: Date,
  },
  
  // Timestamps
  submittedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  expiresAt: { type: Date }, // KYC typically expires after 1-2 years
  
  // IP & device metadata for compliance logging
  ipAddress: { type: String },
  userAgent: { type: String },
  
  // Review metadata (who reviewed, notes, etc.)
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Admin who reviewed
  reviewNotes: { type: String },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for common queries
KYCSubmissionSchema.index({ userId: 1, createdAt: -1 });
KYCSubmissionSchema.index({ status: 1, submittedAt: -1 });
KYCSubmissionSchema.index({ userId: 1, status: 1 });

// Auto-update updatedAt on any modification
KYCSubmissionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.KYCSubmission || mongoose.model('KYCSubmission', KYCSubmissionSchema);
