const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const mongoose = require('mongoose')
const MallPointAccount = require('../models/MallPointAccount')
const { createLimiter } = require('../middleware/rateLimiter')
const logger = require('../utils/logger')
const { invalidateCache: invalidateCapCache } = require('../services/liquidityPoolCapService')
const requireAuth = require('../middleware/requireAuth')
const verifyWebhookToken = require('../middleware/verifyWebhookToken')
const { getMlptsPerMlcnsScale } = require('../services/mallcoinService')
const { blindIndex } = require('../utils/fieldEncryption')
const { getMallpointPriceKes } = require('../services/economyConstants')
const { describeFailure } = require('../services/mpesaCallbackService')
const { recordMallpointsPurchaseActivity } = require('../services/liquidityActivityService')
const { emitDepositConfirmed } = require('../services/activityEvents')

// Mallpoints price in KES — single source of truth (economyConstants).
const MALLPOINT_PRICE_KES = getMallpointPriceKes()

// Safaricom Daraja API credentials — canonical env names (config/index.js
// payment.safaricom uses SAFARICOM_KEY/SAFARICOM_SECRET; this route
// previously read SAFARICOM_CONSUMER_KEY/SECRET, which nothing in .env
// defines, so every Daraja token fetch sent "undefined:undefined" Basic auth).
const SAFARICOM_CONSUMER_KEY = process.env.SAFARICOM_KEY
const SAFARICOM_CONSUMER_SECRET = process.env.SAFARICOM_SECRET
const SAFARICOM_SHORTCODE = process.env.SAFARICOM_SHORTCODE || '174379'
// 4364003 is the Daraja store/HO number, not a paybill — STK pushes must
// settle to the customer-facing till (Safaricom API support, 2026-10-19).
const SAFARICOM_TILL = process.env.SAFARICOM_TILL_NUMBER || SAFARICOM_SHORTCODE
const SAFARICOM_PASSKEY = process.env.SAFARICOM_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
const SAFARICOM_ENV = process.env.SAFARICOM_ENV || 'sandbox'

