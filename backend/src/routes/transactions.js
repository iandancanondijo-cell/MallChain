const router = require('express').Router()
const Joi = require('joi')
const Transaction = require('../models/transaction')
const { getTransactionQueue } = require('../queue/transactionQueue')
const { asyncHandler } = require('../utils/errorHandler')
const auth = require('../middleware/auth')
const { validateRequest, addressSchema, amountSchema } = require('../utils/validationSchemas')
const { createUserLimiter } = require('../middleware/rateLimiter')
const { limitPayloadSize, preventNoSQLInjection, sanitizeInputs } = require('../middleware/inputValidation')

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
  denom: Joi.string().max(128).default(process.env.CHAIN_BASE_DENOM || 'stake'),
  signedTx: Joi.string()
    .base64()
    .max(64 * 1024)
    .required()
    .messages({
      'any.required': 'signedTx is required — transactions must be signed in the wallet client',
      'string.base64': 'signedTx must be base64-encoded transaction bytes',
      'string.max': 'signedTx exceeds the maximum length',
    }),
})

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/

router.post('/send',
  auth,
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validateRequest(sendSchema),
  asyncHandler(async (req, res) => {
    const { from, to, amount, denom, signedTx } = req.validatedBody

    const transaction = await Transaction.create({
      userId: req.user._id,
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
        signedTx
      },
      { jobId: transaction._id.toString(), removeOnComplete: true }
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
    const isOwner =
      (tx.userId && tx.userId.toString() === req.user._id.toString()) ||
      (req.user.walletAddress && tx.from === req.user.walletAddress)

    // 404 rather than 403: a 403 confirms the id exists, which is the
    // enumeration this route previously allowed outright.
    if (!isPrivileged && !isOwner) {
      return res.status(404).json({
        error: 'Transaction not found'
      })
    }

    res.json(tx)
  }))

module.exports = router
