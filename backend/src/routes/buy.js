/* eslint-env node */
/* global require, module, process */
const express = require('express');
const router = express.Router();
const MallcoinPurchase = require('../models/MallcoinPurchase');
const MallcoinSale = require('../models/MallcoinSale');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { validate, schemas } = require('../middleware/validation');
const axios = require('axios');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const logger = require('../utils/logger');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const B2CPayout = require('../models/B2CPayout');
const { executeSellBurnWorkflow } = require("../services/sellBurnService");
const { config } = require('../config');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { getMarketPrice } = require('../services/mallcoinService');
const { createBlockchainBreaker, createPaymentBackoff } = require('../utils/circuitBreaker');
const { processMpesaCallback } = require('../services/mpesaCallbackService');
const { enqueueFailedCallback } = require('../mallwallet/queue/paymentCallbackQueue');
const { getBuyGateStatus, requireDirectBuyUnlocked } = require('../services/buyGateService');
const { checkSellLiquidity } = require('../services/sellGateService');
const User = require('../models/user');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const { checkMinimumWithdrawal } = require('../services/withdrawalMinimumService');
const { checkWeeklyWithdrawalLimit, WEEKLY_WITHDRAWAL_LIMIT } = require('../services/withdrawalRateLimitService');
const { requireApprovedAmlReview, checkAndFlagStructuring, AML_WITHDRAWAL_THRESHOLD_KES } = require('../services/withdrawalAmlGateService');
const { holdForLiquidity } = require('../services/withdrawalLiquidityQueueService');
const { executeSellSettlement } = require('../services/sellExecutionService');
const verifyWebhookToken = require('../middleware/verifyWebhookToken');
const { limiters } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const {
  recordBuyLiquidityActivity,
  recordWithdrawLiquidityActivity,
} = require('../services/liquidityActivityService');

const {
  apiBaseUrl: SAFARICOM_API,
  consumerKey: SAFARICOM_KEY,
  consumerSecret: SAFARICOM_SECRET,
  businessShortCode: BUSINESS_SHORT_CODE,
  passkey: PASSKEY,
  stkCallbackUrl: CALLBACK_URL,
} = config.payment.safaricom;

const safaricomBreaker = createBlockchainBreaker();
const paymentBackoff = createPaymentBackoff();

const makePaymentId = () => {
  // Generate cryptographically random payment ID to prevent enumeration attacks
  const randomBytes = crypto.randomBytes(16);
  const randomHex = randomBytes.toString('hex').toUpperCase();
  return `PAY${randomHex}`;
};

function isStkConfigured() {
  return Boolean(SAFARICOM_KEY && SAFARICOM_SECRET && PASSKEY && BUSINESS_SHORT_CODE);
}

function isPayoutConfigured() {
  const payout = config.payment.safaricom;
  return Boolean(
    payout.consumerKey &&
    payout.consumerSecret &&
    payout.securityCredential &&
    payout.businessShortCode
  );
}

