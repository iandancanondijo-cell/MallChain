/* eslint-env node */
/* global require, module, process */
const axios = require('axios')
const { addLiquidityOnChain, toBaseUnits, getAddressFromMnemonic } = require('../services/dexTxBuilder')
const { Console } = require('console')
const { stdout, stderr } = require('process')
const console = new Console(stdout, stderr)

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'
const POOL_TOKEN0_DENOM = process.env.POOL_TOKEN0_DENOM || 'umlcn'
const POOL_TOKEN1_DENOM = process.env.POOL_TOKEN1_DENOM || 'umal'
const POOL_TOKEN0_DECIMALS = Number(process.env.POOL_TOKEN0_DECIMALS || 6)
const POOL_TOKEN1_DECIMALS = Number(process.env.POOL_TOKEN1_DECIMALS || 6)
const CACHE_DURATION = Number(process.env.LIQ_CACHE_MS || 30000)
const POOL_ACCOUNT_ADDRESS = process.env.POOL_ACCOUNT_ADDRESS || ''
const LIQ_DEFAULT_APY = Number(process.env.LIQ_DEFAULT_APY || 0)
const LIQ_DEFAULT_FEE = Number(process.env.LIQ_DEFAULT_FEE || 0.3)

// In-memory liquidity pools storage
let pools = []
let poolsCache = null
let poolsCacheTime = 0

