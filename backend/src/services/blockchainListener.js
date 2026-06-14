const axios = require('axios')
const Transaction = require('../models/transaction')
const logger = require('../utils/logger')
const { createBlockchainBackoff } = require('../utils/circuitBreaker')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.CHAIN_REST || 'http://localhost:1317'
const POLL_INTERVAL_MS = Number(process.env.BLOCKCHAIN_LISTENER_INTERVAL_MS || 3000)
const backoff = createBlockchainBackoff()

function chainUrl(path) {
  return `${CHAIN_REST.replace(/\/$/, '')}${path}`
}

async function fetchTransactionFromChain(txHash) {
  return await backoff.execute(async () => {
    const response = await axios.get(chainUrl(`/cosmos/tx/v1beta1/txs/${txHash}`), {
      timeout: 10000,
    })
    return response.data
  }, `fetchTransaction:${txHash}`)
}

async function reconcilePendingTransactions() {
  try {
    const pendingTxs = await Transaction.find({
      status: { $in: ['pending', 'broadcasting'] },
      txHash: { $ne: null },
    })

    if (!pendingTxs.length) {
      return
    }

    logger.info('blockchainListener', 'Reconciling pending transactions', { count: pendingTxs.length })

    await Promise.all(pendingTxs.map(async (tx) => {
      try {
        const data = await fetchTransactionFromChain(tx.txHash)
        const txResponse = data.tx_response || data

        if (!txResponse || txResponse.code === undefined) {
          logger.debug('blockchainListener', 'Transaction still unavailable on chain', { txHash: tx.txHash })
          return
        }

        tx.blockHeight = Number(txResponse.height || tx.blockHeight || 0)
        tx.status = txResponse.code === 0 ? 'confirmed' : 'failed'
        if (txResponse.raw_log) tx.error = txResponse.raw_log
        await tx.save()

        logger.info('blockchainListener', 'Pending transaction updated', {
          txHash: tx.txHash,
          status: tx.status,
          blockHeight: tx.blockHeight,
        })

        if (global.io) {
          global.io.emit('tx:update', {
            transactionId: tx._id,
            status: tx.status,
            txHash: tx.txHash,
            height: tx.blockHeight,
          })
        }
      } catch (err) {
        logger.warn('blockchainListener', 'Failed to reconcile pending transaction', err, {
          txHash: tx.txHash,
        })
      }
    }))
  } catch (err) {
    logger.error('blockchainListener', 'Blockchain listener failed', err)
  }
}

function startBlockchainListener() {
  logger.info('blockchainListener', 'Started transaction listener', { intervalMs: POLL_INTERVAL_MS })
  setInterval(reconcilePendingTransactions, POLL_INTERVAL_MS)
}

module.exports = {
  startBlockchainListener,
}
