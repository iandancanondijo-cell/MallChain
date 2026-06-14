const mongoose = require('mongoose')

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actor: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  outcome: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('AuditLog', AuditLogSchema)
