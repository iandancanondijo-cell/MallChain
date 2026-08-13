/* eslint-env node */
/* global require, module, process */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const WithdrawalRequest = require('../models/WithdrawalRequest');
const B2CPayout = require('../models/B2CPayout');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const { validateRequest } = require('../utils/validationSchemas');
const schemas = require('../utils/validationSchemas');
const { config } = require('../config');
const { recordWithdrawLiquidityActivity } = require('../services/liquidityActivityService');

function autoPayoutEnabled() {
  return config.payment.safaricom.autoPayoutEnabled;
}

async function syncWithdrawalStatus(withdrawal) {
  if (!withdrawal?.payoutRef) return withdrawal;

  const payout = await B2CPayout.findOne({ payoutRef: withdrawal.payoutRef });
  if (!payout) return withdrawal;

  if (payout.payoutStatus === 'succeeded' && withdrawal.status !== 'completed') {
    withdrawal.status = 'completed';
    withdrawal.notes = 'B2C payout completed successfully.';
    await withdrawal.save();
  } else if (payout.payoutStatus === 'failed' && withdrawal.status !== 'failed') {
    withdrawal.status = 'failed';
    withdrawal.notes = payout.payoutError || 'B2C payout failed.';
    await withdrawal.save();
  }

  return withdrawal;
}

function withdrawalSummary(withdrawal) {
  return {
    withdrawalId: withdrawal.withdrawalId,
    status: withdrawal.status,
    payoutRef: withdrawal.payoutRef || null,
    notes: withdrawal.notes || null,
    amountMlcns: withdrawal.amountMlcns,
    amountKes: withdrawal.amountKes,
    currency: withdrawal.currency,
    walletAddress: withdrawal.walletAddress,
    phone: withdrawal.phone,
    settlementMode: withdrawal.settlementMode || 'review',
    saleId: withdrawal.saleId || null,
    sellTxHash: withdrawal.sellTxHash || null,
    burnTxHash: withdrawal.burnTxHash || null,
    updatedAt: withdrawal.updatedAt,
    createdAt: withdrawal.createdAt,
  };
}

router.get('/config', async (_req, res) => {
  return res.json({
    ok: true,
    payoutProvider: 'safaricom_mpesa',
    providerMode:
      config.payment.safaricom.consumerKey && config.payment.safaricom.consumerSecret
        ? 'live'
        : 'unconfigured',
    configured: {
      payout:
        Boolean(config.payment.safaricom.consumerKey && config.payment.safaricom.consumerSecret) &&
        Boolean(config.payment.safaricom.securityCredential && config.payment.safaricom.businessShortCode),
      receiver: Boolean(config.payment.safaricom.cashoutReceiverAddress),
    },
    autoPayoutEnabled: autoPayoutEnabled(),
    settlement: {
      chainBackedCashout: true,
      sellRoute: '/api/buy/sell',
      cashoutReceiverAddress: config.payment.safaricom.cashoutReceiverAddress || null,
    },
    envPlacementFile: '.env',
    envKeys: config.payment.envPlacement || [],
  });
});

router.post('/mpesa', validateRequest(schemas.withdrawMpesaSchema), async (req, res) => {
  try {
    const { walletAddress, phone, amountMlcns, amountKes, currency } = req.validatedBody;
    const withdrawalId = crypto.randomBytes(12).toString('hex');

    const withdrawal = await WithdrawalRequest.create({
      withdrawalId,
      walletAddress,
      phone,
      amountMlcns,
      amountKes,
      currency,
      status: 'pending_review',
      notes: 'Awaiting settlement review before fiat payout.',
      settlementMode: 'review',
    });
    await recordWithdrawLiquidityActivity('withdraw_request_created', withdrawal, {
      status: 'pending',
      providerMode:
        config.payment.safaricom.consumerKey && config.payment.safaricom.consumerSecret ? 'live' : 'unconfigured',
      note: 'Manual withdrawal request created for fiat settlement review.',
    });

    if (!autoPayoutEnabled()) {
      return res.status(202).json({
        ok: true,
        withdrawalId,
        status: withdrawal.status,
        settlementMode: withdrawal.settlementMode,
        message: 'Withdrawal request received and queued for review.',
      });
    }

    const payoutResult = await initiateB2CPayout({
      sellerPhone: phone,
      mlcnsAmount: amountMlcns,
      saleId: `withdrawal-${withdrawalId}`,
    });

    if (!payoutResult.ok) {
      withdrawal.status = 'failed';
      withdrawal.notes = payoutResult.error || 'Automatic payout initiation failed.';
      await withdrawal.save();
      await recordWithdrawLiquidityActivity('withdraw_payout_failed', withdrawal, {
        status: 'failed',
        payoutRef: payoutResult.payoutRef,
        providerMode: payoutResult.providerMode,
        reason: withdrawal.notes,
      });
      return res.status(502).json({
        ok: false,
        withdrawalId,
        status: withdrawal.status,
        error: withdrawal.notes,
      });
    }

    withdrawal.status = 'payout_initiated';
    withdrawal.payoutRef = payoutResult.payoutRef;
    withdrawal.notes = 'Automatic payout initiated with Safaricom.';
    await withdrawal.save();

    await B2CPayout.create({
      saleId: `withdrawal-${withdrawalId}`,
      sellerPhone: phone,
      sellerAddress: walletAddress,
      amount: amountMlcns,
      pesaAmount: payoutResult.pesaAmount || amountKes,
      payoutRef: payoutResult.payoutRef,
      payoutStatus: 'initiated',
    });
    await recordWithdrawLiquidityActivity('withdraw_payout_initiated', withdrawal, {
      status: 'pending',
      payoutRef: payoutResult.payoutRef,
      fiatAmount: payoutResult.pesaAmount || amountKes,
      providerMode: payoutResult.providerMode,
      note: 'Safaricom payout initiated for withdrawal request.',
    });

    return res.status(202).json({
      ok: true,
      withdrawalId,
      payoutRef: payoutResult.payoutRef,
      status: withdrawal.status,
      settlementMode: withdrawal.settlementMode,
      message: 'Withdrawal payout initiated successfully.',
    });
  } catch (error) {
    console.error('withdraw mpesa error', error);
    return res.status(500).json({ error: error.message || 'withdrawal failed' });
  }
});

router.get('/status/:withdrawalId', async (req, res) => {
  try {
    const withdrawal = await WithdrawalRequest.findOne({ withdrawalId: req.params.withdrawalId });
    if (!withdrawal) return res.status(404).json({ error: 'withdrawal not found' });

    await syncWithdrawalStatus(withdrawal);

    return res.json(withdrawalSummary(withdrawal));
  } catch (error) {
    console.error('withdraw status error', error);
    return res.status(500).json({ error: error.message || 'status failed' });
  }
});

module.exports = router;
