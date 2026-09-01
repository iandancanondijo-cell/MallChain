const express = require('express')
const router = express.Router()
const MallPointAccount = require('../models/MallPointAccount')
const { createLimiter } = require('../middleware/rateLimiter')
const { getChainUserPoints, getConversionWindow, mergePoints, buildConversionStatus } = require('../services/mallpointsService')
const { getUserBadgeInfo } = require('../services/badgeService')
const { creditMlcns } = require('../services/faucetService')
const {
  getChainParams,
  getMlptsPerMlcnsScale,
  mlptsPerMlcnsToNumber,
} = require('../services/mallcoinService')
const { addLiquidityToPool } = require('../controllers/liquidityController')
const { recordLiquidityActivity } = require('../services/liquidityActivityService')
const { verifyConvertSignature } = require('../mallwallet/security/verifyAdr036')
const { config } = require('../config')
const logger = require('../utils/logger')
// C2: Dead-letter outbox for liquidity-add failures after a successful
// creditMlcns. Because the credit step already moved real value (treasury
// minted coins into the user's wallet), we CANNOT roll points back —
// instead the liquidity failure is retried via BullMQ 3× exponential, then
// persisted to Mongo convert_dead_letters for operator remediation.
const { enqueueConvertLiquidityFailure } = require('../mallwallet/queue/convertLiquidityQueue')

// How long a signed convert request stays valid. Short enough that a
// leaked/logged signature is useless shortly after, long enough to survive
// normal request latency.
const CONVERT_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000
const ADR036_CONSUMED_TTL_SECONDS = 60 * 60

const pointPrice = () =>
  (typeof process.env.MALLPOINT_PRICE_KES !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_PRICE_KES)))
    ? Number(process.env.MALLPOINT_PRICE_KES)
    : 2

