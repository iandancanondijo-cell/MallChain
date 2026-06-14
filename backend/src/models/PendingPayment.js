const mongoose = require('mongoose')

const PendingPaymentSchema = new mongoose.Schema({
  providerRef: { type: String, required: true, unique: true },
  method: { type: String },
  phone: { type: String },
  amountFiat: { type: String },
  amountMallcoin: { type: String },
  status: { type: String, enum: ['pending','success','failed'], default: 'pending' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: () => new Date() },
  confirmedAt: { type: Date }
})

module.exports = mongoose.model('PendingPayment', PendingPaymentSchema)
