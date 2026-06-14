const mongoose = require('mongoose');

const MallPointAccountSchema = new mongoose.Schema({
  address: { type: String, required: true, index: true, unique: true },
  balance: { type: Number, default: 0 },
  lastConversionAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MallPointAccount', MallPointAccountSchema);
