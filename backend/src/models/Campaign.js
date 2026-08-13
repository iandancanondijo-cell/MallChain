const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  creator_id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  rate_per_task: { type: Number, required: true, min: 0 },
  budget_remaining: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
  completions_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
