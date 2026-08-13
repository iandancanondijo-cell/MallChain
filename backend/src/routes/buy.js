/* eslint-env node */
/* global require, module, process */
const express = require('express');
const router = express.Router();
const MallcoinPurchase = require('../models/MalicoinPurchase');
const MallcoinSale = require('../models/MalicoinSale');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { validate, schemas } = require('../middleware/validation');
const axios = require('axios');
const crypto = require('crypto');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const { Buffer } = require('buffer');
const console = new Console(stdout, stderr);
const IdempotencyKey = require('../models/IdempotencyKey');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const B2CPayout = require('../models/B2CPayout');
const { executeSellBurnWorkflow } = require("../services/sellBurnService");
const { config } = require('../config');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { getMarketPrice } = require('../services/mallcoinService');
const { createBlockchainBreaker } = require('../utils/circuitBreaker');
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

  try {
    const token = await getSafaricomToken();
    if (!token) {
      const err = new Error('Safaricom token could not be generated');
      err.status = 503;
      throw err;
    }

    const stkBody = buildStkBody(purchase, phone, amount, description);
    const stkRes = await axios.post(
      `${SAFARICOM_API.replace(/\/$/, '')}/mpesa/stkpush/v1/processrequest`,
      stkBody,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );

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
    console.warn('STK push failed:', e.message || e);
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
  });
});

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
  if (!paymentId) {
    return { ResultCode: 1 };
  }

  const purchase = await MallcoinPurchase.findOne({
    $or: [
      { paymentId },
      { paymentIds: paymentId }
    ]
  });
  if (!purchase) {
    return { ResultCode: 0 };
  }

  if (resultCode === 0) {
    const metadata = {};
    callbackMetadata.forEach(item => {
      metadata[item.Name] = item.Value;
    });

    purchase.status = 'confirmed';
    purchase.mpesaRef = metadata.MpesaReceiptNumber || purchase.mpesaRef;
    purchase.reason = 'Safaricom payment confirmed.';
  } else {
    purchase.status = 'failed';
    purchase.reason = 'User cancelled or payment failed';
  }

  await purchase.save();
  await recordBuyLiquidityActivity(resultCode === 0 ? 'payment_confirmed' : 'payment_failed', purchase, {
    status: resultCode === 0 ? 'success' : 'failed',
    providerMode: getProviderMode(),
    reason: resultCode === 0 ? undefined : purchase.reason,
    note: resultCode === 0 ? 'Safaricom callback confirmed the fiat payment.' : undefined,
    metadata: { callbackData: data },
  });
  return { ResultCode: 0 };
}

