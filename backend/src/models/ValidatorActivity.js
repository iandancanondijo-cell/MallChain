const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ValidatorActivitySchema = new Schema({
  // Validator identity
  validator_id: { type: Schema.Types.Mixed, required: true, unique: true, index: true },
  validator_address: { type: String, default: '' },
  moniker: { type: String, default: '' },
  email: { type: String, default: '' },

  // Mining validation stats
  tasks_assigned: { type: Number, default: 0 },
  tasks_voted: { type: Number, default: 0 },
  tasks_approved: { type: Number, default: 0 },  // How many tasks this validator voted YES on
  tasks_rejected: { type: Number, default: 0 },   // How many tasks this validator voted NO on

  // Performance metrics
  approval_rate: { type: Number, default: 0 },    // tasks_approved / tasks_voted * 100
  response_rate: { type: Number, default: 0 },     // tasks_voted / tasks_assigned * 100
  avg_response_time_ms: { type: Number, default: 0 }, // Average time to vote after assignment

  // Reputation for mining validation
  mining_reputation: { type: Number, default: 50 }, // 0-100 score
  total_earnings: { type: Number, default: 0 },     // MLPTS earned from validation

  // Status
  is_active: { type: Boolean, default: true },
  last_vote_at: { type: Date },
  last_assigned_at: { type: Date },

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Calculate derived stats before saving
ValidatorActivitySchema.pre('save', function(next) {
  if (this.tasks_voted > 0) {
    this.approval_rate = Math.round((this.tasks_approved / this.tasks_voted) * 100);
    this.response_rate = Math.round((this.tasks_voted / this.tasks_assigned) * 100);
  }

  // Calculate mining reputation: weighted score based on response rate (40%), approval consistency (30%), volume (30%)
  const responseScore = this.response_rate;
  const consistencyScore = 100 - Math.abs(this.approval_rate - 60); // Best when around 60% approval (not too lenient, not too strict)
  const volumeScore = Math.min(this.tasks_voted * 5, 100); // More tasks = higher score, capped at 100
  this.mining_reputation = Math.round(
    (responseScore * 0.4) + (consistencyScore * 0.3) + (volumeScore * 0.3)
  );

  next();
});

module.exports = mongoose.models.ValidatorActivity || mongoose.model('ValidatorActivity', ValidatorActivitySchema);
