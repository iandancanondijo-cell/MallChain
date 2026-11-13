const axios = require('axios')
const fs = require('fs')
const os = require('os')
const path = require('path')
const mongoose = require('mongoose')

const MarketPriceSample = require('../models/MarketPriceSample')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'

const MARKET_PRICE_PATH = '/tmp/marketplace/mlcoin/v1/market/price'
const EMISSION_STATE_PATH = '/tmp/marketplace/mlcoin/v1/emission_state'

function chainRest(urlPath) {
  return `${CHAIN_REST.replace(/\/$/, '')}${urlPath}`
}

// ---------------------------------------------------------------------------
// The price series, kept in two tiers, both made of real chain reads.
//
//   1. `priceHistory` — this process's own samples, one per 15s poll. Exact to
//      the second, free to read, and it dies with the process.
//   2. `MarketPriceSample` (Mongo) — the same samples bucketed to one minute.
//      Survives restarts, which is the point: before this collection existed
//      every "7d" figure was computed from however long the running process
//      happened to have been up, so a restart silently turned a week of trend
//      into ten minutes of drift wearing a `7d` label.
//
// The rule that matters: a range that neither tier can reach back to answers
// `null` (and `window.covered: false`), instead of falling back to "the oldest
// sample I happen to have". Callers can tell "flat for a week" from "the
// process started ten minutes ago", which is the thing the old
// aggregateChangeForRange could not express.
// ---------------------------------------------------------------------------
const priceHistory = []
const PRICE_HISTORY_RETENTION_MS = 1000 * 60 * 60 * 24 * 31 * 6 // ~6 months
const PRICE_POLL_INTERVAL_MS = 15 * 1000

const PRICE_BUCKET_MS = 60 * 1000
/** Buckets older than this are pruned; nothing we report reaches past 30d. */
const PRICE_STORE_RETENTION_MS = 1000 * 60 * 60 * 24 * 40
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000
/** A stalled Mongo must not stall a price read; the chain answer is still useful. */
const DB_TIMEOUT_MS = 2500
/** The durable series is scanned at most this often, however many readers poll. */
const TREND_SERIES_TTL_MS = 45 * 1000
/** The longest range an aggregate is computed from the durable series. */
const TREND_SERIES_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const HOUR_BUCKETS = 60

let trendSeries = null
let trendSeriesAt = 0
let lastPruneAt = 0

function dbReady() {
  try {
    return mongoose.connection.readyState === 1
  } catch {
    return false
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`market price store timeout after ${ms}ms`)), ms)
      if (timer && typeof timer.unref === 'function') timer.unref()
    }),
  ])
}

const round6 = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null
}

/** The chain's current MLCNS spread, in KES per coin. Null when the REST gateway has no price. */
async function readChainMarketPrice() {
  const resp = await axios.get(chainRest(MARKET_PRICE_PATH), { timeout: 5000 })
  const data = resp.data || {}
  const mp = data.market_price || data.marketPrice || null
  if (!mp) return null
  // buy_price and sell_price are integers scaled by 100 in the chain proto.
  const buy = Number(mp.buy_price) / 100
  const sell = Number(mp.sell_price) / 100
  const rawHeight = mp.last_update_height !== undefined ? mp.last_update_height : mp.lastUpdateHeight
  const height = Number.isFinite(Number(rawHeight)) ? Number(rawHeight) : null
  return { buy, sell, mid: ((buy || 0) + (sell || 0)) / 2, height, raw: mp }
}

function rememberInMemory(sample) {
  priceHistory.push({ ts: sample.ts, mid: sample.mid })
  const cutoff = Date.now() - PRICE_HISTORY_RETENTION_MS
  while (priceHistory.length && priceHistory[0].ts < cutoff) priceHistory.shift()
}

/**
 * One document per minute. The poller owns these writes — readers do not, so
 * a busy dashboard cannot turn every price poll into a database write.
 */
