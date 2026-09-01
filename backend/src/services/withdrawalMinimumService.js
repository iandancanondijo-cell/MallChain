const logger = require('../utils/logger');

// KES 350 is a floor, not a ceiling: if/when another country's payout rail
// is ever added here, its minimum must convert to at least this much KES-
// equivalent value, never less. Only KES/M-Pesa exists in this codebase
// today (see b2cPayoutService.js), so MIN_WITHDRAWAL_KES is the only real
// currency floor implemented — this function is written currency-aware so a
// future non-KES rail plugs in without redesigning the check, but no other
// rail's exchange-rate integration is fabricated here since none exists yet.
const MIN_WITHDRAWAL_KES = Number(process.env.MIN_WITHDRAWAL_KES || 350);

/**
 * @param {number} estimatedKes - the withdrawal's estimated KES value
 * @param {string} [currency] - reserved for a future non-KES payout rail
 * @returns {{ ok: boolean, minimumKes: number, shortfallKes: number|null }}
 */
function checkMinimumWithdrawal(estimatedKes, currency = 'KES') {
  if (currency !== 'KES') {
    logger.warn('withdrawalMinimumService: non-KES currency requested with no payout rail configured', { currency });
  }

  const ok = Number(estimatedKes) >= MIN_WITHDRAWAL_KES;
  return {
    ok,
    minimumKes: MIN_WITHDRAWAL_KES,
    shortfallKes: ok ? null : Math.round((MIN_WITHDRAWAL_KES - estimatedKes) * 100) / 100,
  };
}

module.exports = { checkMinimumWithdrawal, MIN_WITHDRAWAL_KES };
