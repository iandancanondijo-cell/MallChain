const WithdrawalRequest = require('../models/WithdrawalRequest');

const WEEKLY_WITHDRAWAL_LIMIT = Number(process.env.WEEKLY_WITHDRAWAL_LIMIT || 3);
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// failed/refunded attempts don't burn a real slot — they never actually
// moved value, matching the existing reasoning elsewhere in this flow that
// a recoverable rejection isn't a dead end the user should be penalized for
// (see buy.js's comment on a cap-rejected payout still being "good").
const NON_COUNTING_STATUSES = ['failed', 'refunded'];

/**
 * @param {string} walletAddress
 * @returns {Promise<{ ok: boolean, count: number, limit: number, nextAvailableAt: string|null }>}
 */
async function checkWeeklyWithdrawalLimit(walletAddress) {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const counted = await WithdrawalRequest.find({
    walletAddress,
    createdAt: { $gte: windowStart },
    status: { $nin: NON_COUNTING_STATUSES },
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  const count = counted.length;
  const ok = count < WEEKLY_WITHDRAWAL_LIMIT;

  let nextAvailableAt = null;
  if (!ok) {
    // The oldest counted request ages out of the 7-day window first,
    // freeing up the next available slot at exactly that moment.
    const oldest = counted[0];
    nextAvailableAt = new Date(oldest.createdAt.getTime() + WINDOW_MS).toISOString();
  }

  return { ok, count, limit: WEEKLY_WITHDRAWAL_LIMIT, nextAvailableAt };
}

module.exports = { checkWeeklyWithdrawalLimit, WEEKLY_WITHDRAWAL_LIMIT };
