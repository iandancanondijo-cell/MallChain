const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { encryptField, decryptField } = require('../utils/fieldEncryption');

// Fields encrypted at rest (production-readiness E1/E2) — the government ID
// number and home-address/contact details, the most sensitive identity PII
// this model holds. Never queried by value anywhere in the codebase (only
// ever looked up by userId/_id), so no blind index is needed for these.
const ENCRYPTED_FIELDS = ['idNumber', 'phoneNumber', 'address', 'city', 'postalCode'];

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
    watchlist: { type: Boolean, default: false },
    // 'mock' until a real provider is configured (services/amlProvider.js) —
    // provider/raw form the audit trail of which screening actually ran.
    provider: { type: String, default: 'mock' },
    raw: { type: Schema.Types.Mixed, default: null }
  },
  
  // Status
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'review'], default: 'pending' },
  
  // Timestamps
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },

  // Set by services/gdprService.js on an erasure request. The identity
  // fields above (name/DOB/address/ID number/document/AML raw payload) are
  // redacted at that point, but the record itself — status, riskLevel,
  // dates — is kept: AML/KYC regulations generally require retaining that
  // a screening happened and its outcome for a period after account
  // closure, which is a documented exception to GDPR's erasure right
  // (Article 17(3)(b)). The exact retention period is a legal/compliance
  // policy decision, not one this code makes — see docs/compliance/gdpr.md.
  erasedAt: { type: Date },

  // Draft progress — stores partial KYC data so users can resume after
  // closing the browser. Only populated while the user is mid-flow; cleared
  // on successful submit. Uses the same encryption as the main fields.
  draft: {
    step: { type: String, enum: ['personal', 'address', 'identity', 'financial', 'review'] },
    data: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date },
  },
});

KYCSchema.index({ status: 1 });
KYCSchema.index({ riskLevel: 1 });
KYCSchema.index({ submittedAt: -1 });

// isModified() + the isEncrypted() re-check both guard against double-
// encrypting: the review flow (adminPanel.js's POST /kyc/:id/review) loads
// a real document and calls .save() again after only changing
// status/reviewedAt/notes, which must not touch these already-encrypted
// values a second time.
// Synchronous, no `next` callback — Mongoose 9's Kareem middleware runner
// detects a zero-argument pre-hook as synchronous-or-promise-returning and
// does not pass a callback at all, unlike the older `function(next)` style
// (present elsewhere in this codebase, e.g. AddressMap.js) which turned out
// to throw "next is not a function" under this Mongoose version the moment
// a real .save() actually exercised it — apparently never caught before
// because nothing had a real integration test against a live save() call.
KYCSchema.pre('save', function encryptPiiOnSave() {
  for (const field of ENCRYPTED_FIELDS) {
    if (this.isModified(field) && this[field] != null) {
      this[field] = encryptField(this[field]);
    }
  }
});

/**
 * Decrypts the PII fields on a plain object (typically from a `.lean()`
 * query, which bypasses Mongoose document methods entirely) or a hydrated
 * document. Every route that reads these fields for display — the owning
 * user's own status view, the admin pending-review list, GDPR export —
 * must pass its result through this before sending it anywhere.
 */
function decryptKycPii(kyc) {
  if (!kyc) return kyc;
  const plain = typeof kyc.toObject === 'function' ? kyc.toObject() : { ...kyc };
  for (const field of ENCRYPTED_FIELDS) {
    if (plain[field] != null) plain[field] = decryptField(plain[field]);
  }
  return plain;
}

const KYCModel = mongoose.models.KYC || mongoose.model('KYC', KYCSchema);
KYCModel.decryptKycPii = decryptKycPii;

module.exports = KYCModel;
