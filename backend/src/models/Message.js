const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  readBy: { type: [Schema.Types.ObjectId], default: [] },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
});

MessageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
