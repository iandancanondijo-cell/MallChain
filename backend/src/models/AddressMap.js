const mongoose = require('mongoose')

const AddressMapSchema = new mongoose.Schema({
  hex: { type: String, required: true, unique: true, index: true, lowercase: true },
  bech32: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
})

AddressMapSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

module.exports = mongoose.model('AddressMap', AddressMapSchema)
