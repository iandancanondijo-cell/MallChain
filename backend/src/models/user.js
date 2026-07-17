const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  email: { type: String, required: true, index: true, unique: true },
  password: { type: String },
  googleId: { type: String },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user', index: true },
  banned: { type: Boolean, default: false },
  banReason: { type: String },
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
