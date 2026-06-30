const express = require('express')
const router = express.Router()
const axios = require('axios')

const CHAIN_REST = process.env.CHAIN_REST || 'http://localhost:1317'
const TOTAL_SUPPLY = 670000000

// Correct wallet addresses from wallet_data/new_wallets.json (mall prefix)
const WALLET_ADDRESSES = {
  founder: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
  afa: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
  orthopharm: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f',
  team: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5'
}

const PHASE_MONTHS = 36
const INITIAL_MONTHLY = 3000000
const TOTAL_AVAILABLE = 415500000
const LAUNCH_YEAR = 2026
const LAUNCH_MONTH = 1

function getEmissionPhase(monthNumber) {
  if (monthNumber <= 36) return 1
  if (monthNumber <= 72) return 2
  if (monthNumber <= 108) return 3
  if (monthNumber <= 144) return 4
  return 5
}

function getMonthlyEmission(monthNumber) {
  const phase = getEmissionPhase(monthNumber)
  const phasedEmissions = [3000000, 1500000, 750000, 375000, 187500]
  return phasedEmissions[phase - 1]
}

function getCurrentMonthNumber() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const monthsSinceLaunch = (year - LAUNCH_YEAR) * 12 + (month - LAUNCH_MONTH)
  return Math.max(1, monthsSinceLaunch + 1)
}

async function fetchWalletBalances() {
  const balances = {}
  try {
    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/wallet_balance`
    const response = await axios.get(url, { timeout: 2000 })
    const walletList = response.data?.wallet_balance || []
    for (const wb of walletList) {
      const address = wb.address || wb.index
      const key = Object.entries(WALLET_ADDRESSES).find(([, addr]) => addr === address)?.[0]
      if (key) {
        const rawBalance = typeof wb.balance === 'string' ? Number(wb.balance) : wb.balance
        balances[key] = rawBalance / 1000000
      }
    }
  } catch (e) {
    for (const key of Object.keys(WALLET_ADDRESSES)) {
      balances[key] = null
    }
  }
  return balances
}

router.get('/wallets', async (req, res) => {
  try {
    const balances = await fetchWalletBalances()
    return res.json({ success: true, wallets: balances })
  } catch (e) {
    console.error('[Economy Wallets]', e.message)
    return res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/state', async (req, res) => {
  try {
    const now = new Date()
    const currentMonth = getCurrentMonthNumber()

    let onChainEmission = null
    try {
      const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/emission_state`
      const response = await axios.get(url, { timeout: 3000 })
      onChainEmission = response.data?.emission_state || response.data || null
    } catch (e) {}

    let mlcnsPriceKes = 0.62
    try {
      const priceRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`, { timeout: 2000 })
      const marketPrice = priceRes.data?.market_price || priceRes.data || {}
      const midPrice = Number(marketPrice.mid) || Number(marketPrice.midPrice) || 62
      mlcnsPriceKes = midPrice / 100
    } catch (e) {}

    const monthlyEmission = getMonthlyEmission(currentMonth)
    const dailyEmission = monthlyEmission / 30
    const emittedTotal = onChainEmission?.emitted_total ?? onChainEmission?.emittedTotal ?? 0
    const burnedTotal = onChainEmission?.burned_total ?? onChainEmission?.burnedTotal ?? 0
    const burnRateBps = onChainEmission?.burn_rate_bps ?? onChainEmission?.burnRateBps ?? 100

    const remainingInSchedule = Math.max(0, TOTAL_AVAILABLE - emittedTotal)
    const monthsRemaining = remainingInSchedule > 0 ? Math.ceil(remainingInSchedule / monthlyEmission) : 0

    let userBalances = null
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const jwt = require('jsonwebtoken')
        const decoded = jwt.decode(token)
        const address = decoded?.address

        if (address) {
          const mpRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mallpoints/v1/user_points/${address}`, { timeout: 2000 }).catch(() => ({}))
          const mallpoints = Number(mpRes.data?.user_points?.points || mpRes.data?.userPoints?.Points || 0)

          const mlRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/wallet_balance/${address}`, { timeout: 2000 }).catch(() => ({}))
          const wb = mlRes.data?.wallet_balance || mlRes.data?.WalletBalance || {}
          const mlcnsBalance = wb.balance ? Number(wb.balance) / 1000000 : 0

          userBalances = {
            address,
            mlcns: mlcnsBalance,
            mallpoints: mallpoints,
            mlcnsPriceKes,
            totalKesValue: mlcnsBalance * mlcnsPriceKes + mallpoints * 2,
            valueRatio: (2 / mlcnsPriceKes).toFixed(2)
          }
        }
      } catch (e) {}
    }

    const walletBalances = await fetchWalletBalances().catch(() => null)

    return res.json({
      success: true,
      mlcnsPriceKes,
      pointPriceKes: 2,
      emission: {
        currentMonth,
        phase: getEmissionPhase(currentMonth),
        monthlyCap: monthlyEmission,
        dailyLimit: Math.floor(dailyEmission),
        totalAvailable: TOTAL_AVAILABLE,
        totalSupply: TOTAL_SUPPLY,
        emittedTotal,
        burnedTotal,
        burnRatePercent: (burnRateBps / 100).toFixed(1),
        remainingInSchedule,
        monthsRemaining: Math.max(0, Math.floor(monthsRemaining))
      },
      schedule: {
        phaseMonths: PHASE_MONTHS,
        phases: [
          { phase: 1, months: '1-36', monthly: '3,000,000', cumulative: '108,000,000' },
          { phase: 2, months: '37-72', monthly: '1,500,000', cumulative: '162,000,000' },
          { phase: 3, months: '73-108', monthly: '750,000', cumulative: '199,500,000' },
          { phase: 4, months: '109-144', monthly: '375,000', cumulative: '218,250,000' },
          { phase: 5, months: '145+', monthly: '187,500', cumulative: '229,125,000' }
        ]
      },
      conversion: {
        badgeHolders: '15th of each month',
        nonBadge: 'December 27th only',
        rate: '1 MP = 1 MLCNS',
        valueRatio: (2 / mlcnsPriceKes).toFixed(2)
      },
      wallets: walletBalances,
      user: userBalances,
      timestamp: now.toISOString()
    })
  } catch (e) {
    console.error('[Economy State]', e.message)
    return res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/chain-state', async (req, res) => {
  try {
    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/emission_state`
    const response = await axios.get(url, { timeout: 3000 })
    return res.json({ success: true, emission_state: response.data?.emission_state || response.data })
  } catch (e) {
    return res.json({
      success: true,
      emission_state: null,
      error: 'Could not fetch on-chain state',
      fallback: {
        total_supply: TOTAL_SUPPLY,
        circulating: 415500000,
        monthly_cap: INITIAL_MONTHLY,
        burned_total: 0,
        burn_rate_bps: 100
      }
    })
  }
})

