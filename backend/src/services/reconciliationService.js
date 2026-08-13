/* eslint-env node */
/* global require, module */
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const MallcoinPurchase = require('../models/MalicoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const logger = require('../utils/logger');

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

// Attempt to compensate by refunding the credited MLCNS (pull back to faucet)
async function compensateFailedLiquidity(recon) {
  try {
    if (recon.status !== 'detected') {
      console.warn('[Reconciliation] Skipping non-detected reconciliation:', recon._id);
      return null;
    }

    recon.status = 'compensating';
    await recon.save();

    // Pull back MLCNS from user wallet to faucet operator
    // This is a reversal; in production, implement via MsgTransfer with from=userWallet, to=faucetAddress
    // For now, log and mark as resolved without actual reversal (manual review needed)
    const redactedAddress = recon.walletAddress ? `${recon.walletAddress.slice(0, 6)}...${recon.walletAddress.slice(-4)}` : 'unknown';
    logger.info('[Reconciliation] Attempting compensation', {
      purchaseId: recon.purchaseId,
      mlcnsAmount: recon.mlcnsAmount,
      walletAddress: redactedAddress,
      action: 'compensation_attempt'
    });

    // TODO: implement actual on-chain reversal (e.g., MsgTransfer from user to faucet)
    // const reverseTx = await transferMlcnsReverse(recon.walletAddress, recon.mlcnsAmount);
    // recon.compensationTx = reverseTx.txHash;

    // Mark as pending_manual — do NOT auto-resolve without a real on-chain reversal.
    // Silently marking 'resolved' without a reversal is a financial integrity bug.
    recon.status = 'pending_manual';
    recon.resolvedAt = null;
    logger.warn('[Reconciliation] Manual action required', {
      mlcnsAmount: recon.mlcnsAmount,
      walletAddress: redactedAddress,
      purchaseId: recon.purchaseId,
      action: 'manual_review_needed'
    });
    await recon.save();

    return recon;
  } catch (err) {
    logger.error('[Reconciliation] Compensation failed', {
      purchaseId: recon.purchaseId,
      error: err.message || err,
      action: 'compensation_failed'
    });
    recon.status = 'detected'; // reset to detected for retry
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
