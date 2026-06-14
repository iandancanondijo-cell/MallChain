const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
  inviteId: { type: String, required: true, unique: true },
  inviter: { type: String, required: true }, // wallet address
  claimed: { type: Boolean, default: false },
  expired: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  claimedAt: { type: Date },
  rewardTx: { type: String },
});

module.exports = mongoose.model('Invite', InviteSchema);
