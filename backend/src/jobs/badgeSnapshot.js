/**
 * Monthly badge snapshot: runs at 00:00 UTC on the 14th (the day before the
 * conversion window opens on the 15th), decides who qualifies for a badge,
 * issues it on-chain, and notifies every linked-wallet user whether
 * they're ready to convert or missed the window.
 */
const cron = require('node-cron');
const User = require('../models/user');
const BadgeIssuance = require('../models/BadgeIssuance');
const { getUserBadgeInfo } = require('../services/badgeService');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { getConsecutiveActiveDays } = require('../utils/activityTracker');
const { notifyUser } = require('../services/notify');
const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Runs the snapshot for `now` (defaults to the real current time — accepts
 * an override so this can be triggered on demand, e.g. from a test or an
 * admin action, without waiting for the 14th).
 */
async function runBadgeSnapshot(now = new Date()) {
  const stats = { processed: 0, issued: 0, reminded: 0, missed: 0, errors: 0 };

  const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
  if (!operatorMnemonic) {
    logger.warn('badgeSnapshot', 'OPERATOR_MNEMONIC not configured — skipping badge snapshot run');
    return stats;
  }

  // A single find() is fine at this app's current scale; a production
  // deployment with a large user base would want to page through this in
  // batches instead of loading every linked-wallet user at once.
  const users = await User.find({ walletAddress: { $exists: true, $ne: null } })
    .select('_id email phone walletAddress')
    .lean();

  for (const user of users) {
    stats.processed++;
    const userId = user._id.toString();
    try {
      const badge = await getUserBadgeInfo(user.walletAddress);

      if (badge.exists) {
        await notifyUser(user, {
          kind: 'badge',
          title: 'Your Mallpoints conversion window opens tomorrow',
          body: 'Your badge is active — you can convert Mallpoints to Mallcoin on the 15th.',
        });
        stats.reminded++;
        continue;
      }

      const streakOk = await getConsecutiveActiveDays(userId, now, config.badge.streakRequiredDays);

      if (streakOk) {
        const result = await issueBadgeFromMnemonic({
          mnemonic: operatorMnemonic,
          recipient: user.walletAddress,
          badgeType: 'gold',
        });
        await BadgeIssuance.create({
          userId: user._id,
          walletAddress: user.walletAddress,
          method: 'streak',
          badgeType: 'gold',
          txHash: result.txHash,
        });
        await notifyUser(user, {
          kind: 'badge',
          title: 'You earned your badge!',
          body: `You stayed active ${config.badge.streakRequiredDays} days straight — convert Mallpoints to Mallcoin tomorrow on the 15th.`,
        });
        stats.issued++;
      } else {
        await notifyUser(user, {
          kind: 'badge',
          title: "You missed this month's badge window",
          body: `Stay active every day for ${config.badge.streakRequiredDays} days before the 14th to earn a badge automatically, or buy one for KSh ${config.badge.purchasePriceKes} any time.`,
        });
        stats.missed++;
      }
    } catch (err) {
      // One user's failure (e.g. a broadcast error) must not abort the
      // batch — every other user still needs their notification.
      stats.errors++;
      logger.error('badgeSnapshot', 'failed to process user', err, { userId });
    }
  }

  logger.info('badgeSnapshot', 'snapshot run complete', stats);
  return stats;
}

function start() {
  cron.schedule('0 0 14 * *', () => {
    runBadgeSnapshot().catch((err) => logger.error('badgeSnapshot', 'snapshot run threw', err));
  }, { timezone: 'UTC' });
}

module.exports = { runBadgeSnapshot, start };
