const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * A Mines "Proof Reviewer" — a user who has staked MLPTS to become eligible
 * to be randomly assigned to vote on content-submission TaskSubmissions.
 * Distinct from x/mlcoin on-chain StakingRecords and from real Cosmos
 * x/staking validators (see ValidatorApplication.js) — this stake is an
 * off-chain deposit specific to the review game.
 */
const MinesReviewerSchema = new Schema({
  // Reviewer identity (keyed by the mines.js JWT user id — req.userId)
  validator_id: { type: Schema.Types.Mixed, required: true, unique: true, index: true },
  validator_address: { type: String, default: '' },
  moniker: { type: String, default: '' },
  email: { type: String, default: '' },

  // Reviewer-specific stake (off-chain MLPTS deposit; see minesReviewService.js)
  stakedAmount: { type: Number, default: 0 },
  minRequiredStake: { type: Number, default: 50 },
  stakeStatus: { type: String, enum: ['unstaked', 'active', 'suspended'], default: 'unstaked' },
  totalSlashed: { type: Number, default: 0 },
  missedVoteStreak: { type: Number, default: 0 },

  // Mining validation stats
  tasks_assigned: { type: Number, default: 0 },
  tasks_voted: { type: Number, default: 0 },
  tasks_approved: { type: Number, default: 0 },  // How many tasks this reviewer voted YES on
  tasks_rejected: { type: Number, default: 0 },   // How many tasks this reviewer voted NO on

  // Performance metrics
  approval_rate: { type: Number, default: 0 },    // tasks_approved / tasks_voted * 100
  response_rate: { type: Number, default: 0 },     // tasks_voted / tasks_assigned * 100
  avg_response_time_ms: { type: Number, default: 0 }, // Average time to vote after assignment

  // Reputation for mining validation
  mining_reputation: { type: Number, default: 50 }, // 0-100 score
  total_earnings: { type: Number, default: 0 },     // MLPTS earned from reviewing

  // Status
  is_active: { type: Boolean, default: true },
  last_vote_at: { type: Date },
  last_assigned_at: { type: Date },

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Add additional indexes for common query patterns
MinesReviewerSchema.index({ validator_address: 1 }, { sparse: true })
MinesReviewerSchema.index({ moniker: 1 }, { sparse: true })
MinesReviewerSchema.index({ is_active: 1 })
MinesReviewerSchema.index({ stakeStatus: 1 })
MinesReviewerSchema.index({ mining_reputation: -1 })
MinesReviewerSchema.index({ total_earnings: -1 })
MinesReviewerSchema.index({ last_vote_at: -1 })
MinesReviewerSchema.index({ last_assigned_at: -1 })
MinesReviewerSchema.index({ is_active: 1, mining_reputation: -1 })
MinesReviewerSchema.index({ created_at: -1 })

// Calculate derived stats before saving. Only recompute once the reviewer has
// actually voted at least once — otherwise a brand-new reviewer (tasks_voted=0)
// would have their default 50 reputation immediately overwritten to a near-zero
// score by an empty-history formula (0 response + 40 consistency + 0 volume = 12)
// the moment any unrelated field (e.g. stakedAmount) is saved.
MinesReviewerSchema.pre('save', function(next) {
  if (this.tasks_voted > 0) {
    this.approval_rate = Math.round((this.tasks_approved / this.tasks_voted) * 100);
    this.response_rate = Math.round((this.tasks_voted / this.tasks_assigned) * 100);

    // Calculate mining reputation: weighted score based on response rate (40%), approval consistency (30%), volume (30%)
    const responseScore = this.response_rate;
    const consistencyScore = 100 - Math.abs(this.approval_rate - 60); // Best when around 60% approval (not too lenient, not too strict)
    const volumeScore = Math.min(this.tasks_voted * 5, 100); // More tasks = higher score, capped at 100
    this.mining_reputation = Math.round(
      (responseScore * 0.4) + (consistencyScore * 0.3) + (volumeScore * 0.3)
    );
  }

  next();
});

module.exports = mongoose.models.MinesReviewer || mongoose.model('MinesReviewer', MinesReviewerSchema);
