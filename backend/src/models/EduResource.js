const mongoose = require('mongoose');

// A user-posted educational resource (guide, slide deck, short explainer
// video) that other users can browse and download. Posting requires auth
// (so every resource has a real, accountable author); browsing/downloading
// is public, matching how the rest of this app's educational content
// (Learning page) is treated — no login wall on material meant to help
// onboard people who aren't logged in yet.
const EduResourceSchema = new mongoose.Schema({
  authorId: { type: String, required: true, index: true },
  authorName: { type: String, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  category: {
    type: String,
    enum: ['blockchain-basics', 'tokenomics', 'security', 'governance', 'validators', 'general'],
    default: 'general',
    index: true,
  },
  // Stored filename on disk (see middleware/upload.js's uploadEduResource) —
  // never the client-supplied original name, which is only kept in
  // fileName for the download's Content-Disposition attachment name.
  storedFilename: { type: String, required: true },
  fileName: { type: String, required: true },
  fileSizeBytes: { type: Number, default: 0 },
  mimeType: { type: String, default: '' },
  downloadCount: { type: Number, default: 0 },
  // Soft-delete: keeps downloadCount/audit history rather than losing it,
  // and lets an author's or admin's removal be undone if it was a mistake.
  status: { type: String, enum: ['published', 'removed'], default: 'published', index: true },

  // sha256, hex-encoded — computed server-side from the uploaded bytes right
  // after multer writes them to disk. This is what gets anchored on-chain
  // (see services/eduTxBuilder.js) and what /:id/verify recomputes against
  // the file currently on disk to prove it hasn't been swapped since upload.
  sha256Hash: { type: String, default: '' },

  // docId is stable across every version of "the same" document — it's the
  // x/edu chain module's version-chain key. A first upload defaults it to
  // its own Mongo _id; a "new version" upload reuses the original's docId.
  docId: { type: String, index: true },
  previousResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EduResource', default: null },

  // Populated once the best-effort on-chain anchor call succeeds. A missing
  // chainRecordId (chainStatus 'pending'/'failed') does NOT block browsing
  // or downloading — the off-chain file is still real and usable without a
  // chain anchor; only verification against a chain record is unavailable.
  chainStatus: { type: String, enum: ['pending', 'registered', 'failed'], default: 'pending' },
  chainRecordId: { type: String, default: '' },
  chainVersion: { type: Number, default: 0 },
  chainTxHash: { type: String, default: '' },
  chainError: { type: String, default: '' },
}, { timestamps: true });

EduResourceSchema.index({ status: 1, createdAt: -1 });
EduResourceSchema.index({ status: 1, category: 1, createdAt: -1 });
EduResourceSchema.index({ docId: 1, createdAt: 1 });

module.exports = mongoose.models.EduResource || mongoose.model('EduResource', EduResourceSchema);