// GET /api/mallpoints/:address — chain + database Mallpoints
router.get('/:address', async (req, res) => {
  try {
    const a = req.params.address
    const acc = await MallPointAccount.findOne({ address: a })
    const dbBalance = acc ? acc.balance : 0
    const chain = await getChainUserPoints(a)
    const merged = mergePoints({ chain, dbBalance })
    const badge = await getUserBadgeInfo(a)
    const conversionWindow = await getConversionWindow()
    const conversionStatus = buildConversionStatus({
      hasBadge: badge.exists,
      lastConversionAt: acc?.lastConversionAt,
      allowAnyDay: process.env.MALLPOINTS_CONVERT_ANY_DAY === 'true',
    })

    return res.json({
      address: a,
      balance: merged.balance,
      chainPoints: merged.chainPoints,
      dbPoints: merged.dbPoints,
      sources: merged.sources,
      lastConversionAt: acc?.lastConversionAt,
      pointPrice: pointPrice(),
      chain: chain.exists ? chain : null,
      conversionWindow,
      badge,
      conversionStatus,
      convertiblePoints: Math.floor(acc?.balance || 0),
    })
  } catch (e) {
    logger.error('mallpoints', 'mallpoints get error', e)
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/mallpoints/sync - refresh marketplace profile and badge status
router.post('/sync', async (req, res) => {
  try {
    const { address } = req.body || {}
    if (!address) return res.status(400).json({ error: 'missing address' })

    const acc = await MallPointAccount.findOne({ address })
    const dbBalance = acc ? acc.balance : 0
    const chain = await getChainUserPoints(address)
    const merged = mergePoints({ chain, dbBalance })
    const badge = await getUserBadgeInfo(address)
    const conversionWindow = await getConversionWindow()
    const conversionStatus = buildConversionStatus({
      hasBadge: badge.exists,
      lastConversionAt: acc?.lastConversionAt,
      allowAnyDay: process.env.MALLPOINTS_CONVERT_ANY_DAY === 'true',
    })

    return res.json({
      address,
      balance: merged.balance,
      chainPoints: merged.chainPoints,
      dbPoints: merged.dbPoints,
      sources: merged.sources,
      lastConversionAt: acc?.lastConversionAt,
      pointPrice: pointPrice(),
      chain: chain.exists ? chain : null,
      conversionWindow,
      badge,
      conversionStatus,
      convertiblePoints: Math.floor(dbBalance || 0),
    })
  } catch (e) {
    logger.error('mallpoints', 'mallpoints sync error', e)
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/mallpoints/award - award initial mallpoints when wallet is created
// Awards points equivalent to a fiat target (default 34.99 KES) using a configurable
// point price (default 2 KES per Mallpoint). You can override with env vars:
// MALLPOINT_AWARD_FIAT and MALLPOINT_PRICE_KES
//
// The award amount is always server-computed from these env vars — it is NOT
// taken from the request body. Accepting a caller-supplied `amount` here let
// anyone mint themselves arbitrary Mallpoints for free (no payment check),
// which then convert 1:1 into real minted Mallcoin once a conversion window
// is open. This is a one-time signup bonus, not a purchase; buying Mallpoints
// with real money must go through a payment-confirmed flow instead.
router.post('/award', createLimiter({ windowMs: 60*1000, max: 20 }), async (req, res) => {
  try {
    const { address } = req.body || {}
    if (!address) return res.status(400).json({ error: 'missing address' })

    const existing = await MallPointAccount.findOne({ address })
    if (existing) return res.json({ ok: true, message: 'already awarded', balance: existing.balance })

    // Determine fiat target and point price
    const targetFiat = (typeof process.env.MALLPOINT_AWARD_FIAT !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_AWARD_FIAT))) ? Number(process.env.MALLPOINT_AWARD_FIAT) : 34.99
    const pointPrice = (typeof process.env.MALLPOINT_PRICE_KES !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_PRICE_KES))) ? Number(process.env.MALLPOINT_PRICE_KES) : 2

    const awardPoints = targetFiat / (pointPrice || 1)

    // Normalize to sensible precision (6 decimals) and store
    const award = Math.round(awardPoints * 1_000_000) / 1_000_000

    const acc = await MallPointAccount.create({ address, balance: award })
    return res.json({ ok: true, awardedPoints: award, awardedFiat: (award * pointPrice), pointPrice, balance: acc.balance })
  } catch (e) {
    logger.error('mallpoints', 'mallpoints award error', e)
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/mallpoints/convert - convert mallpoints to mallcoins using the same
// eligibility rules exposed by the status/sync endpoints.
//
// This moves real value (a MLPTS balance -> a real operator-signed MLCNS
// credit + on-chain liquidity-add) on behalf of `address`, with no other
// verification step in front of it (unlike /buy, which requires a real
// M-Pesa payment, or Send, whose fund movement is itself a client-signed
// on-chain tx). Without proof of address ownership, anyone who knows an
// address with a badge + balance could force a conversion for it. Requires
// an ADR-036 signature over a fixed message binding the request to this
// address and a short-lived timestamp (replay window: CONVERT_SIGNATURE_MAX_AGE_MS).
// body: { address, timestamp, pubKey, signature }
router.post('/convert', async (req, res) => {
  try {
    const { address, timestamp, pubKey, signature } = req.body || {}
    if (!address) return res.status(400).json({ error: 'missing address' })

    if (!timestamp || !pubKey || !signature) {
      return res.status(401).json({ error: 'a wallet signature is required to convert Mallpoints for this address' })
    }
    const signedAtMs = Date.parse(timestamp)
    if (!Number.isFinite(signedAtMs) || Math.abs(Date.now() - signedAtMs) > CONVERT_SIGNATURE_MAX_AGE_MS) {
      return res.status(401).json({ error: 'signature expired — please try again' })
    }
    const sigKey = `adr036_consumed:convert:${Buffer.from(String(signature || '').slice(0, 128)).toString('base64')}`
    if (process.env.TEST_MODE !== 'true') {
      try {
        const getRedis = require('../mallwallet/queue/redis')
        const rds = getRedis()
        const already = await rds.set(sigKey, '1', 'EX', ADR036_CONSUMED_TTL_SECONDS, 'NX')
        if (already === null) {
          return res.status(401).json({ error: 'signature already used — please sign a fresh message' })
        }
      } catch (_) {
        /* Redis unavailable — allow through; the signed-timestamp window + on-chain sequence replay protect the user */
      }
    }
    const ownsAddress = verifyConvertSignature({
      address,
      timestamp,
      pubKeyBase64: pubKey,
      signatureBase64: signature,
      addressPrefix: config.chain.prefix,
    })
    if (!ownsAddress) {
      return res.status(401).json({ error: 'invalid signature — unable to verify you control this wallet' })
    }

    const acc = await MallPointAccount.findOne({ address })
    if (!acc || !acc.balance || acc.balance <= 0) return res.status(400).json({ error: 'no mallpoints to convert' })

    const today = new Date()
    const allowAnyDay = process.env.MALLPOINTS_CONVERT_ANY_DAY === 'true'
    const badge = await getUserBadgeInfo(address)
    const conversionStatus = buildConversionStatus({
      hasBadge: badge.exists,
      lastConversionAt: acc.lastConversionAt,
      now: today,
      allowAnyDay,
    })

    if (!conversionStatus.canConvert) {
      return res.status(400).json({
        error: conversionStatus.reason || 'conversion window closed',
        conversionStatus,
      })
    }

    // C4 / single source of truth for the Mallpoints → Mallcoin conversion
    // ratio. This used to fetch the live MLCNS/KES mid-price and then
    // silently ignore it (hardcoded 1:1 conversion), which made the
    // settle amount drift by 15-40% away from governance intent. The
    // value now comes from the on-chain x/mlcoin Params.MlptsPerMlcns
    // governance param (6-decimal fixed-point), same source used on
    // the MsgConvertToMallcoin keeper side so client preview == on-chain
    // settlement. KES-value is also still preserved for liquidity pool
    // accounting (addLiquidityToPool needs a fiat side).
    const chainParams = await getChainParams()
    const mlptsPerMlcnsFloat = mlptsPerMlcnsToNumber(chainParams.mlpts_per_mlcns)
    const ratioScale = getMlptsPerMlcnsScale()

    const pointsToConvert = Math.floor(acc.balance) // integer points; if decimals were used, floor to integer
    if (pointsToConvert <= 0) return res.status(400).json({ error: 'insufficient points' })

    // C4 CHAIN-AUTHORITATIVE math, matching the Go keeper formula exactly:
    //   mlcnsAmount = (pointsAmount * ratioFixed) / scale
    // This is the same safeMulDiv formula run by
    // x/mallpoints/keeper/msg_server_convert_to_mallcoin.go so the REST
    // preview and the on-chain Msg result converge for the same input.
    const mlcoinsRaw = (pointsToConvert * Number(chainParams.mlpts_per_mlcns || 0)) / ratioScale
    const mlcoins6 = Math.round(mlcoinsRaw * ratioScale) / ratioScale  // 6-decimal precision
    const mlcoins = mlcoins6
    const kesValue = pointsToConvert * pointPrice()

    const previousLastConversionAt = acc.lastConversionAt

    acc.balance = acc.balance - pointsToConvert
    acc.lastConversionAt = new Date()
    await acc.save()

    try {
      const credit = await creditMlcns(address, mlcoins)

      // All Mallpoints mined on the platform eventually convert to MLCNS —
      // once fiat buying permanently locks (see buyGateService.js), this
      // becomes the primary way new MLCNS enters circulation, so it needs
      // to feed the same MLCN/KES pool fiat buys do (mirrors buy.js's
      // applyLiquidityAfterCredit).
      //
      // C2 atomicity: MLCNS credit is an atomic operator-signed mint that
      // can't be undone without a treasury double-spend (a hard breach
      // class we already protect via the rollback guard below — L316-330
      // restores points only if credit FAILS; if it succeeded, points
      // stay consumed). Liquidity-add however is non-atomic REST → DB →
      // pool-accounting multi-hop, so partial failures are common.
      // Strategy here:
      //   1. If addLiquidityToPool throws → enqueueConvertLiquidityFailure
      //      to BullMQ convert-liquidity-dlq (3× exponential backoff)
      //   2. Worker retries; on 3rd failure → write Mongo
      //      convert_dead_letters for operator remediation
      //   3. User-visible HTTP response still reports success with a
      //      liquidity: {queued: true, reason} field so the UI can flag
      //      "convert settled, liquidity will follow".
      let liquidityResult = null
      try {
        liquidityResult = await addLiquidityToPool({
          poolId: 2,
          amount0: mlcoins,
          amount1: kesValue,
          userAddress: address,
        })
        await recordLiquidityActivity({
          flow: 'mallpoints_convert',
          stage: 'liquidity_added',
          status: 'success',
          poolId: 2,
          walletAddress: address,
          amountMlcns: mlcoins,
          fiatAmount: kesValue,
          lpTokens: liquidityResult?.lpTokens,
          note: 'Liquidity added to pool after a Mallpoints->MLCNS conversion.',
        })
      } catch (liqErr) {
        const firstFailedAt = new Date().toISOString()
        logger.warn('mallpoints', 'conversion liquidity add failed — enqueued to convert-liquidity-dlq', {
          error: liqErr.message,
          address,
          mlcoins,
          kesValue,
        })
        await recordLiquidityActivity({
          flow: 'mallpoints_convert',
          stage: 'liquidity_add_enqueued_dlq',
          status: 'failed',
          poolId: 2,
          walletAddress: address,
          amountMlcns: mlcoins,
          fiatAmount: kesValue,
          reason: liqErr.message,
        }).catch(() => {})

        // C2b: enqueue for 3× exponential retry, dead-letter to Mongo on exhaustion.
        await enqueueConvertLiquidityFailure({
          address,
          mlcoins,
          kesValue,
          poolId: 2,
          firstFailedAt,
          previousAttempts: 0,
          originalError: String(liqErr?.message || liqErr),
        })

        // Mark queued so the caller can distinguish live-added vs queued.
        liquidityResult = {
          queued: true,
          queue: 'convert-liquidity-dlq',
          retryAttempts: 3,
          reason: liqErr.message,
          firstFailedAt,
        }
      }

      return res.json({
        ok: true,
        convertedPoints: pointsToConvert,
        mallcoins: mlcoins,
        // C4 metadata: include the authoritative ratio so callers can audit
        // exactly which governance value was used for this conversion.
        ratio: {
          source: chainParams.source,
          mlpts_per_mlcns_fixed: chainParams.mlpts_per_mlcns,
          mlpts_per_mlcns: mlptsPerMlcnsFloat,
          scale: ratioScale,
          point_price_kes: pointPrice(),
          kes_value_of_points: kesValue,
        },
        liquidity: liquidityResult,
        credit,
      })
    } catch (creditErr) {
      acc.balance = acc.balance + pointsToConvert
      acc.lastConversionAt = previousLastConversionAt
      await acc.save()
      logger.warn('mallpoints', 'MLCNS credit failed; points restored', { error: creditErr.message })
      return res.status(502).json({
        error: 'Points conversion credited on ledger failed',
        detail: creditErr.message,
      })
    }

  } catch (e) {
    logger.error('mallpoints', 'mallpoints convert error', e)
    res.status(500).json({ error: String(e) })
  }
})

module.exports = router
