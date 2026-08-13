const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const KYCSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Personal Information
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  nationality: { type: String, required: true },
  
  // Address & Contact
  address: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true },
  postalCode: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  
  // Identity Verification
  idType: { type: String, enum: ['passport', 'drivers_license', 'national_id'], required: true },
  idNumber: { type: String, required: true },
  idExpiry: { type: Date, required: true },
  idDocumentUrl: { type: String },
  
  // Financial Information
  occupation: { type: String, required: true },
  sourceOfFunds: { type: String, required: true },
  annualIncome: { type: String, required: true },
  politicalExposure: { type: Boolean, default: false },
  
  // AML Assessment
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
  amlChecks: {
    sanctions: { type: Boolean, default: false },
    pep: { type: Boolean, default: false },
    adverseMedia: { type: Boolean, default: false },
    watchlist: { type: Boolean, default: false }
  },
  
  // Status
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'review'], default: 'pending' },
  
  // Timestamps
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String }
});

KYCSchema.index({ userId: 1 });
KYCSchema.index({ status: 1 });
KYCSchema.index({ riskLevel: 1 });
KYCSchema.index({ submittedAt: -1 });

module.exports = mongoose.models.KYC || mongoose.model('KYC', KYCSchema);
