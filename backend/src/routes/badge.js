/* eslint-env node */
/* global require, module, process */
// KSh 17 badge purchase via M-Pesa STK push — structurally mirrors buy.js's
// reserve -> mpesa -> callback -> credit flow (pending -> payment_initiated
// -> confirmed -> processing -> issued), swapping the on-chain MLCNS credit
// for an on-chain badge issuance. The STK-push mechanics (OAuth token,
// request body, circuit breaker) are duplicated from buy.js rather than
// shared, matching this codebase's existing convention of self-contained
// per-flow tx builders (dexTxBuilder.js/burnTxBuilder.js/mallcoinTxBuilder.js
// are all separate, not a shared client) — verifyWebhookToken is the one
// piece extracted to a shared module, since it's security-critical and a
// drifted duplicate there would be a real vulnerability, not just clutter.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

const BadgePurchase = require('../models/BadgePurchase');
const BadgeIssuance = require('../models/BadgeIssuance');
const User = require('../models/user');
const { validate, schemas } = require('../middleware/validation');
const verifyWebhookToken = require('../middleware/verifyWebhookToken');
const { config } = require('../config');
const { createBlockchainBreaker } = require('../utils/circuitBreaker');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { notifyUser } = require('../services/notify');
const logger = require('../utils/logger');

const {
  apiBaseUrl: SAFARICOM_API,
  consumerKey: SAFARICOM_KEY,
  consumerSecret: SAFARICOM_SECRET,
  businessShortCode: BUSINESS_SHORT_CODE,
  passkey: PASSKEY,
  badgeCallbackUrl: CALLBACK_URL,
} = config.payment.safaricom;

const safaricomBreaker = createBlockchainBreaker();

function isStkConfigured() {
  return Boolean(SAFARICOM_KEY && SAFARICOM_SECRET && PASSKEY && BUSINESS_SHORT_CODE);
}

function getProviderMode() {
  return isStkConfigured() ? 'live' : 'unconfigured';
}

