const mongoose = require('mongoose');

/**
 * One record per (user, campaign, day) that the campaign appeared on that
 * account's Discover feed.
 *
 * The owner's comparison is "tasks appearing on the user's window" against
 * "tasks they do". The second half was already a server fact (TaskSubmission);
 * the first half was not — `CampaignOpen` records a link that was *released*,
 * which is already action, and nothing in the schema recorded that a card was
 * merely shown. Counting opens as impressions would quietly plot action on
 * both axes and make the gap the chart exists to show impossible.
 *
 * So the feed writes what it serves. Keyed by day because the question is
 * per-day and the write must be idempotent: refreshing Discover twenty times
 * shows the same task twenty times, but it appeared on that person's window
 * once that day, so the unique index upserts instead of growing.
 *
 * Written after the response is sent, and failures are swallowed by the
 * caller: a metric nobody can see is worth less than a feed that stopped
 * working, and a participant must never lose a task because a counter broke.
 */
const CampaignImpressionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  campaign_id: { type: mongoose.Schema.Types.Mixed, required: true },

  // UTC calendar day, 'YYYY-MM-DD' — the same bucketing `$dateToString` gives
  // the rewards series, so the two lines share an x-axis without conversion.
  day: { type: String, required: true },

  first_seen_at: { type: Date, default: Date.now },
  last_seen_at: { type: Date, default: Date.now },
});

CampaignImpressionSchema.index({ user_id: 1, campaign_id: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.CampaignImpression
  || mongoose.model('CampaignImpression', CampaignImpressionSchema);