// Helper: normalize and validate numeric inputs
function asAmount(value, field) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${field}: must be a positive numeric value`)
  }
  return n
}

// Parse on-chain string amounts into display units (defaults to micro → base)
function parseAmount(amount, decimals) {
  const num = Number(amount || 0)
  if (!Number.isFinite(num) || num < 0) return 0
  const factor = Math.pow(10, decimals || 0)
  return factor ? num / factor : num
}

// Fetch 24h trade volume from chain trade history
async function fetchTradeVolume24h(base) {
  try {
    const cleanBase = base.replace(/\/$/, '')
    const url = `${cleanBase}/tmp/marketplace/mlcoin/v1/market/trades`
    const resp = await axios.get(url, { timeout: 6000 })
    const trades = resp.data?.trades || resp.data?.trade || []
    const nowSec = Date.now() / 1000
    const dayAgo = nowSec - 86400

    return trades
      .filter(t => Number(t.timestamp || 0) >= dayAgo)
      .reduce((sum, t) => {
        const price = Number(t.price || 0) / 100 // price scaled by 100 per proto comment
        const mlcnAmt = Number(t.mlcn_amount || t.mlcnAmount || 0)
        const kesAmt = Number(t.kes_amount || t.kesAmount || 0)
        const valueKes = kesAmt || (mlcnAmt * price)
        return sum + (Number.isFinite(valueKes) ? valueKes : 0)
      }, 0)
  } catch (err) {
    console.error('[Liquidity] Trade history fetch failed:', err.message)
    return 0
  }
}

// Fetch pool reserves from a designated pool account (bank balances)
async function fetchPoolReserves(base, poolAddress, denom0, denom1, dec0, dec1) {
  if (!poolAddress) return { reserve0: 0, reserve1: 0 }
  try {
    const cleanBase = base.replace(/\/$/, '')
    const url = `${cleanBase}/cosmos/bank/v1beta1/balances/${poolAddress}`
    const resp = await axios.get(url, { timeout: 6000 })
    const balances = resp.data?.balances || []

    const findAmount = (denom, decimals) => {
      const entry = balances.find(b => b.denom === denom)
      return parseAmount(entry?.amount, decimals)
    }

    return {
      reserve0: findAmount(denom0, dec0),
      reserve1: findAmount(denom1, dec1)
    }
  } catch (err) {
    console.error('[Liquidity] Pool balance fetch failed:', err.message)
    return { reserve0: 0, reserve1: 0 }
  }
}

// Helper: ensure we have an in-memory pool snapshot
async function ensurePoolsLoaded() {
  if (pools && pools.length) return pools
  const fresh = await fetchPoolsFromBlockchain()
  pools = fresh
  poolsCache = fresh
  poolsCacheTime = Date.now()
  return pools
}

// Fetch market prices from blockchain
async function fetchMarketPrices() {
  try {
    const base = CHAIN_REST.replace(/\/$/, '')
    const url = `${base}/tmp/marketplace/mlcoin/v1/market/price`
    const resp = await axios.get(url, { timeout: 5000 })
    const data = resp.data || {}
    const mp = data.market_price || data.marketPrice || {}
    
    const priceMlcn = (Number(mp.buy_price) + Number(mp.sell_price)) / 200 // Average of buy/sell, convert from cents
    const priceKes = 1.0 // KES is typically base unit
    
    return { priceMlcn, priceKes }
  } catch (err) {
    console.error('Failed to fetch market prices:', err.message)
    // Fallback prices
    return { priceMlcn: 0.6, priceKes: 1.0 }
  }
}

// Calculate TVL: (reserve0 * price_MLCN) + (reserve1 * price_KES)
function calculateTVL(reserve0, reserve1, priceMlcn, priceKes) {
  const reserve0Usd = reserve0 * priceMlcn
  const reserve1Usd = reserve1 * priceKes
  return reserve0Usd + reserve1Usd
}

// Fetch pools from blockchain REST API
async function fetchPoolsFromBlockchain() {
  try {
    const cleanBase = CHAIN_REST.replace(/\/$/, '')

    // Fetch dynamic inputs from chain
    const [prices, reserves, volume24h] = await Promise.all([
      fetchMarketPrices(),
      fetchPoolReserves(cleanBase, POOL_ACCOUNT_ADDRESS, POOL_TOKEN0_DENOM, POOL_TOKEN1_DENOM, POOL_TOKEN0_DECIMALS, POOL_TOKEN1_DECIMALS),
      fetchTradeVolume24h(cleanBase)
    ])

    const priceMlcn = prices.priceMlcn
    const priceKes = prices.priceKes

    console.log(`[Liquidity] Prices - MLCN: ${priceMlcn}, KES: ${priceKes}`)
    console.log(`[Liquidity] Reserves - ${POOL_TOKEN0_DENOM}: ${reserves.reserve0}, ${POOL_TOKEN1_DENOM}: ${reserves.reserve1}`)

    // Calculate TVL dynamically
    const tvl = calculateTVL(reserves.reserve0, reserves.reserve1, priceMlcn, priceKes)
    console.log(`[Liquidity] Calculated TVL: ${tvl}`)

    const kesPool = {
      id: 2,
      name: 'MLCN/KES',
      token0: 'MLCN',
      token1: 'KES',
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
      tvl: Math.round(tvl),
      apy: LIQ_DEFAULT_APY,              // configurable until chain source exists
      volume24h: Math.round(volume24h || 0),
      fee: LIQ_DEFAULT_FEE,
      totalLiquidity: reserves.reserve0 + reserves.reserve1,
      userPositions: {},
      priceMlcn,
      priceKes,
      blockchainSource: true,
      fetchedAt: new Date().toISOString()
    }

    return [kesPool]
  } catch (err) {
    console.error('[Liquidity] Fallback calculation:', err.message)
    const reserve0 = 0
    const reserve1 = 0
    const priceMlcn = 0
    const priceKes = 1.0
    const tvl = 0
    const volume24h = 0

    return [{
      id: 2,
      name: 'MLCN/KES',
      token0: 'MLCN',
      token1: 'KES',
      reserve0,
      reserve1,
      tvl,
      apy: 0,
      volume24h,
      fee: 0.3,
      totalLiquidity: 0,
      userPositions: {},
      priceMlcn,
      priceKes,
      blockchainSource: false,
      source: 'calculated-fallback'
    }]
  }
}

// Get all pools
async function getAllPools(req, res) {
  try {
    const now = Date.now()
    
    // Use cache if available and not expired
    if (poolsCache && (now - poolsCacheTime) < CACHE_DURATION) {
      return res.json({ pools: poolsCache, cached: true, source: 'cache', version: 'v2-calculated' })
    }
    
    // Fetch fresh data from blockchain
    const freshPools = await fetchPoolsFromBlockchain()
    pools = freshPools
    poolsCache = freshPools
    poolsCacheTime = now

    return res.json({ pools: freshPools, cached: false, source: 'blockchain', version: 'v2-calculated' })
  } catch (err) {
    console.error('Liquidity controller error:', err)
    return res.status(500).json({ error: 'Failed to fetch pools', details: String(err) })
  }
}

// Get pool by ID
async function getPool(req, res) {
  try {
    const { poolId } = req.params
    await ensurePoolsLoaded()
    const pool = pools.find(p => p.id === Number(poolId))
    
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' })
    }
    
    return res.json({ pool })
  } catch (err) {
    console.error('Liquidity controller error:', err)
    return res.status(500).json({ error: 'Failed to fetch pool', details: String(err) })
  }
}

async function addLiquidityToPool({ poolId, amount0, amount1, userAddress }) {
  if (!poolId) throw new Error('Missing required field: poolId')
  if (!userAddress) throw new Error('Missing required field: userAddress')

  await ensurePoolsLoaded()
  const pool = pools.find(p => p.id === Number(poolId))
  if (!pool) throw new Error('Pool not found')

  if (amount0 === undefined || amount1 === undefined) {
    throw new Error('Both amount0 and amount1 are required to add liquidity')
  }

  const a0 = asAmount(amount0, 'amount0')
  const a1 = asAmount(amount1, 'amount1')

  const operatorMnemonic = process.env.OPERATOR_MNEMONIC
  if (!operatorMnemonic) {
    throw new Error('Missing OPERATOR_MNEMONIC for on-chain liquidity additions')
  }

  const providerAddress = await getAddressFromMnemonic(operatorMnemonic)
  const tokenAAmount = toBaseUnits(a0, POOL_TOKEN0_DECIMALS)
  const tokenBAmount = toBaseUnits(a1, POOL_TOKEN1_DECIMALS)

  const txResult = await addLiquidityOnChain({
    mnemonic: operatorMnemonic,
    providerAddress,
    poolId,
    tokenA: {
      denom: POOL_TOKEN0_DENOM,
      amount: tokenAAmount,
    },
    tokenB: {
      denom: POOL_TOKEN1_DENOM,
      amount: tokenBAmount,
    },
    memo: `add liquidity pool ${pool.name} for ${userAddress}`,
  })

  const lpTokens = Math.sqrt(a0 * a1)

  pool.reserve0 += a0
  pool.reserve1 += a1
  pool.totalLiquidity += lpTokens
  pool.userPositions = pool.userPositions || {}
  pool.userPositions[userAddress] = (pool.userPositions[userAddress] || 0) + lpTokens

  const poolTokenPrice = pool.priceMlcn || 0.6
  pool.tvl = Math.round((pool.reserve0 * poolTokenPrice) + pool.reserve1)

  const shareOfPool = pool.totalLiquidity > 0
    ? ((pool.userPositions[userAddress] / pool.totalLiquidity) * 100)
    : 0

  return {
    success: true,
    message: `Liquidity added on-chain to ${pool.name}`,
    pool,
    lpTokens: lpTokens.toFixed(6),
    txHash: txResult.txHash,
    height: txResult.height,
    events: txResult.events,
    userPosition: pool.userPositions[userAddress].toFixed(6),
    shareOfPool: shareOfPool.toFixed(2),
  }
}

// Add liquidity via API
async function addLiquidity(req, res) {
  try {
    const { poolId, amount0, amount1, slippage, userAddress } = req.body || {}

    if (!poolId) return res.status(400).json({ error: 'Missing required field: poolId' })
    if (!userAddress) return res.status(400).json({ error: 'Missing required field: userAddress' })
    if (amount0 === undefined || amount1 === undefined) {
      return res.status(400).json({ error: 'Missing required fields: amount0 and amount1 are required for liquidity addition' })
    }

    const liquidity = await addLiquidityToPool({ poolId, amount0, amount1, userAddress })
    return res.json({
      success: true,
      message: liquidity.message,
      pool: liquidity.pool,
      lpTokens: liquidity.lpTokens,
      txHash: liquidity.txHash,
      userPosition: liquidity.userPosition,
      shareOfPool: liquidity.shareOfPool,
      slippage: Number(slippage || 0),
    })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add liquidity', details: String(err) })
  }
}

// Remove liquidity
async function removeLiquidity(req, res) {
  try {
    const { poolId, lpTokens, slippage, userAddress } = req.body || {}

    if (!poolId) return res.status(400).json({ error: 'Missing required field: poolId' })
    if (!userAddress) return res.status(400).json({ error: 'Missing required field: userAddress' })

    await ensurePoolsLoaded()
    const pool = pools.find(p => p.id === Number(poolId))
    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    let lp
    try {
      lp = asAmount(lpTokens, 'lpTokens')
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }

    const slip = Number(slippage || 0)
    if (Number.isNaN(slip) || slip < 0 || slip > 5) {
      return res.status(400).json({ error: 'invalid slippage (0-5 allowed)' })
    }

    const userLiquidity = pool.userPositions[userAddress] || 0
    if (userLiquidity <= 0) {
      return res.status(400).json({ error: 'No liquidity found for user' })
    }
    if (userLiquidity + 1e-8 < lp) {
      return res.status(400).json({ error: 'Insufficient liquidity to remove', available: userLiquidity })
    }

    // Calculate proportional amounts to receive
    const shareRatio = lp / pool.totalLiquidity
    const amount0 = pool.reserve0 * shareRatio
    const amount1 = pool.reserve1 * shareRatio

    // Update pool reserves
    pool.reserve0 = Math.max(0, pool.reserve0 - amount0)
    pool.reserve1 = Math.max(0, pool.reserve1 - amount1)
    pool.totalLiquidity = Math.max(0, pool.totalLiquidity - lp)
    pool.userPositions[userAddress] = Math.max(0, userLiquidity - lp)

    // Calculate new TVL
    const poolTokenPrice = pool.priceMlcn || 0.6
    pool.tvl = Math.round((pool.reserve0 * poolTokenPrice) + pool.reserve1)

    const shareOfPool = pool.totalLiquidity > 0 ? (((pool.userPositions[userAddress] || 0) / pool.totalLiquidity) * 100) : 0

    // Emit transaction to blockchain (simulated)
    const txHash = 'tx_' + Math.random().toString(36).substr(2, 16).toUpperCase()

    return res.json({
      success: true,
      message: `Successfully removed ${lp.toFixed(2)} LP tokens from ${pool.name}`,
      pool,
      amountReceived0: amount0.toFixed(6),
      amountReceived1: amount1.toFixed(6),
      txHash,
      remainingPosition: (pool.userPositions[userAddress] || 0).toFixed(6),
      shareOfPool: shareOfPool.toFixed(2),
      slippage: slip
    })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove liquidity', details: String(err) })
  }
}

// Get user liquidity position
async function getUserPosition(req, res) {
  try {
    const { poolId, userAddress } = req.query

    if (!poolId || !userAddress) {
      return res.status(400).json({ error: 'Missing required fields: poolId, userAddress' })
    }

    await ensurePoolsLoaded()
    const pool = pools.find(p => p.id === Number(poolId))
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' })
    }

    const lpTokens = pool.userPositions[userAddress] || 0
    const shareOfPool = pool.totalLiquidity > 0 ? ((lpTokens / pool.totalLiquidity) * 100) : 0
    const estimatedValue = lpTokens * (pool.priceMlcn || 0.6)

    return res.json({
      poolId,
      poolName: pool.name,
      userAddress,
      lpTokens: lpTokens.toFixed(6),
      shareOfPool: shareOfPool.toFixed(2),
      estimatedValue: estimatedValue.toFixed(2)
    })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user position', details: String(err) })
  }
}

module.exports = {
  getAllPools,
  getPool,
  addLiquidity,
  removeLiquidity,
  getUserPosition,
  addLiquidityToPool,
}
