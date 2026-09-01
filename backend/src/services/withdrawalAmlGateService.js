const WithdrawalRequest = require('../models/WithdrawalRequest');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const WithdrawalStructuringFlag = require('../models/WithdrawalStructuringFlag');
const logger = require('../utils/logger');

const AML_WITHDRAWAL_THRESHOLD_KES = Number(process.env.AML_WITHDRAWAL_THRESHOLD_KES || 2500);
const STRUCTURING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolved BEFORE the user signs anything (declare-first flow — see
 * routes/withdrawalAml.js and buy.js's /sell handler) — this is a plain
 * existence check against an already-approved, unconsumed review, not a new
 * hold state. Below the threshold, no review is needed at all.
 *
 * @returns {Promise<{ ok: boolean, required: boolean, thresholdKes: number, reviewId: string|null, reviewStatus: 'none'|'pending'|'approved'|'rejected' }>}
 */
async function requireApprovedAmlReview(walletAddress, estimatedKes) {
  if (Number(estimatedKes) < AML_WITHDRAWAL_THRESHOLD_KES) {
    return { ok: true, required: false, thresholdKes: AML_WITHDRAWAL_THRESHOLD_KES, reviewId: null, reviewStatus: 'none' };
  }

  const approved = await WithdrawalAmlReview.findOne({
    walletAddress,
    status: 'approved',
    consumedByWithdrawalId: null,
  }).sort({ submittedAt: -1 });

  if (approved) {
    return {
      ok: true,
      required: true,
      thresholdKes: AML_WITHDRAWAL_THRESHOLD_KES,
      reviewId: String(approved._id),
      reviewStatus: 'approved',
    };
  }

  // No approved review on file — tell the caller whether one is already in
  // flight (pending/rejected) or hasn't been started at all, so the
  // frontend can route to "check back later" vs. "start a new declaration".
  const latest = await WithdrawalAmlReview.findOne({ walletAddress }).sort({ submittedAt: -1 });
  const reviewStatus = latest ? latest.status : 'none';

  return {
    ok: false,
    required: true,
    thresholdKes: AML_WITHDRAWAL_THRESHOLD_KES,
    reviewId: latest ? String(latest._id) : null,
    reviewStatus,
  };
}

/**
 * Anti-structuring safeguard: never blocks, never throws into the request
 * path (called fire-and-forget alongside the real gate checks). If a
 * wallet's completed withdrawals in the rolling week sum to the AML
 * threshold or more, even with no single one crossing it, upsert a flag for
 * admin visibility. Bucketed by calendar day (UTC) for the upsert key —
 * the analysis window itself is a true rolling 7 days, but "which flag row
 * this belongs to" needs a stable key, not a continuously-sliding one.
 */
async function checkAndFlagStructuring(walletAddress) {
  try {
    const windowStart = new Date(Date.now() - STRUCTURING_WINDOW_MS);
    const completed = await WithdrawalRequest.find({
      walletAddress,
      status: 'completed',
      createdAt: { $gte: windowStart },
    })
      .select('_id amountKes')
      .lean();

    const cumulativeKes = completed.reduce((sum, w) => sum + (Number(w.amountKes) || 0), 0);
    if (cumulativeKes < AML_WITHDRAWAL_THRESHOLD_KES) return null;

    const dayBucket = startOfUtcDay(new Date());
    const windowEndAt = new Date(dayBucket.getTime() + 24 * 60 * 60 * 1000);

    return await WithdrawalStructuringFlag.findOneAndUpdate(
      { walletAddress, windowStartAt: dayBucket },
      {
        $set: {
          windowEndAt,
          cumulativeKes,
          relatedWithdrawalIds: completed.map((w) => w._id),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    logger.warn('withdrawalAmlGateService: structuring check failed (non-blocking)', { walletAddress, error: err.message });
    return null;
  }
}

module.exports = { requireApprovedAmlReview, checkAndFlagStructuring, AML_WITHDRAWAL_THRESHOLD_KES };
