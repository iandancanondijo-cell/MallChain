/* eslint-env node */
/* global require, module, process */
// Extracted verbatim from routes/buy.js's POST /sell handler so the exact
// same broadcast -> burn -> payout sequence is callable from two places:
// the synchronous /sell request (when liquidity+AML are already clear) and
// withdrawalLiquidityQueueService.js's queue-release path (when a held
// withdrawal's turn comes up). Behavior is unchanged from the original
// inline code — only extracted into a function returning { status, body }
// instead of writing directly to `res`, so both callers can reuse it.
const axios = require('axios');
const logger = require('../utils/logger');
const { config } = require('../config');
const { executeSellBurnWorkflow } = require('./sellBurnService');
const { initiateB2CPayout } = require('./b2cPayoutService');
const B2CPayout = require('../models/B2CPayout');
const { recordWithdrawLiquidityActivity } = require('./liquidityActivityService');

function getProviderMode() {
  return config.payment.safaricom.consumerKey && config.payment.safaricom.consumerSecret ? 'live' : 'unconfigured';
}

/**
 * Broadcasts a signed sell transaction. Returns a normalized result rather
 * than throwing, and classifies a Cosmos SDK sequence-mismatch error
 * distinctly — that's the specific failure mode a held (queued_liquidity)
 * transaction hits if the signer broadcasts anything else from that address
 * while it waits, per mallcoinTx.ts baking the account's *current* sequence
 * into the signature at sign time.
 */
async function broadcastSignedTx(txBytes) {
  const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317';
  const payload = { tx_bytes: txBytes, mode: config.chain.broadcastMode || 'BROADCAST_MODE_SYNC' };

  let chainResp;
  try {
    const resp = await axios.post(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, payload, { timeout: 10000 });
    chainResp = resp.data || {};
  } catch (err) {
    return { ok: false, sequenceMismatch: false, reason: err.message || 'broadcast failed' };
  }

  const txHash = chainResp.tx_response?.txhash || chainResp.txhash || null;
  const code = chainResp.tx_response?.code || chainResp.code || 0;

  if (code && code !== 0) {
    const rawLog = chainResp.tx_response?.raw_log || chainResp.raw_log || `code ${code}`;
    const sequenceMismatch = /account sequence mismatch|incorrect account sequence/i.test(rawLog);
    return { ok: false, sequenceMismatch, reason: rawLog, txHash };
  }

  return { ok: true, txHash };
}

/**
 * The broadcast -> burn -> B2C-payout sequence, unchanged from the original
 * inline /sell handler. Returns { status, body } for the caller to forward
 * as an HTTP response (the synchronous /sell path) or just inspect (the
 * queue-release path, which has no HTTP response to send).
 */
