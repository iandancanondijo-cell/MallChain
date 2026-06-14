const express = require('express')
const router = express.Router()
const axios = require('axios')
const MallPointAccount = require('../models/MallPointAccount')
const { createLimiter } = require('../middleware/rateLimiter')
const { getChainUserPoints, getConversionWindow, mergePoints, buildConversionStatus } = require('../services/mallpointsService')
const { getUserBadgeInfo } = require('../services/badgeService')
const { creditMlcns } = require('../services/faucetService')

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
    console.error('mallpoints get error', e)
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
    console.error('mallpoints sync error', e)
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/mallpoints/award - award initial mallpoints when wallet is created
// Awards points equivalent to a fiat target (default 34.99 KES) using a configurable
// point price (default 2 KES per Mallpoint). You can override with env vars:
// MALLPOINT_AWARD_FIAT and MALLPOINT_PRICE_KES
router.post('/award', createLimiter({ windowMs: 60*1000, max: 20 }), async (req, res) => {
  try {
    const { address, amount } = req.body || {}
    if (!address) return res.status(400).json({ error: 'missing address' })

    const existing = await MallPointAccount.findOne({ address })
    if (existing) return res.json({ ok: true, message: 'already awarded', balance: existing.balance })

    // Determine fiat target and point price
    const targetFiat = (typeof process.env.MALLPOINT_AWARD_FIAT !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_AWARD_FIAT))) ? Number(process.env.MALLPOINT_AWARD_FIAT) : 34.99
    const pointPrice = (typeof process.env.MALLPOINT_PRICE_KES !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_PRICE_KES))) ? Number(process.env.MALLPOINT_PRICE_KES) : 2

    // If caller provided absolute amount (points), respect it; otherwise compute from fiat target
    let awardPoints
    if (typeof amount === 'number' && amount > 0) {
      awardPoints = amount
    } else {
      awardPoints = targetFiat / (pointPrice || 1)
    }

    // Normalize to sensible precision (6 decimals) and store
    const award = Math.round(awardPoints * 1_000_000) / 1_000_000

    const acc = await MallPointAccount.create({ address, balance: award })
    return res.json({ ok: true, awardedPoints: award, awardedFiat: (award * pointPrice), pointPrice, balance: acc.balance })
  } catch (e) {
    console.error('mallpoints award error', e)
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/mallpoints/convert - convert mallpoints to mallcoins once per month (on 15th)
// body: { address }
router.post('/convert', async (req, res) => {
  try {
    const { address } = req.body || {}
    if (!address) return res.status(400).json({ error: 'missing address' })

    const acc = await MallPointAccount.findOne({ address })
    if (!acc || !acc.balance || acc.balance <= 0) return res.status(400).json({ error: 'no mallpoints to convert' })

    const today = new Date()
    const allowAnyDay = process.env.MALLPOINTS_CONVERT_ANY_DAY === 'true'
    if (!allowAnyDay && today.getUTCDate() !== 15) {
      return res.status(400).json({
        error: 'conversion window closed: conversion allowed only on the 15th of each month (set MALLPOINTS_CONVERT_ANY_DAY=true in dev)',
      })
    }

    // Ensure one conversion per calendar month
    if (acc.lastConversionAt) {
      const last = new Date(acc.lastConversionAt)
      if (last.getUTCFullYear() === today.getUTCFullYear() && last.getUTCMonth() === today.getUTCMonth()) {
        return res.status(400).json({ error: 'already converted this month' })
      }
    }

    // fetch live mlcoin mid price (via backend market controller)
    let mlcoinPrice = 1
    try {
      const m = await axios.get(`${req.protocol}://${req.get('host')}/api/market/price`)
      if (m.data && m.data.market_price && typeof m.data.market_price.mid !== 'undefined') mlcoinPrice = Number(m.data.market_price.mid)
    } catch (e) { /* ignore - fallback to 1 */ }

    // Conversion policy: on-chain ConvertToMallcoin is 1:1 by default.
    // We'll convert using 1:1 (points -> mallcoins) and credit mallcoins via existing credit flow.
    const pointsToConvert = Math.floor(acc.balance) // integer points; if decimals were used, floor to integer
    if (pointsToConvert <= 0) return res.status(400).json({ error: 'insufficient points' })

    const previousLastConversionAt = acc.lastConversionAt

    acc.balance = acc.balance - pointsToConvert
    acc.lastConversionAt = new Date()
    await acc.save()

    const mlcoins = pointsToConvert

    try {
      const credit = await creditMlcns(address, mlcoins)
      return res.json({
        ok: true,
        convertedPoints: pointsToConvert,
        mallcoins: mlcoins,
        credit,
      })
    } catch (creditErr) {
      acc.balance = acc.balance + pointsToConvert
      acc.lastConversionAt = previousLastConversionAt
      await acc.save()
      console.warn('MLCNS credit failed; points restored', creditErr.message)
      return res.status(502).json({
        error: 'Points conversion credited on ledger failed',
        detail: creditErr.message,
      })
    }

  } catch (e) {
    console.error('mallpoints convert error', e)
    res.status(500).json({ error: String(e) })
  }
})

module.exports = router
