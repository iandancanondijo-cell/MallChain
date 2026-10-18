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
const { blindIndex } = require('../utils/fieldEncryption');
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
  // Never log the full MSISDN — logs are shipped to aggregators and phone is PII.
  console.log('[BADGE STK] Sending to Safaricom:', { phone: `•••${String(phone).slice(-4)}`, businessCode: stkBody.BusinessShortCode });
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
    purchase.status = 'awaiting_admin';
    purchase.mpesaRef = metadata.MpesaReceiptNumber || purchase.mpesaRef;
    purchase.reason = 'Payment confirmed — awaiting admin approval for badge issuance.';
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
    logger.error('badge', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/mpesa', validate(schemas.badgeMpesaInitiate), async (req, res) => {
  try {
    console.log('[BADGE MPESA] Starting request with body:', req.validatedBody);
    const { quoteId, phone } = req.validatedBody;
    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) {
      console.log('[BADGE MPESA] Purchase not found for quoteId:', quoteId);
      return res.status(404).json({ error: 'Quote not found' });
    }

    console.log('[BADGE MPESA] Found purchase, calling initiateMpesaRequest');
    const response = await initiateMpesaRequest(purchase, phone);
    console.log('[BADGE MPESA] Success response:', response);
    return res.json({ ...response, quoteId: purchase.quoteId, amountKes: purchase.fiatAmount });
  } catch (e) {
    const status = e.response?.status || e.status || 500;
    const message = e.response?.data?.errorMessage || e.response?.data?.message || e.message || 'unknown error';
    console.error('[BADGE MPESA] Error:', { status, message, error: e.message });
    logger.error('badge', { route: req.originalUrl, error: message, status, response: e.response?.data });
    res.status(status).json({ error: message || (status === 400 ? 'invalid request' : 'internal error') });
  }
});

router.post('/mpesa/callback', verifyWebhookToken, validate(schemas.mpesaCallback), async (req, res) => {
  try {
    const result = await processMpesaCallback(req.body);
    return res.json(result);
  } catch (e) {
    logger.error('badge', { route: req.originalUrl, error: e.message || String(e) });
    res.json({ ResultCode: 1 });
  }
});

// After admin-gated flow: the client calls this once payment is confirmed to
// acknowledge. The actual on-chain issuance is done by the admin via
// POST /api/admin/badges/approve. This endpoint now just returns current status.
router.post('/issue', validate(schemas.badgeIssue), async (req, res) => {
  try {
    const { quoteId } = req.validatedBody;

    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

    if (purchase.status === 'issued') {
      return res.json({ ok: true, success: true, message: 'Already issued', txHash: purchase.badgeTxHash });
    }

    if (purchase.status === 'awaiting_admin') {
      return res.json({ ok: true, success: false, message: 'Payment confirmed — awaiting admin approval', status: 'awaiting_admin' });
    }

    if (purchase.status === 'rejected') {
      return res.json({ ok: true, success: false, message: purchase.reason || 'Purchase was rejected by admin', status: 'rejected' });
    }

    return res.json({ ok: true, success: false, message: 'Payment is still being processed', status: purchase.status });
  } catch (e) {
    logger.error('badge', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' });
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
    logger.error('badge', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
