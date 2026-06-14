/* eslint-env node */
/* global require, module, process */
const express = require('express');
const router = express.Router();
const MallcoinPurchase = require('../models/MalicoinPurchase');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { validateRequest } = require('../utils/validationSchemas');
const schemas = require('../utils/validationSchemas');
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

const SAFARICOM_API = process.env.SAFARICOM_API || 'https://sandbox.safaricom.co.ke';
const SAFARICOM_KEY = process.env.SAFARICOM_KEY || '';
const SAFARICOM_SECRET = process.env.SAFARICOM_SECRET || '';
const BUSINESS_SHORT_CODE = process.env.BUSINESS_SHORT_CODE || '174379';
const PASSKEY = process.env.PASSKEY || '';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:4000/api/buy/mpesa/callback';

const makePaymentId = () => `PAY${Date.now()}`;

async function getSafaricomToken() {
  if (!SAFARICOM_KEY || !SAFARICOM_SECRET || !PASSKEY || !BUSINESS_SHORT_CODE) {
    return null;
  }

  const auth = Buffer.from(`${SAFARICOM_KEY}:${SAFARICOM_SECRET}`).toString('base64');
  const tokenRes = await axios.get(
    `${SAFARICOM_API.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 5000 }
  );

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
  const fallback = async () => {
    const paymentId = makePaymentId();
    addPaymentIdToPurchase(purchase, paymentId);
    purchase.status = 'payment_initiated';
    await purchase.save();
    return { ok: true, paymentId, status: 'initiated', mocked: true };
  };

  try {
    const token = await getSafaricomToken();
    if (!token) return fallback();

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
    await purchase.save();

    return { ok: true, paymentId, status: 'initiated', raw: resp };
  } catch (e) {
    console.warn('STK push failed, falling back to mock start:', e.message || e);
    return fallback();
  }
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
  } else {
    purchase.status = 'failed';
    purchase.reason = 'User cancelled or payment failed';
  }

  await purchase.save();
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

  const mlcnsAmount = Number(purchase.amount || 0);
  const creditAddress = purchase.walletAddress;
  const result = await creditMlcns(creditAddress, mlcnsAmount);

  purchase.txHash = result.transfer?.txHash;
  purchase.status = 'credited';
  purchase.liquidityAdded = false;
  purchase.liquidityPoolId = undefined;
  purchase.liquidityError = undefined;
  purchase.lpTokens = 0;

  let liquidityResult = null;
  try {
    liquidityResult = await applyLiquidityAfterCredit(purchase, creditAddress, mlcnsAmount);
  } catch (liqErr) {
    console.warn('[Buy] Liquidity pool add failed:', liqErr.message || liqErr);
    purchase.liquidityAdded = false;
    purchase.liquidityError = liqErr.message || String(liqErr);
  }

  await purchase.save();
  return { ok: true, success: true, txHash: result.transfer?.txHash, balance: result.balance, liquidity: liquidityResult };
}

// Reserve a quote for Mallcoin purchase
router.post('/reserve', async (req, res) => {
  try {
    const { amount, fiat, currency, walletAddress, phone } = req.body;
    if (!amount || !walletAddress || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    return res.json({
      ok: true,
      quoteId,
      mpesaRef,
      fiatAmount: purchase.fiatAmount,
      currency: purchase.currency
    });
  } catch (e) {
    console.error('buy reserve error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Initiate M-Pesa STK push
// Initiate M-Pesa STK push
router.post('/mpesa', async (req, res) => {
  try {
    const { quoteId, phone, amount, description } = req.body;
    if (!quoteId || !phone || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const purchase = await MallcoinPurchase.findOne({ quoteId });
    if (!purchase) return res.status(404).json({ error: 'Quote not found' });

    const response = await initiateMpesaRequest(purchase, phone, amount, description);
    return res.json(response);
  } catch (e) {
    console.error('M-Pesa initiate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Check payment status
router.get('/status/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const purchase = await MallcoinPurchase.findOne({
      $or: [
        { paymentId },
        { paymentIds: paymentId }
      ]
    });
    if (!purchase) return res.json({ status: 'unknown' });
    return res.json({ status: purchase.status, reason: purchase.reason });
  } catch (e) {
    console.error('Status check error:', e);
    res.json({ status: 'error' });
  }
});

// M-Pesa callback (simulated for sandbox)
router.post('/mpesa/callback', async (req, res) => {
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
router.post('/credit', validateRequest(schemas.buyCreditSchema), async (req, res) => {
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
router.post('/payout/callback', async (req, res) => {
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
router.post('/sell', validateRequest(schemas.sellSchema), async (req, res) => {
  try {
    const { sellerAddress, amount, txBytes, phone } = req.validatedBody;
    const MallcoinSale = require('../models/MalicoinSale');

    const saleId = crypto.randomBytes(12).toString('hex');
    const sale = await MallcoinSale.create({ saleId, sellerAddress, amount, phone, status: 'pending' });

    const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317';

    // Normalize txBytes
    if (!txBytes || typeof txBytes !== 'string') {
      sale.status = 'failed';
      sale.reason = 'txBytes (base64) required';
      await sale.save();
      return res.status(400).json({ error: 'txBytes must be provided as base64 string' });
    }

    // Broadcast to chain
    const payload = { tx_bytes: txBytes, mode: 'BROADCAST_MODE_SYNC' };
    let chainResp;
    try {
      const resp = await axios.post(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, payload, { timeout: 10000 });
      chainResp = resp.data || {};
    } catch (err) {
      sale.status = 'failed';
      sale.reason = err.message || 'broadcast failed';
      await sale.save();
      return res.status(503).json({ error: 'Blockchain broadcast failed', details: err.message });
    }

    const txHash = chainResp.tx_response?.txhash || chainResp.txhash || null;
    const code = chainResp.tx_response?.code || chainResp.code || 0;

    if (code && code !== 0) {
      sale.status = 'failed';
      sale.reason = chainResp.tx_response?.raw_log || chainResp.raw_log || `code ${code}`;
      await sale.save();
      return res.status(400).json({ error: 'Transaction failed', details: sale.reason });
    }

    sale.status = 'broadcasted';
    sale.txHash = txHash;
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
          payoutStatus: payoutResult.mocked ? 'initiated' : 'initiated',
        });
        console.log('[Sell] B2C payout initiated:', payout._id, 'ref:', payoutRef);
      } else {
        console.warn('[Sell] B2C payout initiation failed:', payoutResult.error);
      }
    } catch (payoutErr) {
      console.error('[Sell] B2C payout error:', payoutErr.message || payoutErr);
      // Payout failure does not block sale completion; can be retried later
    }

    return res.json({ success: true, saleId, txHash, payoutRef, burnAmount: burnResult.burnAmount, treasuryAmount: burnResult.treasuryAmount, burnPercentage: burnResult.burnPercentage, burnTxHash: burnResult.burnTxHash, network: "mlcoin" });
  } catch (e) {
    console.error('Sell error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