async function getSafaricomToken() {
  if (!SAFARICOM_KEY || !SAFARICOM_SECRET || !PASSKEY || !BUSINESS_SHORT_CODE) {
    return null;
  }

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

function buildStkBody(purchase, phone, amount, description) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`).toString('base64');

  return {
    BusinessShortCode: BUSINESS_SHORT_CODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount),
    PartyA: phone,
    PartyB: BUSINESS_SHORT_CODE,
    PhoneNumber: phone,
    CallBackURL: CALLBACK_URL,
    AccountReference: purchase.mpesaRef || purchase.quoteId,
    TransactionDesc: description || `Purchase ${purchase.quoteId}`,
  };
}

function addPaymentIdToPurchase(purchase, paymentId) {
  if (!purchase.paymentIds) {
    purchase.paymentIds = [];
  }
  if (!purchase.paymentIds.includes(paymentId)) {
    purchase.paymentIds.push(paymentId);
  }
  purchase.paymentId = paymentId;
}

async function initiateMpesaRequest(purchase, phone, amount, description) {
  if (!isStkConfigured()) {
    const err = new Error('Safaricom M-Pesa buy flow is not configured yet');
    err.status = 503;
    throw err;
  }

  // A client retry (double-tap, request timeout) hitting POST /mpesa again
  // for a quote that already got a real STK push out must not fire a
  // second one — the user would get two prompts on their phone for the
  // same purchase. Once status has moved past 'pending' a push already
  // went out (or the purchase is done/failed), so just report that back.
  if (purchase.status !== 'pending') {
    return {
      ok: true,
      paymentId: purchase.paymentId || purchase.paymentIds?.[purchase.paymentIds.length - 1] || null,
      status: purchase.status,
      raw: null,
      providerMode: getProviderMode(),
      duplicate: true,
    };
  }

  try {
    const token = await getSafaricomToken();
    if (!token) {
      const err = new Error('Safaricom token could not be generated');
      err.status = 503;
      throw err;
    }

    // STK push Amount must be the fiat (KES) amount, not the MLCNS amount.
    // The `amount` parameter here is MLCNS (from the frontend), but Safaricom
    // charges in KES. Use purchase.fiatAmount which was set during /reserve.
    const stkBody = buildStkBody(purchase, phone, purchase.fiatAmount, description);
    const stkRes = await paymentBackoff.execute(async () => {
      try {
        return await axios.post(
          `${SAFARICOM_API.replace(/\/$/, '')}/mpesa/stkpush/v1/processrequest`,
          stkBody,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
      } catch (err) {
        // A 4xx means Safaricom rejected the request itself (bad phone
        // number, bad shortcode/passkey) — retrying the identical body
        // can't fix that, so stop instead of burning 3 attempts on it.
        if (err.response && err.response.status < 500) err.retryable = false;
        throw err;
      }
    }, 'stkpush');

    const resp = stkRes.data || {};
    const checkoutId = resp.CheckoutRequestID || resp.checkoutRequestID || '';
    const paymentId = checkoutId || makePaymentId();

    addPaymentIdToPurchase(purchase, paymentId);
    purchase.status = 'payment_initiated';
    purchase.reason = 'STK push sent. Complete the prompt on your phone.';
    await purchase.save();
    await recordBuyLiquidityActivity('payment_initiated', purchase, {
      status: 'pending',
      paymentId,
      providerMode: 'live',
      note: 'Safaricom STK push initiated for buy flow.',
      metadata: { safaricomResponse: resp },
    });

    return { ok: true, paymentId, status: 'payment_initiated', raw: resp, providerMode: 'live' };
  } catch (e) {
    await recordBuyLiquidityActivity('payment_initiation_failed', purchase, {
      status: 'failed',
      providerMode: getProviderMode(),
      reason: e.message || String(e),
    }).catch(() => null);
    logger.warn('buy', 'STK push failed', { error: e.message || String(e) });
    throw e;
  }
}

function getProviderMode() {
  return isStkConfigured() ? 'live' : 'unconfigured';
}

function paymentSummary(purchase) {
  if (!purchase) return null;
  return {
    quoteId: purchase.quoteId,
    paymentId: purchase.paymentId || purchase.paymentIds?.[purchase.paymentIds.length - 1] || null,
    walletAddress: purchase.walletAddress,
    phone: purchase.phone,
    amountMlcns: purchase.amount,
    amountKes: purchase.fiatAmount,
    currency: purchase.currency || 'KES',
    status: purchase.status,
    reason: purchase.reason || null,
    txHash: purchase.txHash || null,
    liquidityAdded: Boolean(purchase.liquidityAdded),
    liquidityPoolId: purchase.liquidityPoolId || null,
    liquidityError: purchase.liquidityError || null,
    lpTokens: purchase.lpTokens || 0,
    mpesaRef: purchase.mpesaRef || null,
    providerMode: getProviderMode(),
    createdAt: purchase.createdAt,
    expiresAt: purchase.expiresAt,
  };
}

async function syncSaleWithPayout(sale) {
  if (!sale) return { sale, payout: null };

  const payout = await B2CPayout.findOne({ saleId: sale.saleId });
  if (payout?.payoutStatus === 'succeeded' && sale.status !== 'completed') {
    sale.status = 'completed';
    sale.reason = undefined;
    await sale.save();
  } else if (payout?.payoutStatus === 'failed' && sale.status !== 'failed') {
    sale.status = 'failed';
    sale.reason = payout.payoutError || 'Cash-out payout failed.';
    await sale.save();
  }

  return { sale, payout };
}

async function ensureLiquidityReconciliation(purchase, reason) {
  if (!purchase?._id || !purchase?.txHash) {
    return null;
  }

  return LiquidityReconciliation.findOneAndUpdate(
    { purchaseId: purchase._id.toString() },
    {
      $setOnInsert: {
        purchaseId: purchase._id.toString(),
        quoteId: purchase.quoteId,
        creditTxHash: purchase.txHash,
        walletAddress: purchase.walletAddress,
        mlcnsAmount: purchase.amount,
        fiatAmount: purchase.fiatAmount,
      },
      $set: {
        reason: reason || purchase.liquidityError,
        status: 'detected',
      },
    },
    { upsert: true, new: true }
  );
}

async function saleSummary(sale) {
  if (!sale) return null;
  const { payout } = await syncSaleWithPayout(sale);

  return {
    saleId: sale.saleId,
    sellerAddress: sale.sellerAddress,
    amountMlcns: sale.amount,
    phone: sale.phone || null,
    status: sale.status,
    overallStatus:
      payout?.payoutStatus === 'succeeded'
        ? 'completed'
        : payout?.payoutStatus === 'failed'
          ? 'failed'
          : payout?.payoutStatus === 'initiated'
            ? 'payout_initiated'
            : sale.status,
    txHash: sale.txHash || null,
    burnAmount: sale.burnAmount || 0,
    treasuryAmount: sale.treasuryAmount || 0,
    burnPercentage: sale.burnPercentage || 0,
    burnTxHash: sale.burnTxHash || null,
    payoutRef: payout?.payoutRef || null,
    payoutStatus: payout?.payoutStatus || null,
    payoutError: payout?.payoutError || null,
    payoutAmountKes: payout?.pesaAmount || null,
    providerMode: getProviderMode(),
    createdAt: sale.createdAt,
  };
}

router.get('/config', async (_req, res) => {
  const keys = config.payment.envPlacement || [];
  const [gate, price] = await Promise.all([getBuyGateStatus(), getMarketPrice()]);
  return res.json({
    ok: true,
    provider: 'safaricom_mpesa',
    providerMode: getProviderMode(),
    configured: {
      stkPush: isStkConfigured(),
      b2cPayout: isPayoutConfigured(),
    },
    envPlacementFile: '.env',
    envKeys: keys,
    callbackUrls: {
      stk: CALLBACK_URL,
      payout: config.payment.safaricom.payoutCallbackUrl,
    },
    chainSettlement: {
      buyCreditRoute: '/api/buy/credit',
      withdrawSellRoute: '/api/buy/sell',
      cashoutReceiverAddress: config.payment.safaricom.cashoutReceiverAddress || null,
    },
    rates: {
      buyPriceKes: price.buyPriceKes,
      sellPriceKes: price.sellPriceKes,
    },
    directBuy: {
      locked: gate.locked,
      thresholdKes: gate.thresholdKes,
      reserveKes: gate.reserveKes,
    },
  });
});

async function applyLiquidityAfterCredit(purchase, creditAddress, mlcnsAmount) {
  const fiatAmount = Number(purchase.fiatAmount || 0);
  if (fiatAmount <= 0) return null;

  const liquidityResult = await addLiquidityToPool({
    poolId: 2,
    amount0: mlcnsAmount,
    amount1: fiatAmount,
    userAddress: creditAddress,
  });

  purchase.liquidityAdded = true;
  purchase.lpTokens = Number(liquidityResult.lpTokens) || 0;
  purchase.liquidityPoolId = 2;
  await recordBuyLiquidityActivity('liquidity_added', purchase, {
    status: 'success',
    poolId: 2,
    lpTokens: Number(liquidityResult.lpTokens) || 0,
    liquidityTxHash: liquidityResult.txHash,
    note: 'Liquidity was added to the linked pool after fiat buy settlement.',
    metadata: {
      shareOfPool: liquidityResult.shareOfPool,
      userPosition: liquidityResult.userPosition,
    },
  });
  return liquidityResult;
}

async function handleReservedCredit({ quoteId, walletAddress, creditMlcns }) {
  // Atomic status transition to prevent concurrent processing
  // Try to move from 'confirmed' -> 'processing'; if already credited or not confirmed, handle accordingly
  const current = await MallcoinPurchase.findOne({ quoteId });
  if (!current) {
    const err = new Error('Purchase not found');
    err.status = 404;
    throw err;
  }

  if (walletAddress && walletAddress !== current.walletAddress) {
    const err = new Error('The requested wallet address does not match the reserved purchase');
    err.status = 400;
    err.code = 'wallet_address_mismatch';
    throw err;
  }

  if (current.status === 'credited') {
    return { ok: true, success: true, message: 'Already credited', txHash: current.txHash };
  }

  if (current.status !== 'confirmed') {
    const err = new Error('The purchase has not been confirmed by the payment provider yet');
    err.status = 400;
    err.code = 'payment_not_confirmed';
    err.details = { status: current.status };
    throw err;
  }

  const purchase = await MallcoinPurchase.findOneAndUpdate(
    { quoteId, status: 'confirmed' },
    { $set: { status: 'processing' } },
    { new: true }
  );

  if (!purchase) {
    // Some other worker may be processing it
    const err = new Error('Purchase is already being processed');
    err.status = 409;
    throw err;
  }

  await recordBuyLiquidityActivity('credit_processing_started', purchase, {
    status: 'pending',
    providerMode: getProviderMode(),
    note: 'Preparing on-chain MLCNS credit for confirmed fiat buy.',
  });

  const mlcnsAmount = Number(purchase.amount || 0);
  const creditAddress = purchase.walletAddress;
  const result = await creditMlcns(creditAddress, mlcnsAmount);

  purchase.txHash = result.transfer?.txHash;
  purchase.status = 'credited';
  purchase.liquidityAdded = false;
  purchase.liquidityPoolId = undefined;
  purchase.liquidityError = undefined;
  purchase.lpTokens = 0;
  await recordBuyLiquidityActivity('credit_settled', purchase, {
    status: 'success',
    creditTxHash: result.transfer?.txHash,
    note: 'Buy flow credited MLCNS on-chain.',
    metadata: { balance: result.balance },
  });

  let liquidityResult = null;
  try {
    liquidityResult = await applyLiquidityAfterCredit(purchase, creditAddress, mlcnsAmount);
  } catch (liqErr) {
    logger.warn('buy', 'liquidity pool add failed', { error: liqErr.message || String(liqErr) });
    purchase.liquidityAdded = false;
    purchase.liquidityError = liqErr.message || String(liqErr);
    await ensureLiquidityReconciliation(purchase, purchase.liquidityError);
    await recordBuyLiquidityActivity('liquidity_add_failed', purchase, {
      status: 'failed',
      poolId: 2,
      reason: purchase.liquidityError,
      note: 'Liquidity add failed after a successful fiat buy credit.',
    });
  }

  await purchase.save();
  return { ok: true, success: true, txHash: result.transfer?.txHash, balance: result.balance, liquidity: liquidityResult };
}

// Reserve a quote for Mallcoin purchase
//
// A client retry (timeout, double-tap) previously meant a second
// MallcoinPurchase record reserved for the same intent — same failure
// mode withdraw.js's /mpesa already guards against with an Idempotency-Key.
router.post('/reserve', limiters.financial, idempotency({ required: true }), requireDirectBuyUnlocked(), validate(schemas.buyReserve), async (req, res) => {
  try {
    const { amount, fiat, currency, walletAddress, phone } = req.validatedBody;

    const quoteId = crypto.randomBytes(12).toString('hex');
    const mpesaRef = 'MLCNS' + Date.now();
    
    // schemas.buyReserve validates `fiat` as `number | string` — Joi's
    // alternatives() coerces any clean numeric string (e.g. the plain "160"
    // WalletBuy.tsx actually sends) into a real number, not just a string
    // with currency text like "4200 KES". `fiat.replace(...)` unconditionally
    // assumed a string and threw "fiat.replace is not a function" on that
    // real, common shape — i.e. this crashed on ordinary buy requests as
    // they're actually sent today, not just some theoretical malformed input.
    const fiatAmount = typeof fiat === 'number' ? fiat : Number(String(fiat).replace(/[^\d.-]/g, '')) || 0;

    const purchase = await MallcoinPurchase.create({
      quoteId,
      walletAddress,
      amount: Number(amount),
      fiatAmount,
      currency: currency || 'KES',
      phone,
      mpesaRef,
      status: 'pending'
    });
    await recordBuyLiquidityActivity('buy_reserved', purchase, {
      status: 'pending',
      providerMode: getProviderMode(),
      note: 'Fiat buy quote reserved and linked to pool settlement tracking.',
    });

    return res.json({
      ok: true,
      quoteId,
      mpesaRef,
      fiatAmount: purchase.fiatAmount,
      currency: purchase.currency,
      providerMode: getProviderMode(),
      quote: paymentSummary(purchase),
    });
  } catch (e) {
    logger.error('buy', 'buy reserve error', e);
    res.status(500).json({ error: e.message });
  }
});

// Initiate M-Pesa STK push — Idempotency-Key required for the same reason
// as /reserve above: a retried request here would prompt the buyer's phone
// with a second STK push for the same quote rather than replaying the
// first response.
router.post('/mpesa', limiters.financial, idempotency({ required: true }), requireDirectBuyUnlocked(), validate(schemas.buyMpesaInitiate), async (req, res) => {
  try {
    const { quoteId, phone, amount, description } = req.validatedBody;

    const purchase = await MallcoinPurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ error: 'Quote not found' });

    const response = await initiateMpesaRequest(purchase, phone, amount, description);
    return res.json({
      ...response,
      quoteId: purchase.quoteId,
      mpesaRef: purchase.mpesaRef,
      amountKes: purchase.fiatAmount,
      amountMlcns: purchase.amount,
      currency: purchase.currency,
    });
  } catch (e) {
    logger.error('buy', 'M-Pesa initiate error', e);
    res.status(500).json({ error: e.message });
  }
});

// Check payment status
router.get('/status/:paymentId', async (req, res) => {
  try {
    const { error, value } = schemas.buyStatusParam.validate(req.params);
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid payment id' });
    }
    const { paymentId } = value;
    const purchase = await MallcoinPurchase.findOne({
      $or: [
        { paymentId },
        { paymentIds: paymentId }
      ]
    });
    if (!purchase) return res.json({ status: 'unknown', providerMode: getProviderMode() });
    return res.json(paymentSummary(purchase));
  } catch (e) {
    logger.error('buy', 'status check error', e);
    res.json({ status: 'error', reason: e.message, providerMode: getProviderMode() });
  }
});

// M-Pesa callback (simulated for sandbox)
router.post('/mpesa/callback', verifyWebhookToken, validate(schemas.mpesaCallback), async (req, res) => {
  try {
    const result = await processMpesaCallback(req.body);
    return res.json(result);
  } catch (e) {
    logger.error('buy', 'M-Pesa callback error', e);
    // Safaricom will itself retry a non-zero ResultCode, but that window is
    // short and outside our control — also durably queue it so a transient
    // failure (not a bad payload — validate() already rejected those) gets
    // retried on our own schedule and stays visible if it never recovers.
    await enqueueFailedCallback('mpesa', req.body);
    res.json({ ResultCode: 1 });
  }
});

// Credit MLCNS to wallet (on-chain MsgTransferMallcoin from operator/faucet)
// Buying Mallcoins increases supply by transferring MLCNS from the faucet/operator account.
// When the purchase includes fiat, the same workflow can also inject the corresponding KES/MLCN pair into the liquidity pool.
// A future sell implementation should likewise adjust supply and liquidity when Mallcoins are redeemed.
router.post('/credit', limiters.financial, validate(schemas.buyCredit), async (req, res) => {
  try {
    const { quoteId, walletAddress } = req.validatedBody;
    const { creditMlcns } = require('../services/faucetService');

    // quoteId is now required (see buyCreditSchema) — handleReservedCredit
    // only credits after MallcoinPurchase.status === 'confirmed', i.e. a
    // real M-Pesa payment the /mpesa/callback route already verified. The
    // old no-quoteId branch let a caller mint MLCNS with just an amount and
    // no auth or payment reference at all — confirmed live as unauthenticated
    // free minting, up to FAUCET_MAX_MLCNS per request. No legitimate caller
    // ever used it (buyApi.ts's credit() always sends quoteId).
    const response = await handleReservedCredit({ quoteId, walletAddress, creditMlcns });
    return res.json(response);
  } catch (e) {
    logger.error('buy', 'credit error', e);
    const status = e.status || 500;
    res.status(status).json({ error: e.message });
  }
});

// Payout callback from Safaricom B2C
router.post('/payout/callback', verifyWebhookToken, validate(schemas.payoutCallback), async (req, res) => {
  try {
    const { handlePayoutCallback } = require('../services/b2cPayoutService');
    const result = await handlePayoutCallback(req.body);
    return res.json(result);
  } catch (e) {
    logger.error('buy', 'payout callback error', e);
    await enqueueFailedCallback('payout', req.body);
    res.json({ ResultCode: 1 });
  }
});

// Sell Mallcoins: accept client-signed txBytes that transfer MLCNS from seller to operator
/**
 * Runs the read-only version of every /sell gate (price -> minimum ->
 * weekly limit -> AML -> liquidity) so the frontend can show the user
 * exactly where they stand before they ever build or sign a transaction.
 * No records are created here — see POST /sell for the same checks with
 * side effects.
 */
router.get('/sell/preview', async (req, res) => {
  try {
    const { error, value } = schemas.amount.validate(req.query.amount);
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid amount' });
    }
    const amount = value;
    const sellerAddress = typeof req.query.sellerAddress === 'string' ? req.query.sellerAddress : null;

    let marketPrice;
    try {
      marketPrice = await getMarketPrice();
    } catch (err) {
      return res.status(503).json({ error: 'Unable to verify the current market price right now. Please try again shortly.' });
    }
    const estimatedKes = Number(amount) * Number(marketPrice?.sellPriceKes || 0);

    const minimumCheck = checkMinimumWithdrawal(estimatedKes);
    const rateLimitCheck = sellerAddress
      ? await checkWeeklyWithdrawalLimit(sellerAddress)
      : { ok: true, count: 0, limit: WEEKLY_WITHDRAWAL_LIMIT, nextAvailableAt: null };
    const amlCheck = sellerAddress
      ? await requireApprovedAmlReview(sellerAddress, estimatedKes)
      : { ok: true, required: false, thresholdKes: AML_WITHDRAWAL_THRESHOLD_KES, reviewId: null, reviewStatus: 'none' };
    const walletLinked = sellerAddress ? Boolean(await User.findOne({ walletAddress: sellerAddress }).select('_id').lean()) : false;
    const liquidityCheck = await checkSellLiquidity(estimatedKes);

    const burnPercentage = 30; // default applied burn rate — see burnCalculator.js, actual split confirmed at settlement time
    const burnAmount = Math.floor(amount * (burnPercentage / 100));
    const treasuryAmount = amount - burnAmount;

    return res.json({
      ok: true,
      amount,
      estimatedKes,
      sellPriceKes: marketPrice?.sellPriceKes || 0,
      burnPercentage,
      burnAmount,
      treasuryAmount,
      payoutConfigured: isPayoutConfigured(),
      note: 'Estimate only — confirmed on submission.',
      minimum: minimumCheck,
      rateLimit: rateLimitCheck,
      aml: {
        required: amlCheck.required,
        thresholdKes: amlCheck.thresholdKes,
        walletLinked,
        reviewStatus: amlCheck.reviewStatus,
      },
      liquidity: {
        ok: liquidityCheck.ok,
        reserveKes: liquidityCheck.reserveKes,
        error: liquidityCheck.ok ? null : liquidityCheck.error,
        wouldQueue: !liquidityCheck.ok,
      },
      // Deprecated top-level aliases — WalletWithdraw.tsx reads these
      // directly today; kept for one release alongside the new `liquidity`
      // object above rather than requiring a simultaneous two-file change.
      liquidityOk: liquidityCheck.ok,
      liquidityError: liquidityCheck.ok ? null : liquidityCheck.error,
    });
  } catch (e) {
    logger.error('buy', 'sell preview error', e);
    return res.status(500).json({ error: e.message || 'preview failed' });
  }
});

router.post('/sell', limiters.financial, validate(schemas.sell), async (req, res) => {
  try {
    const { sellerAddress, amount, txBytes, phone } = req.validatedBody;

    if (!isPayoutConfigured()) {
      return res.status(503).json({ error: 'Safaricom cash-out is not configured yet' });
    }

    // A failed price fetch must not silently become "this sale is worth
    // 0 KES" — that made checkSellLiquidity's fail-closed guard below a
    // no-op (0 KES always fits under the reserve), defeating the exact
    // protection it exists to provide right when pool state is least
    // trustworthy. Fail closed here too, consistent with sellGateService.
    let marketPrice;
    try {
      marketPrice = await getMarketPrice();
    } catch (err) {
      return res.status(503).json({ error: 'Unable to verify the current market price right now. Please try again shortly.' });
    }
    const estimatedKes = Number(amount) * Number(marketPrice?.sellPriceKes || 0);

    // Cheapest checks first: arithmetic -> indexed Mongo count -> indexed
    // Mongo lookup -> external chain read last. Each of these fails BEFORE
    // any record is created — a rejection here isn't a real withdrawal
    // attempt, so it shouldn't count toward the weekly limit either.
    const minimumCheck = checkMinimumWithdrawal(estimatedKes);
    if (!minimumCheck.ok) {
      return res.status(400).json({
        error: `Minimum withdrawal is ${minimumCheck.minimumKes} KES-equivalent — this amount is short by ${minimumCheck.shortfallKes} KES.`,
        code: 'below_minimum_withdrawal',
        details: minimumCheck,
      });
    }

    const rateLimitCheck = await checkWeeklyWithdrawalLimit(sellerAddress);
    if (!rateLimitCheck.ok) {
      return res.status(429).json({
        error: `You've reached the limit of ${rateLimitCheck.limit} withdrawals this week.`,
        code: 'weekly_withdrawal_limit_reached',
        details: rateLimitCheck,
      });
    }

    const amlCheck = await requireApprovedAmlReview(sellerAddress, estimatedKes);
    // Non-blocking anti-structuring check — runs regardless of amlCheck's
    // own outcome, never throws into this request.
    checkAndFlagStructuring(sellerAddress).catch(() => {});
    if (!amlCheck.ok) {
      return res.status(403).json({
        error: 'This withdrawal requires a short compliance verification before it can proceed.',
        code: 'aml_review_required',
        details: {
          thresholdKes: amlCheck.thresholdKes,
          reviewStatus: amlCheck.reviewStatus,
          reviewId: amlCheck.reviewId,
        },
      });
    }

    // The pool's KES-side reserve is what a cash-out payout is actually
    // backed by. Below the reserve, hold the withdrawal (queued_liquidity)
    // rather than reject it outright — MLCNS stays in the user's wallet,
    // the signed transaction is held server-side, and
    // withdrawalLiquidityQueueService.js releases it once the pool
    // recovers.
    const liquidityCheck = await checkSellLiquidity(estimatedKes);

    const saleId = crypto.randomBytes(12).toString('hex');
    const sale = await MallcoinSale.create({ saleId, sellerAddress, amount, phone, status: 'pending' });
    const withdrawalId = `withdrawal-${saleId}`;
    const withdrawal = await WithdrawalRequest.create({
      withdrawalId,
      walletAddress: sellerAddress,
      phone,
      amountMlcns: Number(amount),
      amountKes: estimatedKes,
      currency: 'KES',
      status: 'pending_review',
      settlementMode: 'signed_sell',
      saleId,
      amlReviewId: amlCheck.reviewId || undefined,
      notes: 'Signed Mallchain cash-out submitted and awaiting broadcast.',
    });
    await recordWithdrawLiquidityActivity('cashout_requested', withdrawal, {
      status: 'pending',
      saleId,
      providerMode: isPayoutConfigured() ? 'live' : 'unconfigured',
      note: 'Wallet cash-out registered for pool-linked fiat settlement tracking.',
    });

    if (amlCheck.reviewId) {
      // Single-use: this approved review is now spent on this withdrawal
      // and can't cover a later, separate attempt.
      await WithdrawalAmlReview.findByIdAndUpdate(amlCheck.reviewId, { consumedByWithdrawalId: withdrawal._id });
    }

    if (!liquidityCheck.ok) {
      await holdForLiquidity({ sale, withdrawal, txBytes, estimatedKes, reserveKes: liquidityCheck.reserveKes });
      return res.status(202).json({
        ok: true,
        queued: true,
        code: 'queued_liquidity',
        withdrawalId,
        saleId,
        message: liquidityCheck.error || 'Pool liquidity is temporarily insufficient — this withdrawal has been queued and will process automatically once liquidity recovers.',
      });
    }

    const result = await executeSellSettlement({
      sale, withdrawal, txBytes, amount, phone, sellerAddress, saleId, withdrawalId, estimatedKes, saleSummary,
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    logger.error('buy', 'sell error', e);
    return res.status(500).json({ error: e.message });
  }
});