async function getSafaricomToken() {
  if (!isStkConfigured()) return null;
  const auth = Buffer.from(`${SAFARICOM_KEY}:${SAFARICOM_SECRET}`).toString('base64');
  const tokenRes = await safaricomBreaker.execute(async () => {
    return await axios.get(
      `${SAFARICOM_API.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, timeout: 5000 }
    );
  });
  const token = tokenRes.data?.access_token;
  if (!token) throw new Error('No access token from Safaricom');
  return token;
}

function buildStkBody(purchase, phone) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`).toString('base64');

  return {
    BusinessShortCode: BUSINESS_SHORT_CODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: purchase.fiatAmount,
    PartyA: phone,
    PartyB: BUSINESS_SHORT_CODE,
    PhoneNumber: phone,
    CallBackURL: CALLBACK_URL,
    AccountReference: purchase.quoteId,
    TransactionDesc: `Mallchain badge — ${purchase.quoteId}`,
  };
}

function addPaymentIdToPurchase(purchase, paymentId) {
  if (!purchase.paymentIds) purchase.paymentIds = [];
  if (!purchase.paymentIds.includes(paymentId)) purchase.paymentIds.push(paymentId);
  purchase.paymentId = paymentId;
}

async function initiateMpesaRequest(purchase, phone) {
  if (!isStkConfigured()) {
    const err = new Error('Safaricom M-Pesa badge purchase is not configured yet');
    err.status = 503;
    throw err;
  }

  const token = await getSafaricomToken();
  if (!token) {
    const err = new Error('Safaricom token could not be generated');
    err.status = 503;
    throw err;
  }

  const stkBody = buildStkBody(purchase, phone);
  const stkRes = await axios.post(
    `${SAFARICOM_API.replace(/\/$/, '')}/mpesa/stkpush/v1/processrequest`,
    stkBody,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
  );

  const resp = stkRes.data || {};
  const checkoutId = resp.CheckoutRequestID || resp.checkoutRequestID || '';
  const paymentId = checkoutId || `BADGE${Date.now()}${crypto.randomBytes(4).toString('hex')}`;

  addPaymentIdToPurchase(purchase, paymentId);
  purchase.status = 'payment_initiated';
  purchase.reason = 'STK push sent. Complete the prompt on your phone.';
  await purchase.save();

  return { ok: true, paymentId, status: 'payment_initiated', providerMode: 'live' };
}

function getMpesaCallbackData(data) {
  const callback = data?.Body?.stkCallback || {};
  return {
    paymentId: callback.CheckoutRequestID || callback.RequestID || '',
    resultCode: typeof callback.ResultCode !== 'undefined' ? callback.ResultCode : 1,
    callbackMetadata: callback.CallbackMetadata?.Item || [],
  };
}

async function processMpesaCallback(data) {
  const { paymentId, resultCode, callbackMetadata } = getMpesaCallbackData(data);
  if (!paymentId) return { ResultCode: 1 };

  const purchase = await BadgePurchase.findOne({ $or: [{ paymentId }, { paymentIds: paymentId }] });
  if (!purchase) return { ResultCode: 0 };

  if (resultCode === 0) {
    const metadata = {};
    callbackMetadata.forEach((item) => { metadata[item.Name] = item.Value; });
    purchase.status = 'confirmed';
    purchase.mpesaRef = metadata.MpesaReceiptNumber || purchase.mpesaRef;
    purchase.reason = 'Safaricom payment confirmed.';
  } else {
    purchase.status = 'failed';
    purchase.reason = 'User cancelled or payment failed';
  }

  await purchase.save();
  return { ResultCode: 0 };
}

router.get('/config', async (_req, res) => {
  res.json({
    priceKes: config.badge.purchasePriceKes,
    providerMode: getProviderMode(),
  });
});

router.post('/reserve', validate(schemas.badgeReserve), async (req, res) => {
  try {
    const { walletAddress, phone } = req.validatedBody;
    const quoteId = crypto.randomBytes(12).toString('hex');

    const purchase = await BadgePurchase.create({
      quoteId,
      walletAddress,
      phone,
      fiatAmount: config.badge.purchasePriceKes,
      currency: 'KES',
      status: 'pending',
    });

    return res.json({
      ok: true,
      quoteId,
      fiatAmount: purchase.fiatAmount,
      currency: purchase.currency,
      providerMode: getProviderMode(),
    });
  } catch (e) {
    logger.error('badge', 'reserve error', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/mpesa', validate(schemas.badgeMpesaInitiate), async (req, res) => {
  try {
    const { quoteId, phone } = req.validatedBody;
    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ error: 'Quote not found' });

    const response = await initiateMpesaRequest(purchase, phone);
    return res.json({ ...response, quoteId: purchase.quoteId, amountKes: purchase.fiatAmount });
  } catch (e) {
    logger.error('badge', 'M-Pesa initiate error', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/mpesa/callback', verifyWebhookToken, validate(schemas.mpesaCallback), async (req, res) => {
  try {
    const result = await processMpesaCallback(req.body);
    return res.json(result);
  } catch (e) {
    logger.error('badge', 'M-Pesa callback error', e);
    res.json({ ResultCode: 1 });
  }
});

// Client-triggered final step, once /mpesa/callback has flipped the
// purchase to 'confirmed'. Same atomic confirmed->processing guard as
// buy.js's handleReservedCredit, for the same reason: this must only ever
// run once per purchase even if the client retries the request.
router.post('/issue', validate(schemas.badgeIssue), async (req, res) => {
  try {
    const { quoteId, walletAddress } = req.validatedBody;

    const current = await BadgePurchase.findOne({ quoteId });
    if (!current) return res.status(404).json({ error: 'Purchase not found' });

    if (walletAddress && walletAddress !== current.walletAddress) {
      return res.status(400).json({ error: 'The requested wallet address does not match the reserved purchase', code: 'wallet_address_mismatch' });
    }

    if (current.status === 'issued') {
      return res.json({ ok: true, success: true, message: 'Already issued', txHash: current.badgeTxHash });
    }

    if (current.status !== 'confirmed') {
      return res.status(400).json({ error: 'The purchase has not been confirmed by the payment provider yet', code: 'payment_not_confirmed', status: current.status });
    }

    const purchase = await BadgePurchase.findOneAndUpdate(
      { quoteId, status: 'confirmed' },
      { $set: { status: 'processing' } },
      { new: true }
    );
    if (!purchase) return res.status(409).json({ error: 'Purchase is already being processed' });

    const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
    if (!operatorMnemonic) {
      purchase.status = 'confirmed'; // roll back so a later retry (once configured) can proceed
      await purchase.save();
      return res.status(503).json({ error: 'Badge issuance is not configured yet' });
    }

    try {
      const result = await issueBadgeFromMnemonic({
        mnemonic: operatorMnemonic,
        recipient: purchase.walletAddress,
        badgeType: 'gold',
      });

      purchase.status = 'issued';
      purchase.badgeTxHash = result.txHash;
      await purchase.save();

      const user = await User.findOne({ walletAddress: purchase.walletAddress }).lean();
      if (user) {
        await BadgeIssuance.create({
          userId: user._id,
          walletAddress: purchase.walletAddress,
          method: 'purchase',
          badgeType: 'gold',
          txHash: result.txHash,
        });
        await notifyUser(user, {
          kind: 'badge',
          title: 'Badge purchased!',
          body: 'You can now convert Mallpoints to Mallcoin every month on the 15th.',
        });
      } else {
        await BadgeIssuance.create({
          walletAddress: purchase.walletAddress,
          method: 'purchase',
          badgeType: 'gold',
          txHash: result.txHash,
        });
      }

      return res.json({ ok: true, success: true, txHash: result.txHash });
    } catch (issueErr) {
      purchase.status = 'confirmed'; // roll back — payment already succeeded, allow retry
      purchase.reason = issueErr.message;
      await purchase.save();
      throw issueErr;
    }
  } catch (e) {
    logger.error('badge', 'issue error', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/status/:quoteId', async (req, res) => {
  try {
    const { error, value } = schemas.badgeStatusParam.validate(req.params);
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid quote id' });
    }
    const purchase = await BadgePurchase.findOne({ quoteId: value.quoteId }).lean();
    if (!purchase) return res.status(404).json({ error: 'Quote not found' });
    return res.json({
      ok: true,
      quoteId: purchase.quoteId,
      status: purchase.status,
      fiatAmount: purchase.fiatAmount,
      badgeTxHash: purchase.badgeTxHash || null,
      reason: purchase.reason || null,
    });
  } catch (e) {
    logger.error('badge', 'status error', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
