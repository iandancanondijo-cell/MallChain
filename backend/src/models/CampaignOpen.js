const mongoose = require('mongoose');

/**
 * One record per time a participant was shown a campaign's task link.
 *
 * Mines pays for attention the owner paid for, so "did you open the task" has
 * to be a server fact rather than the participant's word. The owner's rule is
 * that a link is opened once: after that the only way forward is the
 * screenshot, and an opened-but-unsubmitted slot earns nothing. That only
 * survives a refresh, a second tab or a second device if the open itself is
 * stored, which is what this collection is.
 *
 * `slot` is which of the user's allowed completions this open belongs to
 * (campaigns may allow more than one). The unique index on
 * (user_id, campaign_id, slot) is what makes "you cannot open this twice"
 * true under two simultaneous clicks — the count-then-insert it protects is
 * otherwise a race the participant could win.
 */
const CampaignOpenSchema = new mongoose.Schema({
  campaign_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  slot: { type: Number, required: true, min: 1 },

  // The link as it stood when the open was issued. Campaign links can be
  // edited; the proof a reviewer checks has to be judged against the content
  // the participant was actually sent to.
  content_link: { type: String, required: true },

  status: {
    type: String,
    enum: ['awaiting_proof', 'proof_submitted'],
    default: 'awaiting_proof',
    index: true,
  },
  submission_id: { type: mongoose.Schema.Types.Mixed },

  opened_at: { type: Date, default: Date.now },
  proof_submitted_at: { type: Date },
});

CampaignOpenSchema.index({ user_id: 1, campaign_id: 1, slot: 1 }, { unique: true });

module.exports = mongoose.models.CampaignOpen || mongoose.model('CampaignOpen', CampaignOpenSchema);
