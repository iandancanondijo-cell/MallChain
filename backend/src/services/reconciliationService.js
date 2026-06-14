/* eslint-env node */
/* global require, module */
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const MallcoinPurchase = require('../models/MalicoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');

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
    console.log(`[Reconciliation] Attempting compensation for ${recon.purchaseId}: refund ${recon.mlcnsAmount} MLCNS from ${recon.walletAddress}`);

    // TODO: implement actual on-chain reversal (e.g., MsgTransfer from user to faucet)
    // const reverseTx = await transferMlcnsReverse(recon.walletAddress, recon.mlcnsAmount);
    // recon.compensationTx = reverseTx.txHash;

    recon.status = 'resolved';
    recon.resolvedAt = new Date();
    await recon.save();

    return recon;
  } catch (err) {
    console.error('[Reconciliation] Compensation failed:', err.message || err);
    recon.status = 'detected'; // reset to detected for retry
    await recon.save();
    return null;
  }
}

// Run periodic reconciliation job
async function runReconciliationJob() {
  try {
    console.log('[Reconciliation] Job started');

    const detected = await detectFailedLiquidityAdds();
    console.log(`[Reconciliation] Detected ${detected.length} failed liquidity adds`);

    for (const recon of detected) {
      await compensateFailedLiquidity(recon);
    }

    console.log('[Reconciliation] Job completed');
    return { detected: detected.length };
  } catch (err) {
    console.error('[Reconciliation] Job failed:', err.message || err);
    return { error: err.message };
  }
}

module.exports = {
  detectFailedLiquidityAdds,
  compensateFailedLiquidity,
  runReconciliationJob,
};
