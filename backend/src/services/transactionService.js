const { getClient, simulate, signAndBroadcast, broadcastRawTxBase64, CHAIN_REST } = require('../utils/cosmosClient')
const axios = require('axios')


async function broadcastTransaction({
  from,
  to,
  amount,
  denom = process.env.CHAIN_BASE_DENOM || 'stake',
  signedTxBase64 = null,
  serverSign = false
}) {
  // If a signed transaction is supplied (frontend-signed), push raw bytes to chain via REST
  if (signedTxBase64) {
    const resp = await broadcastRawTxBase64(signedTxBase64, process.env.BROADCAST_MODE || 'BROADCAST_MODE_SYNC')
    return resp
  }

  // Server-side sign: simulate to get gas estimate, adjust fee, then signAndBroadcast
  if (serverSign) {
    const client = await getClient()

    // construct a simple MsgSend
    const sendMsg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: from,
        toAddress: to,
        amount: [{ denom, amount: amount.toString() }]
      }
    }

    // simulate to get gas
    let gasEstimate = 200000
    try {
      const sim = await simulate([sendMsg], 'simulate send')
      // simulate returns gasUsed number
      gasEstimate = Math.ceil(sim * 1.2)
    } catch (e) {
      console.warn('simulate failed, using default gas:', e.message || e)
    }

    const gasPriceStr = process.env.GAS_PRICE || '0.01stake'
    const priceParts = gasPriceStr.match(/([0-9.]+)([a-zA-Z]+)/)
    const gasPrice = priceParts ? Number(priceParts[1]) : 0.025
    const feeAmount = Math.ceil(gasEstimate * gasPrice)

    const fee = {
      amount: [{ denom, amount: feeAmount.toString() }],
      gas: gasEstimate.toString()
    }

    // Use Redis lock to avoid sequence collisions when the operator wallet signs
    const { acquireLock, releaseLock } = require('../utils/redisLock')
    let lock
    try {
      lock = await acquireLock('signer:lock', Number(process.env.SIGNER_LOCK_TTL_MS || 5000), Number(process.env.SIGNER_LOCK_TIMEOUT_MS || 15000))
      const result = await signAndBroadcast([sendMsg], fee, 'Mallcoin Transfer')
      await releaseLock(lock)
      return result
    } catch (e) {
      if (lock) await releaseLock(lock)
      throw e
    }
  }

  // Fallback: only allow raw signed transactions if server signing is unavailable.
  if (!signedTxBase64) {
    throw new Error('Missing signed transaction or server signing is not configured')
  }

  const result = await broadcastRawTxBase64(signedTxBase64, process.env.BROADCAST_MODE || 'BROADCAST_MODE_SYNC')
  return result
}

module.exports = {
  broadcastTransaction
}
