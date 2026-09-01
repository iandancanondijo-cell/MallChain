const WithdrawalRequest = require('../models/WithdrawalRequest');
const MallcoinSale = require('../models/MallcoinSale');
const User = require('../models/user');
const liquidityController = require('../controllers/liquidityController');
const { SELL_POOL_ID } = require('./sellGateService');
const { executeSellSettlement } = require('./sellExecutionService');
const { recordWithdrawLiquidityActivity } = require('./liquidityActivityService');
const { notifyUser } = require('./notify');
const logger = require('../utils/logger');

/**
 * Notifies the withdrawer of a state change. Falls back to a direct SMS
 * (the withdrawal's own phone number) when the wallet was never linked to a
 * User account — POST /sell itself needs no login, so this is the common
 * case, not an edge case.
 */
async function notifyWithdrawalStateChange(withdrawal, { title, body }) {
  try {
    const user = await User.findOne({ walletAddress: withdrawal.walletAddress });
    if (user) {
      await notifyUser(user, { kind: 'system', title, body, category: 'withdrawals' });
      return;
    }
    if (withdrawal.phone) {
      const { sendSms } = require('./smsService');
      await sendSms(withdrawal.phone, `${title} — ${body}`).catch(() => {});
    }
  } catch (err) {
    logger.warn('withdrawalLiquidityQueueService: notification failed (non-blocking)', { error: err.message });
  }
}

/**
 * Holds a signed withdrawal instead of broadcasting it: MLCNS stays in the
 * user's wallet, nothing touches the chain, until processQueuedWithdrawals()
 * releases it once the pool has recovered. `sale`/`withdrawal` are already-
 * created documents (matching the original /sell flow's own placement of
 * record creation) — this just transitions them into the held state.
 */
async function holdForLiquidity({ sale, withdrawal, txBytes, estimatedKes, reserveKes }) {
  const now = new Date();

  sale.status = 'queued_liquidity';
  sale.pendingTxBytes = txBytes; // encrypted on save via MallcoinSale's pre-save hook
  sale.pendingTxBytesSetAt = now;
  await sale.save();

  withdrawal.status = 'queued_liquidity';
  withdrawal.queuedAt = now;
  withdrawal.notes = 'Pool liquidity is temporarily insufficient — this withdrawal is queued and will be processed automatically once liquidity recovers.';
  await withdrawal.save();

  await recordWithdrawLiquidityActivity('withdraw_queued_liquidity', withdrawal, {
    status: 'pending',
    reserveKes,
    fiatAmount: estimatedKes,
    note: 'Withdrawal queued pending pool liquidity recovery.',
  });

  await notifyWithdrawalStateChange(withdrawal, {
    title: 'Withdrawal queued',
    body: `Your withdrawal of ~${Math.round(estimatedKes)} KES is queued until pool liquidity recovers — no action needed, it will process automatically.`,
  });
}

/**
 * Releases one queued withdrawal: decrypts its held signed tx and runs the
 * real settlement sequence. Distinguishes a stale (sequence-mismatch)
 * signature from a genuine failure — see executeSellSettlement's
 * broadcastSignedTx classification.
 */
async function releaseQueuedWithdrawal(withdrawal) {
  const sale = await MallcoinSale.findOne({ saleId: withdrawal.saleId });
  if (!sale || !sale.pendingTxBytes) {
    logger.error('withdrawalLiquidityQueueService: queued withdrawal has no held transaction', {
      withdrawalId: withdrawal.withdrawalId,
      saleId: withdrawal.saleId,
    });
    return { ok: false, reason: 'missing_pending_tx' };
  }

  const txBytes = MallcoinSale.decryptPendingTxBytes(sale);
  sale.pendingTxBytes = null;
  sale.pendingTxBytesSetAt = null;

  const result = await executeSellSettlement({
    sale,
    withdrawal,
    txBytes,
    amount: withdrawal.amountMlcns,
    phone: withdrawal.phone,
    sellerAddress: withdrawal.walletAddress,
    saleId: withdrawal.saleId,
    withdrawalId: withdrawal.withdrawalId,
    estimatedKes: withdrawal.amountKes,
  });

  if (result.status === 200) {
    await notifyWithdrawalStateChange(withdrawal, {
      title: 'Withdrawal released',
      body: 'Pool liquidity has recovered — your withdrawal is now processing.',
    });
    return { ok: true };
  }

  if (result.status === 409) {
    await notifyWithdrawalStateChange(withdrawal, {
      title: 'Action needed: re-sign your withdrawal',
      body: 'Your withdrawal was ready to process, but your account made another transaction while it waited, so the held signature is now stale. Please re-sign it to continue.',
    });
    return { ok: false, resignRequired: true };
  }

  return { ok: false, reason: result.body?.error || 'settlement_failed' };
}

/**
 * Scans queued withdrawals oldest-first against the pool's *current* KES
 * reserve, releasing what currently fits. Strict FIFO — stops at the first
 * withdrawal that doesn't fit rather than skipping ahead to smaller ones
 * behind it, matching "wait in a queue" as a literal first-come-first-served
 * model (not bin-packing for maximum pool utilization).
 */
async function processQueuedWithdrawals() {
  let reserveKes;
  try {
    const pools = await liquidityController.fetchPoolsFromBlockchain();
    reserveKes = pools.find((p) => p.id === SELL_POOL_ID)?.reserve1 ?? 0;
  } catch (err) {
    logger.warn('withdrawalLiquidityQueueService: pool read failed, skipping this scan', { error: err.message });
    return { released: [], skipped: true };
  }

  const queued = await WithdrawalRequest.find({ status: 'queued_liquidity' }).sort({ queuedAt: 1 });
  const released = [];

  for (const withdrawal of queued) {
    if (Number(withdrawal.amountKes) > reserveKes) break;

    const result = await releaseQueuedWithdrawal(withdrawal);
    if (result.ok) {
      reserveKes -= Number(withdrawal.amountKes);
      released.push(withdrawal.withdrawalId);
    }
    // resign_required / other failure: leave it out of the queue (status
    // changed by releaseQueuedWithdrawal / executeSellSettlement already)
    // and keep scanning the rest — one bad item shouldn't block the queue.
  }

  return { released, skipped: false };
}

module.exports = { holdForLiquidity, releaseQueuedWithdrawal, processQueuedWithdrawals, notifyWithdrawalStateChange };
