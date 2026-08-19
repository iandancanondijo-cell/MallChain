const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Singleton document (fixed _id) holding the emergency-pause state for
// money-moving route groups. A global pause blocks everything; per-scope
// flags allow pausing just one surface (e.g. withdrawals) without taking
// the whole platform down.
const MaintenanceModeSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  global: { type: Boolean, default: false },
  scopes: {
    type: Map,
    of: Boolean,
    default: {},
  },
  reason: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, {
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

module.exports = mongoose.models.MaintenanceMode || mongoose.model('MaintenanceMode', MaintenanceModeSchema);