async function handleStandaloneCredit({ walletAddress, amount, creditMlcns, idempotencyKey }) {
  let mlcns = Number(amount);
  if (mlcns > 1_000_000) mlcns = mlcns / 1_000_000;
  if (!Number.isFinite(mlcns) || mlcns <= 0) {
    const err = new Error('amount required when quoteId is omitted');
    err.status = 400;
    throw err;
  }

  // Check idempotency if key provided
  if (idempotencyKey) {
    const existing = await IdempotencyKey.findOne({ key: idempotencyKey });
    if (existing) {
      if (existing.status === 'success') {
        return { ok: true, success: true, cached: true, ...existing.result };
      }
      if (existing.status === 'failed') {
        const err = new Error(existing.error || 'Previous attempt failed');
        err.status = 400;
        throw err;
      }
    }
  }

  const result = await creditMlcns(walletAddress, mlcns);

  // Record idempotency result
  if (idempotencyKey) {
    await IdempotencyKey.updateOne(
      { key: idempotencyKey },
      {
        $set: {
          walletAddress,
          amount: mlcns,
          result,
          status: 'success',
        },
      },
      { upsert: true }
    );
  }

  return { ok: true, success: true, ...result };
}

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
    console.warn('[Buy] Liquidity pool add failed:', liqErr.message || liqErr);
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
router.post('/reserve', validate(schemas.payment), async (req, res) => {
  try {
    const { amount, fiat, currency, walletAddress, phone } = req.validatedBody;

    const quoteId = crypto.randomBytes(12).toString('hex');
    const mpesaRef = 'MLCNS' + Date.now();
    
    const purchase = await MallcoinPurchase.create({
      quoteId,
      walletAddress,
      amount: Number(amount),
      fiatAmount: Number(fiat.replace(/[^\d.-]/g, '')) || 0,
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
    console.error('buy reserve error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Initiate M-Pesa STK push
router.post('/mpesa', validate(schemas.payment), async (req, res) => {
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
    console.error('M-Pesa initiate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Check payment status
router.get('/status/:paymentId', async (req, res) => {
  try {
    const { error, value } = schemas.buyStatusParamSchema.validate(req.params);
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
    console.error('Status check error:', e);
    res.json({ status: 'error', reason: e.message, providerMode: getProviderMode() });
  }
});

// M-Pesa callback (simulated for sandbox)
router.post('/mpesa/callback', validate(schemas.mpesaCallback), async (req, res) => {
  try {
    const result = await processMpesaCallback(req.body);
    return res.json(result);
  } catch (e) {
    console.error('M-Pesa callback error:', e);
    res.json({ ResultCode: 1 });
  }
});

// Credit MLCNS to wallet (on-chain MsgTransferMallcoin from operator/faucet)
// Buying Mallcoins increases supply by transferring MLCNS from the faucet/operator account.
// When the purchase includes fiat, the same workflow can also inject the corresponding KES/MLCN pair into the liquidity pool.
// A future sell implementation should likewise adjust supply and liquidity when Mallcoins are redeemed.
router.post('/credit', validate(schemas.payment), async (req, res) => {
  try {
    const { quoteId, walletAddress, amount, idempotencyKey } = req.validatedBody;
    const { creditMlcns } = require('../services/faucetService');

    if (!quoteId) {
      const response = await handleStandaloneCredit({ walletAddress, amount, creditMlcns, idempotencyKey });
      return res.json(response);
    }

    const response = await handleReservedCredit({ quoteId, walletAddress, creditMlcns });
    return res.json(response);
  } catch (e) {
    console.error('Credit error:', e);
    const status = e.status || 500;
    res.status(status).json({ error: e.message });
  }
});

// Payout callback from Safaricom B2C
router.post('/payout/callback', validate(schemas.payoutCallback), async (req, res) => {
  try {
    const { handlePayoutCallback } = require('../services/b2cPayoutService');
    const result = await handlePayoutCallback(req.body);
    return res.json(result);
  } catch (e) {
    console.error('Payout callback error:', e);
    res.json({ ResultCode: 1 });
  }
});

// Sell Mallcoins: accept client-signed txBytes that transfer MLCNS from seller to operator
router.post('/sell', validate(schemas.transfer), async (req, res) => {
  try {
    const { sellerAddress, amount, txBytes, phone } = req.validatedBody;

    if (!isPayoutConfigured()) {
      return res.status(503).json({ error: 'Safaricom cash-out is not configured yet' });
    }

    const saleId = crypto.randomBytes(12).toString('hex');
    const sale = await MallcoinSale.create({ saleId, sellerAddress, amount, phone, status: 'pending' });
    const marketPrice = await getMarketPrice().catch(() => ({ sellPriceKes: 0 }));
    const estimatedKes = Number(amount) * Number(marketPrice?.sellPriceKes || 0);
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
      notes: 'Signed Mallchain cash-out submitted and awaiting broadcast.',
    });
    await recordWithdrawLiquidityActivity('cashout_requested', withdrawal, {
      status: 'pending',
      saleId,
      providerMode: isPayoutConfigured() ? 'live' : 'unconfigured',
      note: 'Wallet cash-out registered for pool-linked fiat settlement tracking.',
    });

    const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317';

    // Normalize txBytes
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
      return res.status(400).json({ error: 'txBytes must be provided as base64 string' });
    }

    // Broadcast to chain
    const payload = { tx_bytes: txBytes, mode: config.chain.broadcastMode || 'BROADCAST_MODE_SYNC' };
    let chainResp;
    try {
      const resp = await axios.post(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, payload, { timeout: 10000 });
      chainResp = resp.data || {};
    } catch (err) {
      sale.status = 'failed';
      sale.reason = err.message || 'broadcast failed';
      withdrawal.status = 'failed';
      withdrawal.notes = sale.reason;
      await withdrawal.save();
      await recordWithdrawLiquidityActivity('sell_broadcast_failed', withdrawal, {
        status: 'failed',
        saleId,
        reason: sale.reason,
      });
      await sale.save();
      return res.status(503).json({ error: 'Blockchain broadcast failed', details: err.message });
    }

    const txHash = chainResp.tx_response?.txhash || chainResp.txhash || null;
    const code = chainResp.tx_response?.code || chainResp.code || 0;

    if (code && code !== 0) {
      sale.status = 'failed';
      sale.reason = chainResp.tx_response?.raw_log || chainResp.raw_log || `code ${code}`;
      withdrawal.status = 'failed';
      withdrawal.notes = sale.reason;
      await withdrawal.save();
      await recordWithdrawLiquidityActivity('sell_broadcast_failed', withdrawal, {
        status: 'failed',
        saleId,
        sellTxHash: txHash,
        reason: sale.reason,
      });
      await sale.save();
      return res.status(400).json({ error: 'Transaction failed', details: sale.reason });
    }

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
    // Execute burn workflow: calculate amounts, execute on-chain burn, record in ledger
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

    // Initiate B2C payout to seller
    let payoutRef = null;
    try {
      const payoutResult = await initiateB2CPayout({
        sellerPhone: phone,
        mlcnsAmount: amount,
        saleId,
      });

      if (payoutResult.ok) {
        payoutRef = payoutResult.payoutRef;
        const payout = await B2CPayout.create({
          saleId,
          sellerPhone: phone,
          sellerAddress: sellerAddress,
          amount,
          txHash,
          payoutRef,
          payoutStatus: 'initiated',
        });
        console.log('[Sell] B2C payout initiated:', payout._id, 'ref:', payoutRef);
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
        console.warn('[Sell] B2C payout initiation failed:', payoutResult.error);
        withdrawal.status = 'failed';
        withdrawal.notes = payoutResult.error || 'Safaricom payout initiation failed.';
        await withdrawal.save();
        await recordWithdrawLiquidityActivity('payout_initiation_failed', withdrawal, {
          status: 'failed',
          saleId,
          sellTxHash: txHash,
          burnTxHash: burnResult.burnTxHash,
          fiatAmount: estimatedKes,
          providerMode: payoutResult.providerMode,
          reason: payoutResult.error,
        });
      }
    } catch (payoutErr) {
      console.error('[Sell] B2C payout error:', payoutErr.message || payoutErr);
      // Payout failure does not block sale completion; can be retried later
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

    return res.json({
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
      sale: await saleSummary(sale),
      network: 'mlcoin',
    });
  } catch (e) {
    console.error('Sell error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/sell/status/:saleId', async (req, res) => {
  try {
    const { error, value } = schemas.sellStatusParamSchema.validate(req.params);
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
    console.error('Sell status error:', e);
    return res.status(500).json({ error: e.message || 'cash-out status failed' });
  }
});

module.exports = router;
