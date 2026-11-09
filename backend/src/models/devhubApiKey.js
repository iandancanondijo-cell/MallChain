const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// DevHub user-facing API keys — distinct from middleware/apiKeyAuth.js's
// server-to-server admin key concept.
const ApiKeySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  permissions: { type: [String], default: ['read'] },
  used: { type: Number, default: 0 },
  created: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: null },
  revoked: { type: Boolean, default: false },
  revokedAt: { type: Date },
});

ApiKeySchema.index({ userId: 1, revoked: 1 });

module.exports = mongoose.models.ApiKey || mongoose.model('ApiKey', ApiKeySchema);
