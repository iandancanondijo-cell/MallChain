const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  // Auth
  email: { type: String, required: true, index: true, unique: true },
  password: { type: String },
  googleId: { type: String },

  // Roles & moderation
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user', index: true },
  banned: { type: Boolean, default: false },
  banReason: { type: String },

  // Profile (used by mines / task system)
  username: { type: String },
  phone: { type: String },
  creator_level: { type: Number, default: 0 },

  // Balances
  mlpts_balance: { type: Number, default: 0 },
  mallcoin_balance: { type: Number, default: 0 },

  // Activity / reputation
  streak_count: { type: Number, default: 0 },
  tasks_completed: { type: Number, default: 0 },
  rank_points: { type: Number, default: 0 },

  // Fraud tracking
  fraud_strikes: { type: Number, default: 0 },
  fraud_status: { type: String, enum: ['clear', 'warned', 'suspended', 'banned'], default: 'clear' },

  // Timestamps
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// Add additional indexes for common query patterns
UserSchema.index({ googleId: 1 }, { sparse: true })
UserSchema.index({ phone: 1 }, { sparse: true })
UserSchema.index({ username: 1 }, { sparse: true })
UserSchema.index({ banned: 1 })
UserSchema.index({ fraud_status: 1 })
UserSchema.index({ createdAt: -1 })
UserSchema.index({ lastLoginAt: -1 })
UserSchema.index({ role: 1, banned: 1 })
UserSchema.index({ fraud_status: 1, banned: 1 })

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
