const axios = require('axios')
const logger = require('../utils/logger')
const { AppError, ErrorCodes } = require('../utils/errorHandler')
const { createBlockchainBreaker } = require('../utils/circuitBreaker')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'
const TIMEOUT_MS = 5000
const blockchainBreaker = createBlockchainBreaker()

function chainUrl(path) {
  return `${CHAIN_REST.replace(/\/$/, '')}${path}`
}

async function fetchChain(path) {
  try {
    return await blockchainBreaker.execute(async () => {
      const response = await axios.get(chainUrl(path), { timeout: TIMEOUT_MS })
      return response.data
    })
  } catch (err) {
    logger.error('blockchainController.fetchChain', 'Blockchain fetch failed', err, { path })
    if (err.code === ErrorCodes.SERVICE_UNAVAILABLE || err.code === ErrorCodes.BLOCKCHAIN_UNAVAILABLE) {
      throw err
    }
    throw new AppError(
      ErrorCodes.RPC_ERROR,
      'Blockchain RPC request failed',
      503,
      { path, originalError: err.message }
    )
  }
}

async function getEmissionState(req, res) {
  const path = '/tmp/marketplace/mlcoin/v1/emission_state'
  logger.info('getEmissionState', 'Fetching emission state')
  const data = await fetchChain(path)
  return res.json(data)
}

async function getTransactions(req, res) {
  const path = '/tmp/marketplace/mlcoin/v1/transactions'
  logger.info('getTransactions', 'Fetching chain transactions')
  const data = await fetchChain(path)
  return res.json(data)
}

async function getMarketTrades(req, res) {
  const path = '/tmp/marketplace/mlcoin/v1/market/trades'
  logger.info('getMarketTrades', 'Fetching market trades')
  const data = await fetchChain(path)
  return res.json(data)
}

async function getMarketPrice(req, res) {
  const path = '/tmp/marketplace/mlcoin/v1/market/price'
  logger.info('getMarketPrice', 'Fetching market price')
  const data = await fetchChain(path)
  return res.json(data)
}

async function getStats(req, res) {
  logger.info('getStats', 'Fetching blockchain stats')
  try {
    const nodeRes = await fetchChain('/cosmos/base/tendermint/v1beta1/node_info')
    const blockRes = await fetchChain('/cosmos/base/tendermint/v1beta1/blocks/latest')

    const chainId = nodeRes?.default_node_info?.network || 'unknown'
    const moniker = nodeRes?.default_node_info?.moniker || 'unknown'
    const latestHeight = blockRes?.block?.header?.height || '0'
    const txCount = blockRes?.block?.data?.txs?.length || 0

    return res.json({
      chain: chainId,
      latestHeight,
      txCount,
      moniker,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      ErrorCodes.RPC_ERROR,
      'Failed to fetch blockchain stats',
      503,
      { originalError: err.message }
    )
  }
}

async function getHealth(req, res) {
  logger.info('getHealth', 'Checking blockchain health')
  try {
    const [nodeRes, blockRes] = await Promise.all([
      fetchChain('/cosmos/base/tendermint/v1beta1/node_info'),
      fetchChain('/cosmos/base/tendermint/v1beta1/blocks/latest'),
    ])

    const chainId = nodeRes?.default_node_info?.network || 'unknown'
    const moniker = nodeRes?.default_node_info?.moniker || 'unknown'
    const latestHeight = blockRes?.block?.header?.height || '0'
    const latestBlockTime = blockRes?.block?.header?.time || null

    return res.json({
      status: 'ok',
      chainId,
      moniker,
      latestHeight,
      latestBlockTime,
      restEndpoint: CHAIN_REST.replace(/\/$/, ''),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      ErrorCodes.BLOCKCHAIN_UNAVAILABLE,
      'Failed to fetch blockchain health',
      503,
      { originalError: err.message }
    )
  }
}

module.exports = {
  getEmissionState,
  getTransactions,
  getMarketTrades,
  getMarketPrice,
  getStats,
  getHealth,
}
