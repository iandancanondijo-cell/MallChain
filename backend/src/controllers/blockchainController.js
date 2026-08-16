const axios = require('axios')
const logger = require('../utils/logger')
const { AppError, ErrorCodes } = require('../utils/errorHandler')
const { createBlockchainBreaker } = require('../utils/circuitBreaker')
const { config } = require('../config')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'
const CHAIN_RPC = config.chain.rpc
const TIMEOUT_MS = 5000
const BLOCK_TIME_SAMPLE_SPAN = 20
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
  // The mlcoin module's raw feed uses its own field names (tx_id, block_height,
  // tx_type, memo) and has no concept of gasUsed/gasWanted/logs — those are
  // Cosmos SDK raw-tx-result fields that don't exist for this simplified
  // transfer log. Map to the frontend's expected shape rather than passing
  // the raw payload through, which left `tx.status` undefined and crashed
  // the Explorer's render. `status: 'success'` is honest here, not fabricated:
  // this feed only ever records completed transfers, there's no failed-tx entry.
  const transactions = (data.transactions || []).map((tx) => ({
    hash: tx.tx_id,
    height: Number(tx.block_height) || 0,
    timestamp: Number(tx.timestamp) || 0,
    status: 'success',
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    txType: tx.tx_type,
    memo: tx.memo || '',
  }))
  return res.json({ transactions, pagination: data.pagination })
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

/** Real average block interval, sampled over the last BLOCK_TIME_SAMPLE_SPAN blocks (not a hardcoded guess). */
async function fetchAverageBlockTime(latestHeight, latestTimeIso) {
  const sampleHeight = latestHeight - BLOCK_TIME_SAMPLE_SPAN
  if (sampleHeight < 1) return null
  try {
    const sampleRes = await fetchChain(`/cosmos/base/tendermint/v1beta1/blocks/${sampleHeight}`)
    const sampleTimeIso = sampleRes?.block?.header?.time
    if (!sampleTimeIso) return null
    const deltaMs = new Date(latestTimeIso).getTime() - new Date(sampleTimeIso).getTime()
    return Math.round((deltaMs / BLOCK_TIME_SAMPLE_SPAN / 1000) * 100) / 100
  } catch {
    return null
  }
}

/** Real total indexed tx count from CometBFT's tx index — not a stand-in for block height. */
async function fetchTotalIndexedTxs() {
  try {
    const { data } = await axios.get(`${CHAIN_RPC.replace(/\/$/, '')}/tx_search`, {
      params: { query: '"tx.height>0"', per_page: 1 },
      timeout: TIMEOUT_MS,
    })
    return Number(data?.result?.total_count)
  } catch {
    return null
  }
}

async function getStats(req, res) {
  logger.info('getStats', 'Fetching blockchain stats')
  try {
    const nodeRes = await fetchChain('/cosmos/base/tendermint/v1beta1/node_info')
    const blockRes = await fetchChain('/cosmos/base/tendermint/v1beta1/blocks/latest')

    const chainId = nodeRes?.default_node_info?.network || 'unknown'
    const moniker = nodeRes?.default_node_info?.moniker || 'unknown'
    const latestHeight = parseInt(blockRes?.block?.header?.height || '0', 10)
    const txCount = blockRes?.block?.data?.txs?.length || 0
    const nodeVersion = nodeRes?.default_node_info?.version || 'unknown'
    const blockTime = blockRes?.block?.header?.time || new Date().toISOString()

    const [averageBlockTime, totalTxs] = await Promise.all([
      fetchAverageBlockTime(latestHeight, blockTime),
      fetchTotalIndexedTxs(),
    ])

    return res.json({
      height: latestHeight,
      chainId,
      numTxs: txCount,
      // Real cumulative indexed-tx count (CometBFT tx_search), not block
      // height mislabeled as a tx total. null when genuinely unavailable
      // (e.g. tx indexing disabled) rather than a fabricated number.
      totalTxs,
      // Real measured interval over the last BLOCK_TIME_SAMPLE_SPAN blocks,
      // not a hardcoded "6s, typical for Cosmos SDK" guess. null if there
      // aren't enough blocks yet to sample.
      averageBlockTime,
      lastBlockHeight: latestHeight,
      nodeVersion,
      time: blockTime,
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