router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params
    if (!address) return res.status(400).json({ error: 'Address required' })

    const currentMonth = getCurrentMonthNumber()
    const monthlyEmission = getMonthlyEmission(currentMonth)

    let mlcnsPriceKes = 0.62
    try {
      const priceRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`, { timeout: 2000 })
      const marketPrice = priceRes.data?.market_price || priceRes.data || {}
      const midPrice = Number(marketPrice.mid) || Number(marketPrice.midPrice) || 62
      mlcnsPriceKes = midPrice / 100
    } catch (e) {}

    const mpRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mallpoints/v1/user_points/${address}`, { timeout: 3000 }).catch(() => ({}))
    const mallpoints = Number(mpRes.data?.user_points?.points || mpRes.data?.userPoints?.Points || 0)

    const mlRes = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/wallet_balance/${address}`, { timeout: 3000 }).catch(() => ({}))
    const wb = mlRes.data?.wallet_balance || mlRes.data?.WalletBalance || {}
    const mlcnsBalance = wb.balance ? Number(wb.balance) / 1000000 : 0

    return res.json({
      success: true,
      address,
      mlcns: mlcnsBalance,
      mallpoints,
      mlcnsPriceKes,
      monthlyEmissionCap: monthlyEmission,
      estimatedKesValue: mlcnsBalance * mlcnsPriceKes + mallpoints * 2,
      valueRatio: (2 / mlcnsPriceKes).toFixed(2)
    })
  } catch (e) {
    console.error('[Economy User]', e.message)
    return res.status(500).json({ success: false, error: e.message })
  }
})

module.exports = router