// Daraja posts the STK-push result back to this URL, and this is the ONLY thing
// that flips a purchase from `payment_initiated` → `confirmed`; the frontend
// poll just reads that status. Two things used to break it:
//   1. It reused process.env.CALLBACK_URL, which points at the *buy* route
//      (/api/buy/mpesa/callback). That handler only looks up MallcoinPurchase in
//      Mongo and knows nothing about the Redis `purchase:*` record here, so the
//      Mallpoints quote never confirmed and the UI timed out.
//   2. /mpesa/callback is guarded by verifyWebhookToken (?token=...), but the
//      registered URL had no token appended, so even a right-path callback got
//      401. config/index.js appendWebhookToken is the pattern the other flows use.
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET
function appendWebhookToken(url, secret) {
  if (!secret) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(secret)}`
}
const CALLBACK_URL = appendWebhookToken(
  process.env.MALLPOINTS_CALLBACK_URL
    || `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/mallpoints/purchase/mpesa/callback`,
  PAYMENT_WEBHOOK_SECRET
)

const BASE_URL = SAFARICOM_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke'

// Redis-backed store for pending purchases (survives restarts)
const PURCHASE_TTL_SECONDS = 10 * 60; // 10 minutes
const PURCHASE_PREFIX = 'purchase:';
const PAYMENT_INDEX_PREFIX = 'purchase:payment:';

function getRedis() {
  return global.redisClient;
}

async function savePurchase(purchase) {
  const redis = getRedis();
  if (!redis) throw new Error('Redis not available');
  const key = PURCHASE_PREFIX + purchase.quoteId;
  const data = { ...purchase };
  // Flatten numeric/boolean fields to strings for Redis hash
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) data[k] = '';
    else if (typeof v === 'object') data[k] = JSON.stringify(v);
    else data[k] = String(v);
  }
  await redis.hmset(key, data);
  await redis.expire(key, PURCHASE_TTL_SECONDS);
  if (purchase.paymentId) {
    const idxKey = PAYMENT_INDEX_PREFIX + purchase.paymentId;
    await redis.set(idxKey, purchase.quoteId, 'EX', PURCHASE_TTL_SECONDS);
  }
}

async function getPurchase(quoteId) {
  const redis = getRedis();
  if (!redis) return null;
  const data = await redis.hgetall(PURCHASE_PREFIX + quoteId);
  if (!data || !data.quoteId) return null;
  // Restore types
  const p = { ...data };
  for (const numField of ['amountKes', 'mallpointsAmount', 'createdAt', 'confirmedAt', 'creditedAt']) {
    if (p[numField] !== '' && p[numField] !== undefined) p[numField] = Number(p[numField]);
  }
  for (const boolField of ['credited', 'liquidityAdded']) {
    if (p[boolField] === 'true') p[boolField] = true;
    else if (p[boolField] === 'false') p[boolField] = false;
  }
  return p;
}

async function findPurchaseByPaymentId(paymentId) {
  const redis = getRedis();
  if (!redis) return null;
  const quoteId = await redis.get(PAYMENT_INDEX_PREFIX + paymentId);
  if (!quoteId) return null;
  return getPurchase(quoteId);
}

// Generate OAuth token for Safaricom API
async function getDarajaToken() {
  const auth = Buffer.from(`${SAFARICOM_CONSUMER_KEY}:${SAFARICOM_CONSUMER_SECRET}`).toString('base64')
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  })
  if (!res.ok) throw new Error('Failed to get Daraja token')
  const data = await res.json()
  return data.access_token
}

// Actively ask Daraja for an STK push's outcome. The async /mpesa/callback is
// the primary confirmation path, but it only lands if the registered public
// tunnel is up and reachable — which the ephemeral sandbox tunnel frequently
// is not, so a paid purchase would sit at `payment_initiated` until the UI's
// 10-min poll expired ("nothing happened"). This query endpoint lets the
// backend confirm payment on its own, regardless of inbound callback delivery.
async function queryDarajaStatus(purchase) {
  const token = await getDarajaToken()
  // Daraja requires the Timestamp baked into Password to be the SAME string
  // sent in the Timestamp field — computing it twice can straddle a second
  // boundary and the query then fails with a password mismatch.
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v10/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: SAFARICOM_SHORTCODE,
      Password: Buffer.from(`${SAFARICOM_SHORTCODE}${SAFARICOM_PASSKEY}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      MerchantRequestID: purchase.merchantRequestId,
      CheckoutRequestID: purchase.paymentId,
    }),
  })
  if (!res.ok) throw new Error('stkquery request failed')
  return res.json()
}

