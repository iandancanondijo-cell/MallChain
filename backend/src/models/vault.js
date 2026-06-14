const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VaultSchema = new Schema({
  authority: { type: String, required: true },
  status: { type: String, enum: ['pending','active','disabled'], default: 'pending' },
  data: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vault', VaultSchema);