async function storeSample(sample) {
  if (!dbReady()) return false
  try {
    await withTimeout(MarketPriceSample.updateOne(
      { bucket: Math.floor(sample.ts / PRICE_BUCKET_MS) },
      {
        $set: {
          ts: sample.ts,
          capturedAt: new Date(sample.ts),
          buy: sample.buy,
          sell: sample.sell,
          mid: sample.mid,
          height: sample.height === null ? null : sample.height,
        },
      },
      { upsert: true },
    ), DB_TIMEOUT_MS)

    if (Date.now() - lastPruneAt > PRUNE_INTERVAL_MS) {
      lastPruneAt = Date.now()
      await withTimeout(
        MarketPriceSample.deleteMany({ ts: { $lt: Date.now() - PRICE_STORE_RETENTION_MS } }),
        DB_TIMEOUT_MS,
      ).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

async function pollChainPriceOnce() {
  try {
    const price = await readChainMarketPrice()
    if (!price) return
    const sample = { ...price, ts: Date.now() }
    rememberInMemory(sample)
    await storeSample(sample)
  } catch (err) {
    // ignore polling errors; history remains as-is
  }
}

// start background poller. unref() so this timer alone never keeps the
// Node process (or a test runner that requires this module) alive — the
// HTTP server is what should hold the process open, not a price poller.
const pricePollTimer = setInterval(pollChainPriceOnce, PRICE_POLL_INTERVAL_MS)
if (pricePollTimer && typeof pricePollTimer.unref === 'function') pricePollTimer.unref()
// initial fill
pollChainPriceOnce().catch(() => {})

function memorySampleAtOrBefore(cutoffMs) {
  for (let i = priceHistory.length - 1; i >= 0; i--) {
    if (priceHistory[i].ts <= cutoffMs) return priceHistory[i]
  }
  return null
}

/**
 * Group the durable buckets so a range read returns at most `points` rows no
 * matter whether the caller asked for an hour or a month.
 */
async function aggregateBuckets(fromBucket, toBucket, groupBuckets) {
  if (!dbReady()) return null
  try {
    const rows = await withTimeout(MarketPriceSample.aggregate([
      { $match: { bucket: { $gte: fromBucket, $lte: toBucket } } },
      {
        $group: {
          _id: { $floor: { $divide: ['$bucket', groupBuckets] } },
          ts: { $max: '$ts' },
          mid: { $avg: '$mid' },
          buy: { $avg: '$buy' },
          sell: { $avg: '$sell' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, ts: 1, mid: 1, buy: 1, sell: 1 } },
    ]), DB_TIMEOUT_MS)
    return (rows || [])
      .map((r) => ({ ts: Number(r.ts), mid: round6(r.mid), buy: round6(r.buy), sell: round6(r.sell) }))
      .filter((r) => Number.isFinite(r.ts) && r.mid !== null)
  } catch {
    return null
  }
}

/** Hourly series across the longest range we report an aggregate for, cached. */
async function loadTrendSeries() {
  if (!dbReady()) return null
  if (trendSeries && Date.now() - trendSeriesAt < TREND_SERIES_TTL_MS) return trendSeries
  const now = Date.now()
  const rows = await aggregateBuckets(
    Math.floor((now - TREND_SERIES_WINDOW_MS) / PRICE_BUCKET_MS),
    Math.floor(now / PRICE_BUCKET_MS),
    HOUR_BUCKETS,
  )
  if (rows === null) {
    // A failed scan keeps the previous (real, just older) series available
    // rather than blanking a chart that has truthful data behind it.
    return trendSeries
  }
  trendSeries = rows
  trendSeriesAt = Date.now()
  return trendSeries
}

function storedSampleAtOrBefore(series, cutoffMs) {
  if (!series || !series.length) return null
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].ts <= cutoffMs) return series[i]
  }
  return null
}

/**
 * Percent change over `rangeMs`, or null when the range is not covered.
 *
 * Prefers this process's own second-accurate samples; only asks the durable
 * series when memory cannot reach back that far. `since` and `source` say
 * which sample the change was measured from, so a reader can state the real
 * span instead of trusting the label.
 */
async function changeForRange(rangeMs, latestMid, stored) {
  const cutoff = Date.now() - rangeMs
  if (!latestMid) return null
  const fromMemory = memorySampleAtOrBefore(cutoff)
  const past = fromMemory || storedSampleAtOrBefore(stored, cutoff)
  if (!past || !past.mid) return null
  return {
    pct: round6(((latestMid - past.mid) / past.mid) * 100),
    latest: latestMid,
    past: past.mid,
    since: new Date(past.ts).toISOString(),
    spanMs: Date.now() - past.ts,
    source: fromMemory ? 'process' : 'store',
  }
}

const AGGREGATE_RANGES_MS = {
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '15d': 15 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  // Longer than the durable series is kept, so this answers null until history
  // is retained for half a year. Honest, and the UI must say "not recorded".
  '5M': 5 * 30 * 24 * 60 * 60 * 1000,
}

/** How far back each tier actually reaches, for the response's coverage block. */
function storeCoverage() {
  const series = trendSeries
  const ready = dbReady()
  return {
    persisted: ready && Array.isArray(series) && series.length > 0,
    oldestTs: ready && series && series.length ? series[0].ts : null,
    newestTs: ready && series && series.length ? series[series.length - 1].ts : null,
    bucketMs: PRICE_BUCKET_MS,
    retentionMs: PRICE_STORE_RETENTION_MS,
  }
}

async function getMarketPrice(req, res) {
  try {
    const price = await readChainMarketPrice()
    if (!price) return res.status(502).json({ error: 'no market price in chain response' })

    const buy = price.buy
    const sell = price.sell
    const latestMid = price.mid

    // keep in-memory history fresh: append if the poller hasn't yet recorded this sample
    const now = Date.now()
    const last = priceHistory.length ? priceHistory[priceHistory.length - 1] : null
    if (!last || (now - last.ts) > Math.max(5000, PRICE_POLL_INTERVAL_MS - 1000)) {
      rememberInMemory({ ts: now, mid: latestMid })
    }

    // `?window=` asks for a series that actually spans that window, downsampled
    // to at most `?points=` rows (default 120, capped at 500). Without it the
    // response carries this process's recent samples, which is what the chart
    // on the dashboard drew before the windowed read existed.
    const query = req.query || {}
    const requested = String(query.window || '').toLowerCase()
    const windowMs = PRICE_WINDOWS_MS[requested] || null
    const points = clampPoints(query.points)

    let history
    let window
    if (windowMs) {
      const fromBucket = Math.floor((now - windowMs) / PRICE_BUCKET_MS)
      const toBucket = Math.floor(now / PRICE_BUCKET_MS)
      const spanBuckets = Math.max(1, toBucket - fromBucket)
      const groupBuckets = Math.max(1, Math.ceil(spanBuckets / points))
      const series = await aggregateBuckets(fromBucket, toBucket, groupBuckets)
      const usingStore = Array.isArray(series)
      history = usingStore ? series : priceHistory.slice(-points)
      const first = history.length ? history[0] : null
      const lastRow = history.length ? history[history.length - 1] : null
      window = {
        requested,
        windowMs,
        points: history.length,
        spanMs: first && lastRow ? lastRow.ts - first.ts : 0,
        groupMs: usingStore ? groupBuckets * PRICE_BUCKET_MS : null,
        source: usingStore ? 'store' : 'process',
        covered: Boolean(first) && first.ts <= now - windowMs,
        firstTs: first ? first.ts : null,
        lastTs: lastRow ? lastRow.ts : null,
      }
    } else {
      history = priceHistory.slice(-500) // last up to 500 samples
      const first = history.length ? history[0] : null
      const lastRow = history.length ? history[history.length - 1] : null
      // No window was asked for, so none is claimed: this is only this
      // process's recent samples, and `covered` stays false to say so.
      window = {
        requested: null,
        windowMs: null,
        points: history.length,
        spanMs: first && lastRow ? lastRow.ts - first.ts : 0,
        groupMs: null,
        source: 'process',
        covered: false,
        firstTs: first ? first.ts : null,
        lastTs: lastRow ? lastRow.ts : null,
      }
    }

    // A windowed read has already scanned the store; reuse the hourly trend
    // series for the aggregates rather than scanning again.
    const stored = await loadTrendSeries()
    const aggregates = {}
    for (const key of Object.keys(AGGREGATE_RANGES_MS)) {
      aggregates[key] = await changeForRange(AGGREGATE_RANGES_MS[key], latestMid, stored)
    }

    return res.json({
      market_price: {
        buy_price: buy,
        sell_price: sell,
        mid: latestMid,
        last_update_height: price.height,
        raw: price.raw,
      },
      history,
      window,
      aggregates,
      store: storeCoverage(),
    })
  } catch (err) {
    return res.status(502).json({ error: 'failed to fetch on-chain market price', details: String(err) })
  }
}

function clampPoints(raw) {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return 120
  return Math.min(500, Math.max(2, n))
}

/** Window names accepted by `GET /api/market/price?window=`. */
const PRICE_WINDOWS_MS = {
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/**
 * Emission state from the chain, or from the local genesis file when the
 * chain cannot be reached. `fallback: 'genesis'` means the numbers describe
 * how the chain was started, not what it holds right now — callers must not
 * present those as live, and getTotalSupply/getMarketCap both pass it through.
 */
function shapedEmission(es, fallback) {
  const raw = Number(es.total_supply || es.totalSupply || 0)
  const supply = raw / 1_000_000
  const rawCirculating = Number(es.circulating || es.circulating_supply || 0)
  const circulating = rawCirculating / 1_000_000
  const out = {
    raw,
    supply,
    circulating_raw: rawCirculating,
    circulating,
    raw_proto: es,
    monthly_cap: Number(es.monthly_cap || es.monthlyCap || 0) / 1_000_000,
    current_month: Number(es.current_month || es.currentMonth || 0),
  }
  if (fallback) out.fallback = fallback
  return out
}

function emissionFromGenesis() {
  try {
    const home = process.env.MARKETPLACED_HOME || path.join(os.homedir(), '.marketplace')
    const genesisPath = path.join(home, 'config', 'genesis.json')
    if (!fs.existsSync(genesisPath)) return null
    const g = JSON.parse(fs.readFileSync(genesisPath, 'utf8'))
    const es = (g && g.app_state && g.app_state.mlcoin && g.app_state.mlcoin.emission_state) || null
    return es ? shapedEmission(es, 'genesis') : null
  } catch {
    return null
  }
}

async function readEmissionState() {
  try {
    const resp = await axios.get(chainRest(EMISSION_STATE_PATH), { timeout: 5000 })
    const data = resp.data || {}
    const es = data.emission_state || data.emissionState || null
    if (!es) return null
    return shapedEmission(es, null)
  } catch {
    return emissionFromGenesis()
  }
}

async function getTotalSupply(req, res) {
  const shaped = await readEmissionState()
  if (!shaped) return res.status(502).json({ error: 'failed to fetch on-chain emission_state' })
  return res.json({ total_supply: shaped })
}

/**
 * `GET /api/market/cap` — what the MLCNS in circulation is worth at the
 * on-chain price, which is the one number the price card could not state
 * honestly until now (it had a unit price and no supply figure to multiply).
 *
 * Both halves come from the chain in the same request: circulating supply
 * from x/mlcoin's emission_state, the KES price from x/mlcoin's market price.
 * Nothing is a constant. `method` travels in the body because a market cap is
 * an interpretation, and a reader should be able to check the interpretation.
 */
async function getMarketCap(req, res) {
  try {
    const [emission, price] = await Promise.all([readEmissionState(), readChainMarketPrice()])
    if (!emission) return res.status(502).json({ error: 'failed to read on-chain emission_state' })
    if (!price) return res.status(502).json({ error: 'no market price in chain response' })
    if (!price.mid) return res.status(502).json({ error: 'on-chain market price is zero; a cap cannot be stated' })

    return res.json({
      circulatingSupply: round6(emission.circulating),
      totalSupply: round6(emission.supply),
      priceKes: round6(price.mid),
      marketCapKes: round6(emission.circulating * price.mid),
      currency: 'KES',
      asOfHeight: price.height,
      asOf: new Date().toISOString(),
      // Genesis supply is the chain's starting figures, not its current ones.
      supplyFallback: emission.fallback || null,
      method: 'circulating MLCNS (x/mlcoin emission_state) × on-chain mid price in KES (x/mlcoin market price)',
    })
  } catch (err) {
    return res.status(502).json({ error: 'failed to compute on-chain market cap', details: String(err) })
  }
}

async function getMonthlyEmissions(req, res) {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')
    const url = `${base}/tmp/marketplace/mlcoin/v1/emission_state`
    const resp = await axios.get(url, { timeout: 5000 })
    const data = resp.data || {}
    const es = data.emission_state || data.emissionState || null
    if (!es) return res.status(502).json({ error: 'no emission_state in chain response', raw: data })

    // monthly_cap is provided in base units (1e6). Return a 12-month array using the on-chain cap.
    const rawMonthly = Number(es.monthly_cap || es.monthlyCap || 0)
    const monthly = rawMonthly / 1_000_000

    const months = []
    const currentMonthOnChain = Number(es.current_month || es.currentMonth || 0)
    for (let m = 1; m <= 12; m++) {
      const has_emitted = currentMonthOnChain >= m && monthly > 0
      months.push({ month: m, supply: monthly, has_emitted })
    }

    return res.json({ months, raw_proto: es })
  } catch (err) {
    return res.status(502).json({ error: 'failed to fetch on-chain emission_state', details: String(err) })
  }
}

// Aggregate monthly breakdown by source (bought, minted from conversion, awarded)
async function getMonthlyBreakdown(req, res) {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')

    // fetch trades (buys/sells)
    const tradesUrl = `${base}/tmp/marketplace/mlcoin/v1/market/trades`
    const txUrl = `${base}/tmp/marketplace/mlcoin/v1/transactions`

    const [tradesResp, txResp] = await Promise.all([
      axios.get(tradesUrl, { timeout: 5000 }).catch(() => ({ data: {} })),
      axios.get(txUrl, { timeout: 5000 }).catch(() => ({ data: {} }))
    ])

    const trades = (tradesResp.data && tradesResp.data.trades) || []
    const txs = (txResp.data && txResp.data.transactions) || []

    const monthKey = ts => {
      if (!ts) return null
      let t = Number(ts)
      if (t < 1e12) t = t * 1000
      const d = new Date(t)
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      return `${y}-${m}`
    }

    const sumMap = (map, k, v) => { map[k] = (map[k] || 0) + (v || 0); }

    const boughtMap = {}
    const mintedTotalMap = {}
    const conversionMap = {}
    const awardedMap = {}

    // trades: count buys as 'bought'
    trades.forEach(t => {
      try {
        if ((t.trade_type || t.tradeType || '').toLowerCase() === 'buy') {
          const key = monthKey(t.timestamp || t.Timestamp)
          const amount = Number(t.mlcn_amount || t.mlcnAmount || t.mlcnAmount || t.MlcnAmount || 0) / 1_000_000
          if (key) sumMap(boughtMap, key, amount)
        }
      } catch (e) { /* non-critical enrichment — continue */ }
    })

    // transactions: inspect mints and memos
    txs.forEach(tx => {
      try {
        const txType = (tx.tx_type || tx.txType || '').toLowerCase()
        if (txType && txType.includes('mint')) {
          const key = monthKey(tx.timestamp || tx.Timestamp)
          const amount = Number(tx.amount || 0) / 1_000_000
          if (!key) return
          sumMap(mintedTotalMap, key, amount)

          const memo = (tx.memo || tx.Memo || '').toLowerCase()
          if (memo.includes('convert') || memo.includes('conversion')) {
            sumMap(conversionMap, key, amount)
          } else if (memo.includes('award') || memo.includes('reward') || memo.includes('airdrop')) {
            sumMap(awardedMap, key, amount)
          }
        }
      } catch (e) { /* non-critical enrichment — continue */ }
    })

    // build months union from seen keys (limit to last 12 months)
    const keys = new Set([...Object.keys(boughtMap), ...Object.keys(mintedTotalMap), ...Object.keys(conversionMap), ...Object.keys(awardedMap)])
    const allKeys = Array.from(keys).sort().slice(-12)

    const months = allKeys.map(k => {
      const bought = Number((boughtMap[k] || 0).toFixed(6))
      const mintedTotal = Number((mintedTotalMap[k] || 0).toFixed(6))
      const conversion = Number((conversionMap[k] || 0).toFixed(6))
      const awarded = Number((awardedMap[k] || 0).toFixed(6))

      // minted excluding buys (avoid double counting buys which produce trade + mint)
      const mintedExclBuys = Math.max(0, mintedTotal - bought)

      // anything unclassified after conversion/awarded is 'other'
      let other = mintedExclBuys - conversion - awarded
      if (other < 0) other = 0

      const total = Number((bought + conversion + awarded + other).toFixed(6))

      const pct = val => (total > 0 ? Math.round((val / total) * 10000) / 100 : 0)

      return {
        month: k,
        bought,
        minted_conversion: conversion,
        awarded,
        other,
        total,
        pct_bought: pct(bought),
        pct_minted_conversion: pct(conversion),
        pct_awarded: pct(awarded),
        pct_other: pct(other)
      }
    })

    // If we found no transaction/trade history, synthesize a simple
    // 12-month view from the on-chain `emission_state` monthly cap so
    // the frontend can show monthly caps even when no per-source data
    // has been recorded yet.
    if (!months.length) {
      try {
        const esUrl = `${base}/tmp/marketplace/mlcoin/v1/emission_state`
        const esResp = await axios.get(esUrl, { timeout: 5000 }).catch(() => ({ data: {} }))
        let es = (esResp.data && (esResp.data.emission_state || esResp.data.emissionState)) || null

        // If chain REST is not ready, fall back to local genesis file (same as getTotalSupply)
        if (!es) {
          try {
            const home = process.env.MARKETPLACED_HOME || path.join(os.homedir(), '.marketplace')
            const genesisPath = path.join(home, 'config', 'genesis.json')
            if (fs.existsSync(genesisPath)) {
              const rawGenesis = fs.readFileSync(genesisPath, 'utf8')
              const g = JSON.parse(rawGenesis)
              es = (g && g.app_state && g.app_state.mlcoin && g.app_state.mlcoin.emission_state) || null
            }
          } catch (e) {
            // ignore genesis parse errors and continue
          }
        }

        if (es) {
          const rawMonthly = Number(es.monthly_cap || es.monthlyCap || 0)
          const monthly = rawMonthly / 1_000_000

          const out = []
          const now = new Date()
          // Build last 12 months labels (oldest -> newest)
          for (let i = 11; i >= 0; i--) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
            const total = Number((monthly || 0).toFixed(6))
            const bought = 0
            const conversion = 0
            const awarded = 0
            const other = total
            const pct = val => (total > 0 ? Math.round((val / total) * 10000) / 100 : 0)
            out.push({
              month: key,
              bought,
              minted_conversion: conversion,
              awarded,
              other,
              total,
              pct_bought: pct(bought),
              pct_minted_conversion: pct(conversion),
              pct_awarded: pct(awarded),
              pct_other: pct(other)
            })
          }

          return res.json({ months: out, raw: { trades_count: trades.length, tx_count: txs.length, raw_proto: es } })
        }
      } catch (e) {
        // fall through to return empty months below
      }
    }

    return res.json({ months, raw: { trades_count: trades.length, tx_count: txs.length } })
  } catch (err) {
    return res.status(502).json({ error: 'failed to compute monthly breakdown', details: String(err) })
  }
}

module.exports = {
  getMarketPrice,
  getMarketCap,
  getTotalSupply,
  getMonthlyEmissions,
  getMonthlyBreakdown,
  // Exported for tests and for the socket price engine, which must read the
  // same two tiers of history rather than keeping a third copy of the rules.
  _internals: {
    priceHistory,
    readChainMarketPrice,
    readEmissionState,
    storeSample,
    aggregateBuckets,
    loadTrendSeries,
    changeForRange,
    PRICE_WINDOWS_MS,
    AGGREGATE_RANGES_MS,
    PRICE_BUCKET_MS,
  },
}

