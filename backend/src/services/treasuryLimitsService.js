const TreasuryDailyPayout = require('../models/TreasuryDailyPayout');
const logger = require('../utils/logger');
const { config } = require('../config');

// SEC3: per-transaction and daily cumulative caps on B2C (KES) payouts —
// previously there were none at all (see docs/security/treasury-controls.md
// for the full picture, including what's still a genuine gap: this is a
// single-key operator account with no multi-party approval, which these
// caps do not fix on their own).
//
// Both caps are opt-in (unset = no limit, matching prior behavior exactly)
// because the actual figures are a business/risk decision this code can't
// make on your behalf — there's no universally "safe" default the way
// there is for e.g. a minimum secret length.
function getCaps() {
  const perTx = process.env.MAX_PAYOUT_KES_PER_TX ? Number(process.env.MAX_PAYOUT_KES_PER_TX) : null;
  const perDay = process.env.MAX_PAYOUT_KES_PER_DAY ? Number(process.env.MAX_PAYOUT_KES_PER_DAY) : null;
  return { perTx, perDay };
}

function warnIfUnconfigured() {
  // No point warning about missing caps if auto-payout is off entirely —
  // every payout already sits in manual review either way.
  if (!config.payment.safaricom.autoPayoutEnabled) return;
  const { perTx, perDay } = getCaps();
  if (process.env.NODE_ENV === 'production' && (!perTx || !perDay)) {
    logger.warn(
      'treasuryLimits',
      'ENABLE_WITHDRAWAL_AUTO_PAYOUT is on but MAX_PAYOUT_KES_PER_TX / MAX_PAYOUT_KES_PER_DAY are not fully configured — B2C payouts have no amount ceiling.'
    );
  }
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // UTC 'YYYY-MM-DD'
}

/** Checked BEFORE calling Safaricom. Does not itself reserve capacity — see recordPayout. */
async function checkPayoutLimits(pesaAmountKes) {
  const { perTx, perDay } = getCaps();

  if (perTx && pesaAmountKes > perTx) {
    return {
      ok: false,
      reason: `Payout of KES ${pesaAmountKes} exceeds the per-transaction limit of KES ${perTx} and requires manual review.`,
    };
  }

  if (perDay) {
    const doc = await TreasuryDailyPayout.findOne({ date: todayKey() }).lean();
    const todayTotal = doc?.totalKes || 0;
    if (todayTotal + pesaAmountKes > perDay) {
      return {
        ok: false,
        reason: `Payout would exceed today's cumulative payout limit of KES ${perDay} (KES ${todayTotal} already paid out today) and requires manual review.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Called AFTER a payout actually gets initiated with Safaricom (not on
 * every attempt) — best-effort, fire-and-forget from the caller's
 * perspective is fine since this is a safety margin, not a ledger of
 * record (TreasuryLedger/B2CPayout remain that). A theoretical race
 * between two large concurrent payouts both passing checkPayoutLimits
 * before either records is accepted rather than built out with a
 * distributed lock: B2C cash-out is a deliberate, comparatively low-
 * frequency user action already gated by KYC/liquidity checks upstream,
 * not a high-throughput path where that race is likely to matter in
 * practice.
 */
async function recordPayout(pesaAmountKes) {
  try {
    await TreasuryDailyPayout.findOneAndUpdate(
      { date: todayKey() },
      { $inc: { totalKes: pesaAmountKes } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('treasuryLimits', 'failed to record payout against the daily cap', err);
  }
}

module.exports = { checkPayoutLimits, recordPayout, getCaps, warnIfUnconfigured };
