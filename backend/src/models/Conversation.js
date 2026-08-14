const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ConversationSchema = new Schema({
  participants: { type: [Schema.Types.ObjectId], ref: 'User', required: true, validate: (v) => v.length === 2 },
  lastMessageAt: { type: Date, default: Date.now },
});

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