async function executeSellSettlement({ sale, withdrawal, txBytes, amount, phone, sellerAddress, saleId, withdrawalId, estimatedKes, saleSummary }) {
  if (!txBytes || typeof txBytes !== 'string') {
    sale.status = 'failed';
    sale.reason = 'txBytes (base64) required';
    withdrawal.status = 'failed';
    withdrawal.notes = sale.reason;
    await withdrawal.save();
    await recordWithdrawLiquidityActivity('cashout_rejected', withdrawal, {
      status: 'failed',
      saleId,
      reason: sale.reason,
    });
    await sale.save();
    return { status: 400, body: { error: 'txBytes must be provided as base64 string' } };
  }

  const broadcastResult = await broadcastSignedTx(txBytes);

  if (!broadcastResult.ok && !broadcastResult.sequenceMismatch) {
    sale.status = 'failed';
    sale.reason = broadcastResult.reason;
    withdrawal.status = 'failed';
    withdrawal.notes = broadcastResult.reason;
    await withdrawal.save();
    await recordWithdrawLiquidityActivity('sell_broadcast_failed', withdrawal, {
      status: 'failed',
      saleId,
      sellTxHash: broadcastResult.txHash || null,
      reason: broadcastResult.reason,
    });
    await sale.save();
    const isNetworkError = !broadcastResult.txHash && !broadcastResult.reason?.includes('code');
    return isNetworkError
      ? { status: 503, body: { error: 'Blockchain broadcast failed', details: broadcastResult.reason } }
      : { status: 400, body: { error: 'Transaction failed', details: broadcastResult.reason } };
  }

  if (!broadcastResult.ok && broadcastResult.sequenceMismatch) {
    // The signed tx is now stale (the account's on-chain sequence moved on
    // while this withdrawal was held) — held again, not broadcastable as-is,
    // needs POST /sell/:saleId/resign with a freshly-signed tx bytes.
    sale.status = 'resign_required';
    sale.reason = broadcastResult.reason;
    withdrawal.status = 'resign_required';
    withdrawal.notes = 'Held transaction went stale (account sequence moved) — a fresh signature is required.';
    await withdrawal.save();
    await recordWithdrawLiquidityActivity('withdraw_resign_required', withdrawal, {
      status: 'pending',
      saleId,
      reason: broadcastResult.reason,
    });
    await sale.save();
    return { status: 409, body: { error: withdrawal.notes, code: 'resign_required', details: { saleId, withdrawalId } } };
  }

  const txHash = broadcastResult.txHash;
  sale.status = 'broadcasted';
  sale.txHash = txHash;
  withdrawal.sellTxHash = txHash;
  withdrawal.status = 'pending_review';
  withdrawal.notes = 'Sell transfer broadcasted successfully; running burn and payout steps.';
  await withdrawal.save();
  await recordWithdrawLiquidityActivity('sell_broadcasted', withdrawal, {
    status: 'success',
    saleId,
    sellTxHash: txHash,
    fiatAmount: estimatedKes,
    note: 'Signed MLCNS sell transfer broadcasted to Mallchain.',
  });

  const OPERATOR_MNEMONIC = process.env.OPERATOR_MNEMONIC;
  const burnResult = await executeSellBurnWorkflow({
    saleId,
    amount,
    txHash,
    operatorMnemonic: OPERATOR_MNEMONIC,
    sale,
  });

  await sale.save();
  withdrawal.burnTxHash = burnResult.burnTxHash || withdrawal.burnTxHash;
  withdrawal.notes = 'Sell broadcast succeeded and burn workflow completed.';
  await withdrawal.save();
  await recordWithdrawLiquidityActivity('burn_recorded', withdrawal, {
    status: 'success',
    saleId,
    sellTxHash: txHash,
    burnTxHash: burnResult.burnTxHash,
    note: 'Cash-out burn and treasury split recorded.',
    metadata: {
      burnAmount: burnResult.burnAmount,
      treasuryAmount: burnResult.treasuryAmount,
      burnPercentage: burnResult.burnPercentage,
    },
  });

  let payoutRef = null;
  try {
    const payoutResult = await initiateB2CPayout({ sellerPhone: phone, mlcnsAmount: amount, saleId });

    if (payoutResult.ok) {
      payoutRef = payoutResult.payoutRef;
      const payout = await B2CPayout.create({
        saleId,
        sellerPhone: phone,
        sellerAddress,
        amount,
        pesaAmount: payoutResult.pesaAmount,
        txHash,
        payoutRef,
        payoutStatus: 'initiated',
      });
      logger.info('buy', 'B2C payout initiated', { payoutId: payout._id, ref: payoutRef });
      withdrawal.status = 'payout_initiated';
      withdrawal.payoutRef = payoutRef;
      withdrawal.amountKes = payoutResult.pesaAmount || withdrawal.amountKes;
      withdrawal.notes = 'Safaricom payout initiated for the cash-out.';
      await withdrawal.save();
      await recordWithdrawLiquidityActivity('payout_initiated', withdrawal, {
        status: 'pending',
        saleId,
        payoutRef,
        sellTxHash: txHash,
        burnTxHash: burnResult.burnTxHash,
        fiatAmount: payoutResult.pesaAmount || estimatedKes,
        providerMode: payoutResult.providerMode,
        note: 'Safaricom payout has been initiated for the withdrawal.',
      });
    } else {
      logger.warn('buy', 'B2C payout initiation failed', { error: payoutResult.error, requiresApproval: payoutResult.requiresApproval });
      withdrawal.status = payoutResult.requiresApproval ? 'pending_review' : 'failed';
      withdrawal.notes = payoutResult.error || 'Safaricom payout initiation failed.';
      await withdrawal.save();
      await recordWithdrawLiquidityActivity(
        payoutResult.requiresApproval ? 'payout_requires_review' : 'payout_initiation_failed',
        withdrawal,
        {
          status: payoutResult.requiresApproval ? 'pending' : 'failed',
          saleId,
          sellTxHash: txHash,
          burnTxHash: burnResult.burnTxHash,
          fiatAmount: estimatedKes,
          providerMode: payoutResult.providerMode,
          reason: payoutResult.error,
        }
      );
    }
  } catch (payoutErr) {
    logger.error('buy', 'B2C payout error', payoutErr);
    withdrawal.status = 'failed';
    withdrawal.notes = payoutErr.message || 'Safaricom payout error.';
    await withdrawal.save();
    await recordWithdrawLiquidityActivity('payout_initiation_failed', withdrawal, {
      status: 'failed',
      saleId,
      sellTxHash: txHash,
      burnTxHash: burnResult.burnTxHash,
      fiatAmount: estimatedKes,
      providerMode: getProviderMode(),
      reason: payoutErr.message || String(payoutErr),
    });
  }

  return {
    status: 200,
    body: {
      success: true,
      saleId,
      withdrawalId,
      txHash,
      payoutRef,
      burnAmount: burnResult.burnAmount,
      treasuryAmount: burnResult.treasuryAmount,
      burnPercentage: burnResult.burnPercentage,
      burnTxHash: burnResult.burnTxHash,
      providerMode: getProviderMode(),
      sale: saleSummary ? await saleSummary(sale) : undefined,
      network: 'mlcoin',
    },
  };
}

module.exports = { executeSellSettlement, broadcastSignedTx, getProviderMode };
