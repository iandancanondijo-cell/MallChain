const mongoose = require('mongoose')

const AddressMapSchema = new mongoose.Schema({
  hex: { type: String, required: true, unique: true, index: true, lowercase: true },
  bech32: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
})

// No `next` param — see models/kyc.js's comment on the same Mongoose-9
// Kareem behavior. This hook is currently unreachable in practice (every
// write in routes/addressMap.js goes through findOneAndUpdate, which
// document middleware never runs for), so the bug was silent, but it's
// still worth being correct for any future .save() caller.
AddressMapSchema.pre('save', function () {
  this.updatedAt = new Date()
})

module.exports = mongoose.model('AddressMap', AddressMapSchema)
