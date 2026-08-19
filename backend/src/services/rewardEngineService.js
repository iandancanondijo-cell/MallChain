const {
  getActivity,
  getDailyCapMlpts,
  MIN_CAMPAIGN_MULTIPLIER,
  MAX_CAMPAIGN_MULTIPLIER,
} = require('../config/socialRewardRates');

/**
 * Per-campaign payout = Base Reward x Campaign Multiplier x Verification
 * Factor. The Verification Factor isn't a number computed here — it's
 * binary and enforced by the existing reviewer-vote flow (a submission only
 * ever gets paid if minesReviewService.settle() marks it approved), so this
 * function only computes the Base x Multiplier part that becomes a
 * Campaign's rate_per_task.
 *
 * For ranged base activities (e.g. TikTok "complete_campaign": 1-5 MLPTS),
 * the campaign creator's multiplier is applied against the midpoint — the
 * multiplier is still their real lever for scaling reward within campaign
 * budget, the range just sets the baseline order of magnitude.
 */
function resolveBaseRate(platform, activity) {
  const def = getActivity(platform, activity);
  if (!def) return null;
  if (typeof def.rate === 'number') return def.rate;
  if (typeof def.min === 'number' && typeof def.max === 'number') return (def.min + def.max) / 2;
  return null;
}

function clampMultiplier(multiplier) {
  const n = Number(multiplier);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CAMPAIGN_MULTIPLIER, Math.max(MIN_CAMPAIGN_MULTIPLIER, n));
}

/**
 * Returns the rate_per_task to store on a Campaign, or null if the
 * platform/activity pair isn't in the rate table.
 */
function computeCampaignRate({ platform, activity, multiplier }) {
  const baseRate = resolveBaseRate(platform, activity);
  if (baseRate === null) return null;
  const clamped = clampMultiplier(multiplier);
  // Round to 4dp — MLPTS base rates go down to thousandths (e.g. 0.391).
  return Math.round(baseRate * clamped * 10000) / 10000;
}

module.exports = {
  resolveBaseRate,
  clampMultiplier,
  computeCampaignRate,
  getDailyCapMlpts,
  MIN_CAMPAIGN_MULTIPLIER,
  MAX_CAMPAIGN_MULTIPLIER,
};