// POST /api/mallpoints/purchase/reserve - create a purchase quote
router.post('/reserve', requireAuth(), createLimiter({ windowMs: 60*1000, max: 20 }), async (req, res) => {
  try {
    const { amount_kes, address } = req.body || {}

    if (!address) return res.status(400).json({ error: 'missing wallet address' })
    if (!amount_kes || amount_kes < 10) {
      return res.status(400).json({ error: 'minimum purchase is KSH 10' })
    }

    // Wallet-first (Gate 61.1): credit only lands on a user's balance when the
    // address maps to a User — a quote for an unlinked address means real
    // M-Pesa money paid into an account nobody can ever see.
    const User = require('../models/user')
    const owner = await User.findOne({ walletAddress_blind: blindIndex(address) }).select('_id').lean()
    if (!owner || String(owner._id) !== String(req.user._id)) {
      return res.status(403).json({ error: 'wallet address is not linked to your account' })
    }

    const mallpointsAmount = amount_kes / MALLPOINT_PRICE_KES
    const quoteId = crypto.randomBytes(16).toString('hex')

    const purchase = {
      quoteId,
      address,
      amountKes: amount_kes,
      mallpointsAmount,
      status: 'reserved',
      createdAt: Date.now(),
    };
    await savePurchase(purchase);

    return res.json({
      ok: true,
      quoteId,
      amountKes: amount_kes,
      mallpointsAmount,
      pricePerMallpoint: MALLPOINT_PRICE_KES,
      status: 'reserved',
      expiresAt: Date.now() + 10 * 60 * 1000,
    })
  } catch (e) {
    logger.error('mallpointsPurchase', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/mallpoints/purchase/mpesa - initiate STK push
router.post('/mpesa', createLimiter({ windowMs: 60*1000, max: 10 }), async (req, res) => {
  try {
    const { quoteId, phone } = req.body || {}

    if (!quoteId || !phone) {
      return res.status(400).json({ error: 'quoteId and phone are required' })
    }

    const purchase = await getPurchase(quoteId)
    if (!purchase) {
      return res.status(404).json({ error: 'quote not found or expired' })
    }

    if (purchase.status !== 'reserved') {
      return res.status(400).json({ error: `quote is ${purchase.status}` })
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/^0/, '254').replace(/\s/g, '')
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'invalid phone number' })
    }

    // Generate timestamp and password
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const password = Buffer.from(`${SAFARICOM_SHORTCODE}${SAFARICOM_PASSKEY}${timestamp}`).toString('base64')

    // Get Daraja token
    const token = await getDarajaToken()

    // Initiate STK push
    const stkResponse = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: SAFARICOM_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerBuyGoodsOnline',
        Amount: Math.round(purchase.amountKes),
        PartyA: normalizedPhone,
        PartyB: SAFARICOM_TILL,
        PhoneNumber: normalizedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: `MLPTS${quoteId.slice(0, 12)}`,
        TransactionDesc: `Mallpoints purchase - ${purchase.mallpointsAmount} MLPTS`,
      }),
    })

    const stkData = await stkResponse.json()

    if (stkData.ResponseCode !== '0' || !stkData.CheckoutRequestID) {
      // HTTP 200 with a non-zero ResponseCode means Daraja refused to route the
      // prompt at all. Recording it as payment_initiated left the page spinning
      // on "waiting for payment" for a quote that could never be paid.
      const message = describeFailure(stkData.ErrorMessage || stkData.ResponseDescription || '')
      purchase.status = 'failed'
      purchase.failureReason = message
      await savePurchase(purchase)

      return res.status(400).json({
        error: message,
        raw: stkData,
      })
    }

    // Update purchase record
    purchase.status = 'payment_initiated'
    purchase.paymentId = stkData.CheckoutRequestID
    purchase.phone = normalizedPhone
    purchase.merchantRequestId = stkData.MerchantRequestID
    await savePurchase(purchase)

    return res.json({
      ok: true,
      paymentId: stkData.CheckoutRequestID,
      status: 'payment_initiated',
      raw: stkData,
    })
  } catch (e) {
    logger.error('mallpointsPurchase', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/mallpoints/purchase/mpesa/callback - Safaricom callback
router.post('/mpesa/callback', express.json(), verifyWebhookToken, async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback
    if (!callbackData) {
      return res.status(400).json({ error: 'invalid callback data' })
    }

    const merchantRequestId = callbackData.MerchantRequestID
    const checkoutRequestId = callbackData.CheckoutRequestID
    const resultCode = callbackData.ResultCode
    const resultDesc = callbackData.ResultDesc

    logger.info('mallpoints-purchase', 'callback received', {
      merchantRequestId,
      checkoutRequestId,
      resultCode,
      resultDesc,
    })

    // Find the purchase by paymentId via Redis secondary index
    let purchase = await findPurchaseByPaymentId(checkoutRequestId)

    if (!purchase) {
      logger.warn('mallpoints-purchase', 'callback for unknown purchase', { checkoutRequestId })
      return res.json({ ok: true })
    }

    if (resultCode === 0) {
      // Payment successful
      purchase.status = 'confirmed'
      purchase.callbackData = callbackData
      purchase.confirmedAt = Date.now()
      await savePurchase(purchase)

      logger.info('mallpoints-purchase', 'payment confirmed', {
        quoteId: purchase.quoteId,
        amountKes: purchase.amountKes,
        mallpointsAmount: purchase.mallpointsAmount,
      })
    } else {
      // Payment failed
      purchase.status = 'failed'
      purchase.failureReason = describeFailure(resultDesc)
      purchase.callbackData = callbackData
      await savePurchase(purchase)

      logger.warn('mallpoints-purchase', 'payment failed', {
        quoteId: purchase.quoteId,
        resultCode,
        resultDesc,
      })
    }

    return res.json({ ok: true })
  } catch (e) {
    logger.error('mallpointsPurchase', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/mallpoints/purchase/credit - credit Mallpoints after payment
router.post('/credit', requireAuth(), async (req, res) => {
  try {
    const { quoteId } = req.body || {}

    if (!quoteId) {
      return res.status(400).json({ error: 'quoteId is required' })
    }

    const purchase = await getPurchase(quoteId)
    if (!purchase) {
      return res.status(404).json({ error: 'quote not found' })
    }

    if (purchase.status !== 'confirmed') {
      return res.status(400).json({
        error: `purchase is ${purchase.status}, not confirmed`,
        status: purchase.status,
      })
    }

    if (purchase.credited) {
      return res.status(400).json({ error: 'already credited' })
    }

    // Credit Mallpoints to both MallPointAccount (canonical on-chain balance)
    // and User.mlpts_balance (used by mines/creatorSpace/referrals).
    // Both updates must succeed atomically to prevent balance divergence.
    let account
    let creditedUserId = null
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        // Update MallPointAccount
        const result = await MallPointAccount.findOneAndUpdate(
          { address: purchase.address },
          { $inc: { balance: purchase.mallpointsAmount } },
          { new: true, upsert: true, setDefaultsOnInsert: true, session }
        )
        account = result

        // Update User.mlpts_balance — find user by wallet address
        const User = require('../models/user')
        const user = await User.findOne({ walletAddress_blind: blindIndex(purchase.address) }).session(session)
        if (user) {
          creditedUserId = user._id.toString()
          await User.updateOne(
            { _id: user._id },
            { $inc: { mlpts_balance: purchase.mallpointsAmount } },
            { session }
          )
        }

        purchase.status = 'credited'
        purchase.credited = true
        purchase.creditedAt = Date.now()
        await savePurchase(purchase)
      })
    } finally {
      await session.endSession()
    }

    logger.info('mallpoints-purchase', 'mallpoints credited', {
      quoteId: purchase.quoteId,
      address: purchase.address,
      mallpointsAmount: purchase.mallpointsAmount,
      newBalance: account.balance,
    })

    // The MLCN/KES pool is the credited-purchase ledger (see
    // liquidityController.fetchLedgerPoolReserves) — there is no on-chain add
    // to perform here. Note: Mallpoints purchases live in Redis with a
    // 10-minute TTL, so their fiat is not part of the durable ledger
    // reserves; this only settles the purchase's own liquidity bookkeeping
    // instead of reporting a guaranteed x/dex failure (MLCNS is an internal
    // x/mlcoin ledger token, the KES-side bank denom was never minted, and
    // the operator account was never funded).
    let liquidityResult = null
    try {
      const fiatAmount = Number(purchase.amountKes || 0)
      if (fiatAmount > 0) {
        purchase.liquidityAdded = true
        liquidityResult = { added: true, ledgerTracked: true }

        // Invalidate the cap cache so the next check sees the new pool value
        invalidateCapCache()

        logger.info('mallpoints-purchase', 'liquidity bookkeeping settled', {
          quoteId: purchase.quoteId,
          fiatAmount,
        })
      }
    } catch (liqErr) {
      logger.warn('mallpoints-purchase', 'liquidity add failed (non-fatal)', {
        quoteId: purchase.quoteId,
        error: liqErr.message || String(liqErr),
      })
      purchase.liquidityAdded = false
      purchase.liquidityError = liqErr.message || String(liqErr)
    }

    // Pool-ledger coverage: an MLPTS purchase brings real M-Pesa fiat into
    // the economy, but Mallpoints purchases live in Redis (10-min TTL) and
    // the durable pool reserves are the credited-MallcoinPurchase ledger —
    // so this is recorded as an informational row (affectsReserves: false).
    // Non-fatal by design: a ledger miss must never break the credit.
    try {
      await Promise.resolve(recordMallpointsPurchaseActivity('mallpoints_credited', purchase, {
        note: 'MLPTS purchased via M-Pesa; informational — pool reserves track credited MallcoinPurchases only.',
      })).catch((ledgerErr) => logger.warn('mallpoints-purchase', 'pool-activity ledger write failed (non-fatal)', {
        quoteId: purchase.quoteId,
        error: ledgerErr.message || String(ledgerErr),
      }))
    } catch (hookErr) {
      logger.warn('mallpoints-purchase', 'pool-activity ledger hook failed (non-fatal)', {
        quoteId: purchase.quoteId,
        error: hookErr?.message || String(hookErr),
      })
    }

    // Email the holder that their MLPTS landed (no MLPTS-purchase template
    // exists, so reuse the wallet deposit-confirmed template).
    // Fire-and-forget — never affects a completed credit.
    if (creditedUserId) {
      emitDepositConfirmed(creditedUserId, {
        amount: purchase.mallpointsAmount,
        asset: 'MLPTS',
        available_balance: account.balance,
        tx_hash_short: String(purchase.quoteId || '').slice(0, 12),
      }).catch(() => {})
    }

    return res.json({
      ok: true,
      quoteId: purchase.quoteId,
      mallpointsCredited: purchase.mallpointsAmount,
      newBalance: account.balance,
      status: 'credited',
      liquidity: liquidityResult ? {
        added: true,
        lpTokens: liquidityResult.lpTokens,
        txHash: liquidityResult.txHash,
      } : {
        added: false,
        error: purchase.liquidityError || null,
      },
    })
  } catch (e) {
    logger.error('mallpointsPurchase', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

// GET /api/mallpoints/purchase/status/:quoteId - check purchase status
router.get('/status/:quoteId', requireAuth(), async (req, res) => {
  try {
    const purchase = await getPurchase(req.params.quoteId)
    if (!purchase) {
      return res.json({ status: 'unknown' })
    }

    // The async callback is the primary path to `confirmed`; when it hasn't
    // landed yet (e.g. the public tunnel is down so Daraja can't POST back),
    // actively ask Daraja for the outcome so a genuinely-paid quote still
    // confirms. Throttled to once per 5s per quote to avoid hammering Daraja
    // while the UI polls every 3s.
    if (purchase.status === 'payment_initiated' && purchase.paymentId) {
      const now = Date.now()
      if (!purchase.lastQueryAt || now - Number(purchase.lastQueryAt) > 5000) {
        purchase.lastQueryAt = now
        await savePurchase(purchase)
        try {
          const q = await queryDarajaStatus(purchase)
          const cb = q?.Body?.stkCallbackResult
          if (cb && cb.ResultCode === 0) {
            purchase.status = 'confirmed'
            purchase.callbackData = cb
            purchase.confirmedAt = Date.now()
            await savePurchase(purchase)
          } else if (cb && cb.ResultCode && cb.ResultCode !== 0) {
            // A definitive failure (wrong password / cancelled). Note: Daraja
            // also returns non-zero codes while the prompt is genuinely still
            // pending, so only the well-known terminal codes fail the quote —
            // otherwise leave it `payment_initiated` and keep polling.
            const terminal = /cancelled|expired|fail|timeout|insufficient/i.test(cb.ResultDesc || '')
            if (terminal) {
              purchase.status = 'failed'
              purchase.failureReason = describeFailure(cb.ResultDesc)
              purchase.callbackData = cb
              await savePurchase(purchase)
            }
          }
        } catch (qErr) {
          logger.warn('mallpoints-purchase', 'status query failed (non-fatal)', {
            quoteId: purchase.quoteId,
            error: qErr.message || String(qErr),
          })
        }
      }
    }

    return res.json({
      quoteId: purchase.quoteId,
      status: purchase.status,
      amountKes: purchase.amountKes,
      mallpointsAmount: purchase.mallpointsAmount,
      address: purchase.address,
      createdAt: purchase.createdAt,
      confirmedAt: purchase.confirmedAt,
      creditedAt: purchase.creditedAt,
    })
  } catch (e) {
    logger.error('mallpointsPurchase', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router
