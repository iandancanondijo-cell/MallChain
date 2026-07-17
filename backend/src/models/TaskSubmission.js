const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TaskSubmissionSchema = new Schema({
  // Core fields
  miner_id: { type: Schema.Types.Mixed, required: true, index: true },
  campaign_id: { type: Schema.Types.Mixed },
  title: { type: String, default: '' },
  task_type: { type: String, default: '' },
  description: { type: String, default: '' },
  proof_url: { type: String, default: '' },

  // Status: pending_assignment | assigned | voting | approved | rejected
  status: { type: String, default: 'manual_review', index: true },

  // Task assignment window fields
  assigned_validators: [{ type: Schema.Types.Mixed }], // Array of validator IDs (user _id or validatorAddress)
  assigned_at: { type: Date },
  assignment_status: {
    type: String,
    enum: ['none', 'pending_assignment', 'assigned', 'voting', 'vote_complete', 'admin_review', 'approved', 'rejected'],
    default: 'none'
  },

  // Validator voting
  validator_votes: { type: Schema.Types.Mixed, default: {} }, // { validatorId: 'yes'|'no', ... }
  votes_required: { type: Number, default: 6 },
  votes_yes: { type: Number, default: 0 },
  votes_no: { type: Number, default: 0 },
  voting_deadline: { type: Date },

  // Reward
  reward_amount: { type: Number, default: 0 },
  reward_currency: { type: String, default: 'MLPTS' },

  // Timestamps
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date },
  rejection_note: { type: String },
}, {
  strict: false, // Allow additional dynamic fields
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

TaskSubmissionSchema.index({ status: 1, created_at: -1 });
TaskSubmissionSchema.index({ miner_id: 1, created_at: -1 });
TaskSubmissionSchema.index({ assignment_status: 1 });

module.exports = mongoose.models.TaskSubmission || mongoose.model('TaskSubmission', TaskSubmissionSchema);
