/* eslint-env node */
/* global require, module */
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const MallcoinPurchase = require('../models/MallcoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const { recordBuyLiquidityActivity } = require('./liquidityActivityService');
const logger = require('../utils/logger');

const DEFAULT_POOL_ID = 2; // MLCN/KES — see routes/liquidity.js's SELL_POOL_ID convention

// Scan for purchases with creditTxHash but liquidityError set
async function detectFailedLiquidityAdds() {
  try {
    const failed = await MallcoinPurchase.find({
      status: 'credited',
      liquidityError: { $exists: true, $ne: null },
      txHash: { $exists: true, $ne: null },
    });

    const results = [];
    for (const purchase of failed) {
      const existing = await LiquidityReconciliation.findOne({ purchaseId: purchase._id });
      if (!existing) {
        const recon = await LiquidityReconciliation.create({
          purchaseId: purchase._id.toString(),
          quoteId: purchase.quoteId,
          creditTxHash: purchase.txHash,
          walletAddress: purchase.walletAddress,
          mlcnsAmount: purchase.amount,
          fiatAmount: purchase.fiatAmount,
          reason: purchase.liquidityError,
          status: 'detected',
        });
        results.push(recon);
      }
    }

    return results;
  } catch (err) {
    console.error('[Reconciliation] Detection failed:', err.message || err);
    return [];
  }
}

// Compensate a failed liquidity-add by settling its ledger bookkeeping.
//
// The MLCN/KES pool is the credited-purchase ledger itself (see
// liquidityController.fetchLedgerPoolReserves) — a purchase with status
// 'credited' is already fully part of the pool, so there is no on-chain
// step to retry. The old compensation re-signed the operator's
// MsgAddLiquidity, which could never succeed (the operator account was
// never funded, and the x/dex module holds bank coins while MLCNS lives in
// x/mlcoin's internal ledger), leaving every recon stuck in pending_manual.
async function compensateFailedLiquidity(recon) {
  try {
    if (!['detected', 'pending_manual'].includes(recon.status)) {
      console.warn('[Reconciliation] Skipping non-actionable reconciliation:', recon._id, recon.status);
      return null;
    }

    recon.status = 'compensating';
    await recon.save();

    const redactedAddress = recon.walletAddress ? `${recon.walletAddress.slice(0, 6)}...${recon.walletAddress.slice(-4)}` : 'unknown';
    logger.info('[Reconciliation] Attempting compensation', {
      purchaseId: recon.purchaseId,
      mlcnsAmount: recon.mlcnsAmount,
      walletAddress: redactedAddress,
      action: 'compensation_attempt'
    });

    const purchase = await MallcoinPurchase.findById(recon.purchaseId).catch(() => null);
    if (!purchase || purchase.status !== 'credited') {
      recon.status = 'pending_manual';
      recon.reason = 'Purchase is not in credited state; liquidity bookkeeping cannot be settled.';
      recon.resolvedAt = null;
      await recon.save();
      return null;
    }

    purchase.liquidityAdded = true;
    purchase.liquidityPoolId = purchase.liquidityPoolId || DEFAULT_POOL_ID;
    purchase.liquidityError = undefined;
    await purchase.save();

    recon.status = 'resolved';
    recon.resolvedAt = new Date();
    await recon.save();

    await recordBuyLiquidityActivity(
      'liquidity_add_reconciled',
      purchase,
      {
        status: 'success',
        poolId: purchase.liquidityPoolId,
        note: 'Liquidity bookkeeping settled via the credited-purchase ledger during reconciliation.',
        metadata: { reconciliationId: recon._id.toString() },
      }
    ).catch((activityErr) => logger.warn('[Reconciliation] Failed to record reconciled activity', { error: activityErr.message || activityErr }));

    logger.info('[Reconciliation] Compensation succeeded — liquidity tracked via purchase ledger', {
      purchaseId: recon.purchaseId,
      mlcnsAmount: recon.mlcnsAmount,
      walletAddress: redactedAddress,
      action: 'compensation_succeeded',
    });

    return recon;
  } catch (err) {
    logger.error('[Reconciliation] Compensation failed', {
      purchaseId: recon.purchaseId,
      error: err.message || err,
      action: 'compensation_failed'
    });
    recon.status = 'pending_manual';
    recon.reason = err.message || String(err);
    recon.resolvedAt = null;
    await recon.save();
    return null;
  }
}

// Run periodic reconciliation job
async function runReconciliationJob() {
  try {
    logger.info('[Reconciliation] Job started');

    const detected = await detectFailedLiquidityAdds();
    logger.info('[Reconciliation] Detected failed liquidity adds', { count: detected.length });

    // detectFailedLiquidityAdds skips purchases that already have a recon
    // record, so records left unresolved by an earlier run (or an older code
    // version) must be swept here or they would never be retried.
    const unresolved = await LiquidityReconciliation.find({ status: { $in: ['detected', 'pending_manual'] } });
    const queue = [...detected];
    for (const recon of unresolved) {
      if (!queue.some((r) => String(r._id) === String(recon._id))) queue.push(recon);
    }

    for (const recon of queue) {
      await compensateFailedLiquidity(recon);
    }
    // compensateFailedLiquidity resolves to the recon doc on success and
    // null when the item stayed unresolved — re-read statuses to report an
    // honest checked/resolved/unresolved summary for the hourly cron job
    // (src/jobs/liquidityReconciliation.js).
    const resolved = queue.filter((r) => r.status === 'resolved').length;
    const unresolvedCount = queue.length - resolved;

    logger.info('[Reconciliation] Job completed', {
      checked: queue.length,
      resolved,
      unresolved: unresolvedCount,
    });
    return {
      detected: detected.length,
      processed: queue.length,
      checked: queue.length,
      resolved,
      unresolved: unresolvedCount,
    };
  } catch (err) {
    logger.error('[Reconciliation] Job failed', { error: err.message || err });
    return { error: err.message };
  }
}

module.exports = {
  detectFailedLiquidityAdds,
  compensateFailedLiquidity,
  runReconciliationJob,
};