// Re-signs a withdrawal that went stale while held (queued_liquidity ->
// resign_required, see sellExecutionService.js's sequence-mismatch
// detection). Producing a validly-signed tx for sellerAddress is itself the
// proof of control — same trust model as the original POST /sell, which
// also requires no auth.
router.post('/sell/:saleId/resign', limiters.financial, async (req, res) => {
  try {
    const { txBytes } = req.body || {};
    if (!txBytes || typeof txBytes !== 'string') {
      return res.status(400).json({ error: 'txBytes must be provided as base64 string' });
    }

    const sale = await MallcoinSale.findOne({ saleId: req.params.saleId });
    const withdrawal = sale ? await WithdrawalRequest.findOne({ saleId: req.params.saleId }) : null;
    if (!sale || !withdrawal) return res.status(404).json({ error: 'withdrawal not found' });
    if (sale.status !== 'resign_required' || withdrawal.status !== 'resign_required') {
      return res.status(409).json({ error: `This withdrawal isn't awaiting a re-sign (current status: ${withdrawal.status})` });
    }

    sale.status = 'queued_liquidity';
    sale.pendingTxBytes = txBytes; // encrypted on save via MallcoinSale's pre-save hook
    sale.pendingTxBytesSetAt = new Date();
    await sale.save();

    // queuedAt is left untouched — the resign was the chain's interruption,
    // not the user jumping the queue, so their original position is kept.
    withdrawal.status = 'queued_liquidity';
    withdrawal.notes = 'Re-signed and re-queued for liquidity release.';
    await withdrawal.save();

    await recordWithdrawLiquidityActivity('withdraw_resigned', withdrawal, {
      status: 'pending',
      saleId: sale.saleId,
      note: 'Withdrawal re-signed after a stale (sequence-mismatch) held transaction.',
    });

    return res.json({ ok: true, saleId: sale.saleId, withdrawalId: withdrawal.withdrawalId, status: withdrawal.status });
  } catch (e) {
    logger.error('buy', 'sell resign error', e);
    return res.status(500).json({ error: e.message || 'resign failed' });
  }
});

router.get('/sell/status/:saleId', async (req, res) => {
  try {
    const { error, value } = schemas.sellStatusParam.validate(req.params);
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid sale id' });
    }
    const { saleId } = value;
    const sale = await MallcoinSale.findOne({ saleId });
    if (!sale) {
      return res.status(404).json({ error: 'sale not found' });
    }
    return res.json(await saleSummary(sale));
  } catch (e) {
    logger.error('buy', 'sell status error', e);
    return res.status(500).json({ error: e.message || 'cash-out status failed' });
  }
});

module.exports = router;
