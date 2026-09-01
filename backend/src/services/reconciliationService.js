/* eslint-env node */
/* global require, module */
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const MallcoinPurchase = require('../models/MallcoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const { addLiquidityToPool } = require('../controllers/liquidityController');
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

// Compensate a failed liquidity-add by retrying it.
//
// The failure being compensated for is the *operator's own* add-liquidity
// transaction (routes/buy.js's applyLiquidityAfterCredit, funded and signed
// entirely from OPERATOR_MNEMONIC — see liquidityController.js's
// addLiquidityToPool) failing after the user's MLCNS credit had already
// succeeded. The user legitimately owns that MLCNS; there is no user-signed
// step to reverse, and — unlike this file's previous comment suggested —
// the operator has no way to sign a "MsgTransfer from user to faucet" out
// of a wallet whose private key it doesn't hold. So the correct
// compensation is simply retrying the operator's own liquidity-add with the
// same amounts, which the operator's mnemonic can legitimately (re-)sign.
async function compensateFailedLiquidity(recon) {
  try {
    if (recon.status !== 'detected') {
      console.warn('[Reconciliation] Skipping non-detected reconciliation:', recon._id);
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
    const poolId = purchase?.liquidityPoolId || DEFAULT_POOL_ID;

    const liquidityResult = await addLiquidityToPool({
      poolId,
      amount0: recon.mlcnsAmount,
      amount1: recon.fiatAmount,
      userAddress: recon.walletAddress,
    });

    recon.status = 'resolved';
    recon.compensationTx = liquidityResult.txHash;
    recon.resolvedAt = new Date();
    await recon.save();

    if (purchase) {
      purchase.liquidityAdded = true;
      purchase.lpTokens = Number(liquidityResult.lpTokens) || 0;
      purchase.liquidityPoolId = poolId;
      purchase.liquidityError = undefined;
      await purchase.save();
    }

    await recordBuyLiquidityActivity(
      'liquidity_add_reconciled',
      purchase || { walletAddress: recon.walletAddress, amount: recon.mlcnsAmount, fiatAmount: recon.fiatAmount, quoteId: recon.quoteId },
      {
        status: 'success',
        poolId,
        liquidityTxHash: liquidityResult.txHash,
        lpTokens: Number(liquidityResult.lpTokens) || 0,
        note: 'Liquidity add retried and succeeded during reconciliation.',
        metadata: { reconciliationId: recon._id.toString(), shareOfPool: liquidityResult.shareOfPool },
      }
    ).catch((activityErr) => logger.warn('[Reconciliation] Failed to record reconciled activity', { error: activityErr.message || activityErr }));

    logger.info('[Reconciliation] Compensation succeeded — liquidity retried and added', {
      purchaseId: recon.purchaseId,
      mlcnsAmount: recon.mlcnsAmount,
      walletAddress: redactedAddress,
      txHash: liquidityResult.txHash,
      action: 'compensation_succeeded',
    });

    return recon;
  } catch (err) {
    // The retry itself failed (chain unreachable, OPERATOR_MNEMONIC missing,
    // pool gone, etc.) — fall back to requiring a human rather than looping
    // forever or silently marking this resolved without a real fix. The new
    // failure reason is recorded since it may differ from the original.
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

    for (const recon of detected) {
      await compensateFailedLiquidity(recon);
    }

    logger.info('[Reconciliation] Job completed');
    return { detected: detected.length };
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
