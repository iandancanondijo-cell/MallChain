const liquidityController = require('../controllers/liquidityController');
const logger = require('../utils/logger');

// The MLCN/KES pool (id 2).
const SELL_POOL_ID = 2;

/**
 * A cash-out (MLCNS -> KES) is only as safe as the liquidity actually
 * backing it: the pool's KES-side reserve represents the real value fiat
 * withdrawals draw against. Without this check, /api/buy/sell would happily
 * broadcast a burn and initiate a Safaricom payout for KES the pool doesn't
 * have, promising more than the system can back.
 *
 * Fails closed (blocks the withdrawal) if the pool can't be read — unlike
 * the buy-gate, which fails open, a withdrawal is money leaving the system
 * via a real M-Pesa payout, so an unreadable pool state should stop it
 * rather than let it through unchecked.
 */
async function checkSellLiquidity(estimatedKes) {
  let reserveKes;
  try {
    const pools = await liquidityController.fetchPoolsFromBlockchain();
    const pool = pools.find((p) => p.id === SELL_POOL_ID);
    reserveKes = pool?.reserve1 ?? 0;
  } catch (err) {
    logger.warn('sellGateService: pool liquidity check failed; blocking withdrawal', { error: err.message });
    return { ok: false, reserveKes: null, error: 'Unable to verify available liquidity right now. Please try again shortly.' };
  }

  if (estimatedKes > reserveKes) {
    return {
      ok: false,
      reserveKes,
      error: `Insufficient pool liquidity for this withdrawal (requested ~${Math.round(estimatedKes)} KES, ${Math.round(reserveKes)} KES available). Try a smaller amount.`,
    };
  }

  return { ok: true, reserveKes };
}

module.exports = { checkSellLiquidity, SELL_POOL_ID };
