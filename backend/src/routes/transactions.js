const router = require('express').Router()
const Transaction = require('../models/transaction')
const { getTransactionQueue } = require('../queue/transactionQueue')
const crypto = require('crypto')
const bech32 = require('bech32')
const { asyncHandler } = require('../utils/errorHandler')

function pubkeyToAddress(pubkeyBase64, prefix = process.env.CHAIN_PREFIX || process.env.COSMOS_PREFIX || 'mall') {
  // pubkeyBase64 expected to be base64-encoded raw secp256k1 compressed pubkey (33 bytes)
  const pub = Buffer.from(pubkeyBase64, 'base64')
  const sha = crypto.createHash('sha256').update(pub).digest()
  const rip = crypto.createHash('ripemd160').update(sha).digest()
  const words = bech32.toWords(rip)
  return bech32.encode(prefix, words)
}


router.post('/send', asyncHandler(async (req, res) => {
    const {
      from,
      to,
      amount,
      denom
    } = req.body

    // If frontend provided a signed tx, do basic signature verification: require signerPubKey or signerAddress
    if (req.body.signedTx) {
      const signerPubKey = req.body.signerPubKey // base64
      const signerAddress = req.body.signerAddress
      if (!signerPubKey && !signerAddress) {
        return res.status(400).json({ error: 'signedTx requires signerPubKey or signerAddress for verification' })
      }
      if (signerPubKey) {
        try {
          const derived = pubkeyToAddress(signerPubKey)
          if (derived !== from && derived !== signerAddress) {
            return res.status(400).json({ error: 'signature verification failed: pubkey does not match from address' })
          }
        } catch (e) {
          return res.status(400).json({ error: 'invalid signerPubKey', detail: e.message })
        }
      }
    }

    const transaction = await Transaction.create({
      from,
      to,
      amount,
      denom,
      status: 'queued'
    })

    const jobData = {
      transactionId: transaction._id,
      from,
      to,
      amount,
      denom
    }
    if (req.body.signedTx) jobData.signedTx = req.body.signedTx
    if (req.body.serverSign) jobData.serverSign = Boolean(req.body.serverSign)

    await getTransactionQueue().add(
      'broadcast',
      {
        ...jobData
      },
      { jobId: transaction._id.toString(), removeOnComplete: true }
    )

    res.json({
      success: true,
      transactionId: transaction._id,
      status: transaction.status
    })
}))


router.get('/:id', asyncHandler(async (req, res) => {
    const tx = await Transaction.findById(req.params.id)

    if (!tx) {
      return res.status(404).json({
        error: 'Transaction not found'
      })
    }

    res.json(tx)
}))

module.exports = router
