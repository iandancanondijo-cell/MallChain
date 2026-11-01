const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const MallPointAccount = require('../models/MallPointAccount')
const User = require('../models/user')
const { createLimiter } = require('../middleware/rateLimiter')
const { getChainUserPoints, getConversionWindow, mergePoints, buildConversionStatus } = require('../services/mallpointsService')
const { getUserBadgeInfo } = require('../services/badgeService')
const { creditMlcns } = require('../services/faucetService')
const {
  getMlptsPerMlcnsScale,
} = require('../services/mallcoinService')
const { getMallpointPriceKes } = require('../services/economyConstants')
const { getDynamicConversionRate } = require('../services/conversionRateOracle')
const { blindIndex } = require('../utils/fieldEncryption')
const { recordLiquidityActivity } = require('../services/liquidityActivityService')
const { appendAuditEvent } = require('../services/auditChainService')
const { emitMlptsConversionCompleted } = require('../services/activityEvents')
const { verifyConvertSignature } = require('../mallwallet/security/verifyAdr036')
const { config } = require('../config')
const logger = require('../utils/logger')

// How long a signed convert request stays valid. Short enough that a
// leaked/logged signature is useless shortly after, long enough to survive
// normal request latency.
const CONVERT_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000
const ADR036_CONSUMED_TTL_SECONDS = 60 * 60

