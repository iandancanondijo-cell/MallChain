const router = require('express').Router()
const Joi = require('joi')
const crypto = require('crypto')
const { bech32 } = require('bech32')
const Transaction = require('../models/transaction')
const { getTransactionQueue } = require('../mallwallet/queue/transactionQueue')
const { asyncHandler } = require('../utils/errorHandler')
const requireAuth = require('../middleware/requireAuth')
const { validateRequest, addressSchema, amountSchema } = require('../utils/validationSchemas')
const { createUserLimiter } = require('../middleware/rateLimiter')
const { decryptField } = require('../utils/fieldEncryption')

const auth = requireAuth()

const financialLimiter = createUserLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'rate_limit_exceeded', message: 'Too many financial operations. Please try again later.' }
})

// signedTx is mandatory. This route used to accept an unsigned {from,to,amount}
// and fall back to signing MsgSend with the operator key, which let anyone who
// could name the (public, on-chain-observable) operator address get the server
// to move system funds. Server-side signing of user transfers is removed;
// see sendController.sendMallcoins, which enforces the same txBytes rule.
const sendSchema = Joi.object({
  from: addressSchema,
  to: addressSchema,
  amount: amountSchema,
  denom: Joi.string().valid('mlcoin', 'umal').default('mlcoin'),
  signedTx: Joi.string()
    .base64()
    .max(64 * 1024)
    .required()
    .messages({
      'any.required': 'signedTx is required — transactions must be signed in the wallet client',
      'string.base64': 'signedTx must be base64-encoded transaction bytes',
      'string.max': 'signedTx exceeds the maximum length',
    }),
  // Optional, and only used to prove the queued record describes the account
  // the signed bytes actually came from. Joi rejects unknown keys by default,
  // so they have to be declared for the check below to have anything to read.
  //
  // addressSchema carries .required() because every other consumer of it
  // (from/to/buyerAddress) is mandatory. Reusing it here verbatim made
  // signerAddress mandatory too, which rejected the documented client-signed
  // happy path — a wallet that sends only signedTx — with
  // "Address is required". .optional() returns a copy, so the shared schema
  // keeps its requiredness everywhere else.
  signerPubKey: Joi.string().base64().max(128),
  signerAddress: addressSchema.optional(),
})

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/

function pubkeyToAddress(pubkeyBase64, prefix = process.env.CHAIN_PREFIX || process.env.COSMOS_PREFIX || 'mall') {
  // pubkeyBase64 expected to be base64-encoded raw secp256k1 compressed pubkey (33 bytes)
  const pub = Buffer.from(pubkeyBase64, 'base64')
  const sha = crypto.createHash('sha256').update(pub).digest()
  const rip = crypto.createHash('ripemd160').update(sha).digest()
  const words = bech32.toWords(rip)
  return bech32.encode(prefix, words)
}

router.post('/send',
  auth,
  financialLimiter,
  validateRequest(sendSchema),
  asyncHandler(async (req, res) => {
    const { from, to, amount, denom, signedTx, signerPubKey, signerAddress } = req.validatedBody

    // The chain is the final authority on whose signature a tx carries, but
    // this row is what the ledger, the notifications and GET /:id read back.
    // Without the derivation check a caller could queue a record that names
    // somebody else as the sender.
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

    const transaction = await Transaction.create({
      // The worker's notifications resolve the sender from tx.userId;
      // omitting it here made every emit on this path a silent no-op.
      userId: req.user._id || req.user.id,
      from,
      to,
      amount: String(amount),
      denom,
      status: 'queued'
    })

    await getTransactionQueue().add(
      'broadcast',
      {
        transactionId: transaction._id,
        from,
        to,
        amount,
        denom,
        // Always present — sendSchema made it required, and the worker has no
        // server-signing branch to fall back to.
        signedTx
      },
      {
        jobId: transaction._id.toString(),
        removeOnComplete: true,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 }
      }
    )

    res.json({
      success: true,
      transactionId: transaction._id,
      status: transaction.status
    })
  }))

router.get('/:id',
  auth,
  asyncHandler(async (req, res) => {
    if (!OBJECT_ID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid transaction id' })
    }

    const tx = await Transaction.findById(req.params.id)

    if (!tx) {
      return res.status(404).json({
        error: 'Transaction not found'
      })
    }

    const isPrivileged = req.user.role === 'admin' || req.user.role === 'superadmin'
    // Either side of the transfer counts as owning it, not just the sender:
    // GET /api/transactions/:id is how the wallet opens an incoming-transfer
    // row, and the receiver is the only person who should be able to read it.
    //
    // walletAddress is stored encrypted (models/user.js ENCRYPTED_FIELDS) and
    // req.user is that raw document or its auth-cache copy, so it has to be
    // decrypted before it can meet a plain bech32 address. decryptField
    // returns un-prefixed values unchanged, so pre-encryption rows still work.
    const myAddress = req.user.walletAddress ? decryptField(req.user.walletAddress) : null
    const isOwner =
      (tx.userId && tx.userId.toString() === req.user._id.toString()) ||
      (!!myAddress && (tx.from === myAddress || tx.to === myAddress))

    // 404 rather than 403: a 403 confirms the id exists, which is the
    // enumeration this route previously allowed outright.
    if (!isPrivileged && !isOwner) {
      return res.status(404).json({
        error: 'Transaction not found'
      })
    }

    // The record is returned flat (no `ok` envelope) because every other read
    // on this router is, but `id` is added next to `_id` rather than being
    // left for clients to rediscover: this is a Mongo document serialised
    // straight out of Mongoose, so its identifier arrived as `_id` and any
    // caller following the documented contract (`transaction.id`) got an empty
    // string — frontend-v14-integration-handoff §9.1. `_id` stays for the
    // callers that were already reading it; both are the same string, and a
    // client should never have to try one then the other.
    const json = typeof tx.toJSON === 'function' ? tx.toJSON({ virtuals: true, getters: true }) : tx
    return res.json({ ...json, id: String(json.id || tx._id) })
  }))

module.exports = router
