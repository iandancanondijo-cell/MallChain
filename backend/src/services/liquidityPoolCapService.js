const logger = require('../utils/logger')

const LIQUIDITY_POOL_CAP_KES = Number(process.env.LIQUIDITY_POOL_CAP_KES) || 500000
const CACHE_TTL_MS = Number(process.env.LIQUIDITY_POOL_CACHE_TTL_MS) || 30000

let cachedPoolValueKes = null
let cachedAt = 0

async function getPoolValueKes() {
  const now = Date.now()
  if (cachedPoolValueKes !== null && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedPoolValueKes
  }

  try {
    const { getAllPools } = require('../controllers/liquidityController')
    const mockReq = {}
    const mockRes = {
      json: (data) => {
        const pools = data.pools || []
        const kesPool = pools.find(p => p.id === 2 || p.name?.includes('KES'))
        const reserve1 = kesPool?.reserve1 || 0
        cachedPoolValueKes = Number(reserve1)
        cachedAt = now
        return cachedPoolValueKes
      }
    }
    await getAllPools(mockReq, mockRes)
    return cachedPoolValueKes
  } catch (err) {
    logger.error('liquidity-cap', 'Failed to fetch pool value', { error: err.message })
    return cachedPoolValueKes || 0
  }
}

function isPoolCapReached() {
  return getPoolValueKes().then(value => value >= LIQUIDITY_POOL_CAP_KES)
}

function getPoolCapStatus() {
  return getPoolValueKes().then(value => ({
    currentKes: value,
    capKes: LIQUIDITY_POOL_CAP_KES,
    reached: value >= LIQUIDITY_POOL_CAP_KES,
    remainingKes: Math.max(0, LIQUIDITY_POOL_CAP_KES - value),
    utilizationPercent: Math.min(100, (value / LIQUIDITY_POOL_CAP_KES) * 100),
  }))
}

function invalidateCache() {
  cachedPoolValueKes = null
  cachedAt = 0
}

module.exports = {
  LIQUIDITY_POOL_CAP_KES,
  getPoolValueKes,
  isPoolCapReached,
  getPoolCapStatus,
  invalidateCache,
}
