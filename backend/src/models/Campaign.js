const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  creator_id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  // Self-serve campaigns (see routes/mines.js POST /campaigns/create) fill
  // these; admin-created campaigns may leave them unset.
  content_link: { type: String, default: '' },
  // Separate from `description` on purpose — description is what the
  // campaign is about, directive is the specific instruction given to
  // participants ("like and comment 'nice' ", "follow then DM code X", etc).
  directive: { type: String, default: '' },
  platform: { type: String, default: '' },
  activity_type: { type: String, default: '' },
  base_rate_mlpts: { type: Number, default: null },
  multiplier: { type: Number, default: 1, min: 0.5, max: 5 },
  rate_per_task: { type: Number, required: true, min: 0 },
  budget_remaining: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
  completions_count: { type: Number, default: 0 },
  // Anti-abuse: how many times one user may be rewarded for this campaign,
  // and the minimum gap between their submissions to it.
  max_completions_per_user: { type: Number, default: 1, min: 1 },
  cooldown_seconds: { type: Number, default: 3600, min: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
