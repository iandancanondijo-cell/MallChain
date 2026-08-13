const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WalletTransactionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'User' },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'MLPTS' },
  description: { type: String, default: '' },
  reference_id: { type: String },         // e.g. task submission ID
  reference_type: { type: String },       // e.g. 'task_reward', 'faucet', 'conversion'
  created_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

WalletTransactionSchema.index({ user_id: 1, created_at: -1 });
WalletTransactionSchema.index({ type: 1, created_at: -1 });

module.exports = mongoose.models.WalletTransaction
  || mongoose.model('WalletTransaction', WalletTransactionSchema);
