const axios = require('axios')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'

// In-memory price history (kept as milliseconds epoch and mid price as decimal)
// This collector polls the chain REST `/tmp/marketplace/mlcoin/v1/market/price` regularly
// and stores a bounded history used by the frontend for range calculations.
const priceHistory = []
const PRICE_HISTORY_RETENTION_MS = 1000 * 60 * 60 * 24 * 31 * 6 // ~6 months
const PRICE_POLL_INTERVAL_MS = 15 * 1000

async function pollChainPriceOnce() {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')
    const url = `${base}/tmp/marketplace/mlcoin/v1/market/price`
    const resp = await axios.get(url, { timeout: 5000 })
    const data = resp.data || {}
    const mp = data.market_price || data.marketPrice || null
    if (!mp) return
    const buy = Number(mp.buy_price) / 100
    const sell = Number(mp.sell_price) / 100
    const mid = ((buy || 0) + (sell || 0)) / 2
    priceHistory.push({ ts: Date.now(), mid })
    // prune
    const cutoff = Date.now() - PRICE_HISTORY_RETENTION_MS
    while (priceHistory.length && priceHistory[0].ts < cutoff) priceHistory.shift()
  } catch (err) {
    // ignore polling errors; history remains as-is
  }
}

// start background poller
setInterval(pollChainPriceOnce, PRICE_POLL_INTERVAL_MS)
// initial fill
pollChainPriceOnce().catch(() => {})

function aggregateChangeForRange(rangeMs) {
  if (!priceHistory.length) return null
  const now = Date.now()
  const latest = priceHistory[priceHistory.length - 1]
  const cutoff = now - rangeMs
  let past = null
  for (let i = priceHistory.length - 1; i >= 0; i--) {
    if (priceHistory[i].ts <= cutoff) { past = priceHistory[i]; break }
  }
  if (!past) past = priceHistory[0]
  if (!past || past.mid === 0) return null
  const pct = ((latest.mid - past.mid) / past.mid) * 100
  return { pct, latest: latest.mid, past: past.mid }
}

async function getMarketPrice(req, res) {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')
    const url = `${base}/tmp/marketplace/mlcoin/v1/market/price`
    const resp = await axios.get(url, { timeout: 5000 })
    const data = resp.data || {}
    const mp = data.market_price || data.marketPrice || null
    if (!mp) return res.status(502).json({ error: 'no market price in chain response', raw: data })

    // buy_price and sell_price are integers scaled by 100 in chain proto
    const buy = Number(mp.buy_price) / 100
    const sell = Number(mp.sell_price) / 100

    const latestMid = ((buy || 0) + (sell || 0)) / 2

    // keep in-memory history fresh: append if the poller hasn't yet recorded this sample
    const now = Date.now()
    const last = priceHistory.length ? priceHistory[priceHistory.length - 1] : null
    if (!last || (now - last.ts) > Math.max(5000, PRICE_POLL_INTERVAL_MS - 1000)) {
      priceHistory.push({ ts: now, mid: latestMid })
      // prune if necessary
      const cutoff = Date.now() - PRICE_HISTORY_RETENTION_MS
      while (priceHistory.length && priceHistory[0].ts < cutoff) priceHistory.shift()
    }

    // return a bounded recent history and aggregated percent changes for common ranges
    const recent = priceHistory.slice(-500) // last up to 500 samples
    const ranges = {
      '5m': 5 * 60 * 1000,
      '10m': 10 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '15d': 15 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '5M': 5 * 30 * 24 * 60 * 60 * 1000
    }
    const aggregates = {}
    Object.keys(ranges).forEach(k => {
      const agg = aggregateChangeForRange(ranges[k])
      aggregates[k] = agg
    })

    return res.json({ market_price: { buy_price: buy, sell_price: sell, mid: latestMid, last_update_height: mp.last_update_height || null, raw: mp }, history: recent, aggregates })
  } catch (err) {
    return res.status(502).json({ error: 'failed to fetch on-chain market price', details: String(err) })
  }
}

async function getTotalSupply(req, res) {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')
    const url = `${base}/tmp/marketplace/mlcoin/v1/emission_state`
    const resp = await axios.get(url, { timeout: 5000 })
    const data = resp.data || {}
    const es = data.emission_state || data.emissionState || null
    if (!es) return res.status(502).json({ error: 'no emission_state in chain response', raw: data })

    // total_supply is an integer (uint64). On-chain value is in base units
    // (scaled by 1e6). Convert to human-readable Mallcoins by dividing by 1_000_000.
    const raw = Number(es.total_supply || es.totalSupply || 0)
    const supply = raw / 1_000_000

    // circulating is also provided as a uint64 string in the proto; scale the same way
    const rawCirculating = Number(es.circulating || es.circulating_supply || 0)
    const circulating = rawCirculating / 1_000_000

    return res.json({ total_supply: { raw: raw, supply: supply, circulating_raw: rawCirculating, circulating: circulating, raw_proto: es } })
  } catch (err) {
    // Fallback: if chain REST is unreachable, try reading local genesis
    try {
      const home = process.env.MARKETPLACED_HOME || path.join(os.homedir(), '.marketplace')
      const genesisPath = path.join(home, 'config', 'genesis.json')
      if (fs.existsSync(genesisPath)) {
        const rawGenesis = fs.readFileSync(genesisPath, 'utf8')
        const g = JSON.parse(rawGenesis)
        const es = (g && g.app_state && g.app_state.mlcoin && g.app_state.mlcoin.emission_state) || null
        if (es) {
          const raw = Number(es.total_supply || es.totalSupply || 0)
          const supply = raw / 1_000_000
          const rawCirculating = Number(es.circulating || es.circulating_supply || 0)
          const circulating = rawCirculating / 1_000_000
          return res.json({ total_supply: { raw: raw, supply: supply, circulating_raw: rawCirculating, circulating: circulating, raw_proto: es, fallback: 'genesis' } })
        }
      }
    } catch (e) {
      // ignore genesis parsing errors and fall through to return original error
    }
    return res.status(502).json({ error: 'failed to fetch on-chain emission_state', details: String(err) })
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
      } catch (e) {}
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
      } catch (e) {}
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

module.exports = { getMarketPrice, getTotalSupply, getMonthlyEmissions, getMonthlyBreakdown }

