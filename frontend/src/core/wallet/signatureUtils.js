import walletUtils from './walletUtils'

/**
 * Sign and broadcast a transaction using an in-memory private key
 * Accepts either a pre-built `tx` object or fields to build a send tx.
 * @param {Object} options
 * @param {Object} [options.tx] - Prebuilt unsigned transaction
 * @param {string} [options.privateKeyHex] - Private key in hex format
 * @param {string} [options.fromAddress]
 * @param {string} [options.toAddress]
 * @param {number|string} [options.amount]
 * @param {string} [options.memo]
 * @param {number|string} [options.accountNumber]
 * @param {number|string} [options.sequence]
 * @returns {Promise<Object>} broadcast result
 */
export async function signAndBroadcastTransaction(options = {}) {
  const {
    tx,
    privateKeyHex,
    fromAddress,
    toAddress,
    amount,
    memo = '',
    accountNumber,
    sequence,
  } = options

  if (!privateKeyHex) {
    throw new Error('privateKeyHex is required')
  }

  let unsignedTx = tx

  if (!unsignedTx) {
    // Try to build a simple send tx when relevant fields are provided
    if (fromAddress && toAddress && (amount !== undefined) && accountNumber != null && sequence != null) {
      unsignedTx = walletUtils.buildSendTx({
        fromAddress,
        toAddress,
        amount,
        memo,
        accountNumber,
        sequence
      })
    } else {
      throw new Error('No transaction provided and insufficient fields to build one')
    }
  }

  // Sign the transaction using the in-memory private key
  const signedBase64 = await walletUtils.signTransaction(unsignedTx, privateKeyHex)

  // Broadcast the signed transaction
  const result = await walletUtils.broadcastTx(signedBase64)

  return result
}

export default {
  signAndBroadcastTransaction
}