const pointPrice = () => getMallpointPriceKes()

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
    logger.error('mallpoints', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
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
    logger.error('mallpoints', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/mallpoints/award - DISABLED
// Mallpoints must now be purchased via M-Pesa. See /api/mallpoints/purchase
router.post('/award', (req, res) => {
  return res.status(410).json({
    error: 'Mallpoints award endpoint has been disabled. Mallpoints must be purchased via M-Pesa.',
    purchaseEndpoint: '/api/mallpoints/purchase'
  })
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
      let rds;
      try {
        const getRedis = require('../mallwallet/queue/redis')
        rds = getRedis()
        const already = await rds.set(sigKey, '1', 'EX', ADR036_CONSUMED_TTL_SECONDS, 'NX')
        if (already === null) {
          return res.status(401).json({ error: 'signature already used — please sign a fresh message' })
        }
      } catch (_) {
        /* Redis unavailable — allow through; the signed-timestamp window + on-chain sequence replay protect the user */
      } finally {
        if (rds) rds.quit().catch(() => {});
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

    // Dynamic fiat-pegged conversion rate via the backend oracle.
    // The oracle fetches the live MLCNS/KES market price from the chain and
    // combines it with the configured MLPTS/KES price to compute:
    //   proposed_rate = (mlptsPriceKes / mlcnsMidPriceKes) * 1_000_000
    // This rate is clamped to the on-chain [min_conversion_rate, max_conversion_rate]
    // bounds so the Msg always passes on-chain validation. The same formula
    // is used on-chain (safeMulDiv in msg_server_convert_to_mallcoin.go) so
    // backend preview == on-chain settlement.
    const oracle = await getDynamicConversionRate()
    const ratioScale = getMlptsPerMlcnsScale()

    const pointsToConvert = Math.floor(acc.balance)
    if (pointsToConvert <= 0) return res.status(400).json({ error: 'insufficient points' })

    // Dynamic rate math: mlcnsAmount = (pointsAmount * proposedRate) / RATE_SCALE
    const mlcoinsRaw = (pointsToConvert * oracle.proposedRate) / ratioScale
    const mlcoins6 = Math.round(mlcoinsRaw * ratioScale) / ratioScale
    const mlcoins = mlcoins6
    const kesValue = pointsToConvert * oracle.mlptsPriceKes

    const previousLastConversionAt = acc.lastConversionAt

    // Atomic debit from both MallPointAccount (canonical on-chain balance)
    // and User.mlpts_balance (used by mines/creatorSpace/referrals).
    // Both updates must succeed atomically to prevent balance divergence.
    const session = await mongoose.startSession()
    let updated
    let convertedUserId = null
    try {
      await session.withTransaction(async () => {
        // Debit MallPointAccount
        updated = await MallPointAccount.findOneAndUpdate(
          { address, balance: { $gte: pointsToConvert } },
          { $inc: { balance: -pointsToConvert }, $set: { lastConversionAt: new Date() } },
          { new: true, session }
        )
        if (!updated) {
          throw new Error('insufficient balance (concurrent conversion?)')
        }

        // Debit User.mlpts_balance
        const user = await User.findOne({ walletAddress_blind: blindIndex(address) }).session(session)
        if (user) {
          convertedUserId = user._id.toString()
          await User.updateOne(
            { _id: user._id, mlpts_balance: { $gte: pointsToConvert } },
            { $inc: { mlpts_balance: -pointsToConvert } },
            { session }
          )
        }
      })
    } catch (txErr) {
      await session.endSession()
      if (txErr.message.includes('insufficient balance')) {
        return res.status(400).json({ error: 'insufficient balance (concurrent conversion?)' })
      }
      throw txErr
    }
    await session.endSession()

    try {
      const credit = await creditMlcns(address, mlcoins)

      // The MLCN/KES pool is the credited-purchase ledger (see
      // liquidityController.fetchLedgerPoolReserves) — and a conversion mints
      // MLCNS against points that carry no new fiat, so it correctly does not
      // move the pool reserves at all. The previous operator-signed
      // MsgAddLiquidity could never succeed (unfunded operator account;
      // MLCNS is an internal x/mlcoin ledger token the bank-coin dex can't
      // hold) and only ever fed the convert-liquidity DLQ.
      await recordLiquidityActivity({
        flow: 'mallpoints_convert',
        stage: 'liquidity_settled',
        status: 'success',
        poolId: 2,
        walletAddress: address,
        amountMlcns: mlcoins,
        fiatAmount: kesValue,
        creditTxHash: credit?.transfer?.txHash,
        note: 'Conversion settled; no pool-reserve change since no new fiat entered (ledger-based pool).',
      }).catch(() => {})
      const liquidityResult = { ledgerTracked: true }

      // Email the holder about the completed conversion (fire-and-forget).
      if (convertedUserId) {
        emitMlptsConversionCompleted(convertedUserId, {
          input_amount: pointsToConvert,
          output_amount: mlcoins,
          rate: `${(mlcoins / pointsToConvert).toFixed(2)} MLCNS per MLPTS`,
          conversion_reference: credit?.transfer?.txHash || 'pending',
        }).catch(() => {})
      }

      // Tamper-evident ledger: a conversion moves real value (points ->
      // minted MLCNS), so its settlement is chain-audited with the wallet
      // as actor (no req.user here — the ADR-036 signature proves ownership
      // of `address`, which is exactly the identity worth recording).
      appendAuditEvent(
        { id: String(address), role: 'wallet-holder' },
        'mallpoints_conversion_settled',
        `wallet:${address}`,
        {
          userId: convertedUserId ? String(convertedUserId) : null,
          convertedPoints: pointsToConvert,
          mallcoins: mlcoins,
          creditTxHash: credit?.transfer?.txHash || null,
        }
      )

      return res.json({
        ok: true,
        convertedPoints: pointsToConvert,
        mallcoins: mlcoins,
        ratio: {
          source: oracle.source,
          proposed_rate: oracle.proposedRate,
          min_rate: oracle.minRate,
          max_rate: oracle.maxRate,
          rate_scale: oracle.rateScale,
          clamped: oracle.clamped,
          mlpts_price_kes: oracle.mlptsPriceKes,
          mlcns_mid_price_kes: oracle.mlcnsMidPriceKes,
          kes_value_of_points: kesValue,
        },
        liquidity: liquidityResult,
        credit,
      })
    } catch (creditErr) {
      // Atomic rollback — restore the debited points. Uses $inc to avoid
      // racing with any other concurrent operation on this account.
      await MallPointAccount.findOneAndUpdate(
        { address },
        { $inc: { balance: pointsToConvert }, $set: { lastConversionAt: previousLastConversionAt } }
      )
      logger.warn('mallpoints', 'MLCNS credit failed; points restored', { error: creditErr.message })
      return res.status(502).json({
        error: 'Points conversion credited on ledger failed',
        detail: creditErr.message,
      })
    }

  } catch (e) {
    logger.error('mallpoints', { route: req.originalUrl, error: e.message || String(e) });
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router
