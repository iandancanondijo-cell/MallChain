/**
 * Input validation schemas for blockchain API
 * Uses Joi for robust validation
 */

/* eslint-env node */
/* global require, module */

const Joi = require('joi')

/**
 * Address validation
 * Supports cosmos, mall, and tmp prefixes
 */
const addressSchema = Joi.string()
  .required()
  .pattern(/^(cosmos|mall|tmp)[a-z0-9]{38,}$/)
  .messages({
    'string.pattern.base': 'Invalid blockchain address format. Expected bech32 format (cosmos..., mall..., or tmp...).',
    'any.required': 'Address is required',
  })

/**
 * Amount validation
 * Positive number with optional decimal places
 */
const amountSchema = Joi.number()
  .positive()
  .required()
  .messages({
    'number.positive': 'Amount must be a positive number',
    'any.required': 'Amount is required',
  })

/**
 * Transaction hash validation
 */
const txHashSchema = Joi.string()
  .hex()
  .length(64)
  .required()
  .messages({
    'string.hex': 'Transaction hash must be hexadecimal',
    'string.length': 'Transaction hash must be 64 characters',
    'any.required': 'Transaction hash is required',
  })

/**
 * Memo validation
 */
const memoSchema = Joi.string().max(256).optional()

/**
 * Quote ID validation
 */
const quoteIdSchema = Joi.string().required().messages({
  'any.required': 'Quote ID is required',
})

/**
 * Signature validation
 */
const signatureSchema = Joi.string()
  .hex()
  .required()
  .messages({
    'string.hex': 'Signature must be hexadecimal',
    'any.required': 'Signature is required',
  })

/**
 * Gas price validation
 */
const gasPriceSchema = Joi.number()
  .positive()
  .max(10000) // Prevent runaway gas prices
  .optional()

/**
 * SEND TRANSACTION SCHEMA
 * Validates: POST /api/send
 */
const sendSchema = Joi.object({
  toAddress: addressSchema,
  amount: amountSchema,
  denom: Joi.string().default('umlcn'),
  memo: memoSchema,
  walletAddress: addressSchema,
  // For client-signed transactions
  signature: signatureSchema.optional(),
  publicKey: Joi.string().optional(),
  // Gas parameters
  gas: Joi.number().positive().optional(),
  gasPrice: gasPriceSchema,
}).required()

const sendMallcoinsSchema = Joi.object({
  from: addressSchema,
  to: addressSchema,
  amount: amountSchema,
  txBytes: Joi.string().required().messages({
    'any.required': 'Signed transaction bytes (txBytes) are required',
    'string.base': 'txBytes must be provided as a base64 string',
  }),
}).required()

const processPaymentSchema = Joi.object({
  buyerAddress: addressSchema,
  sellerAddress: addressSchema,
  amountKES: amountSchema,
  txBytes: Joi.string().required().messages({
    'any.required': 'Signed transaction bytes (txBytes) are required',
    'string.base': 'txBytes must be provided as a base64 string',
  }),
  description: memoSchema,
}).required()

const sellSchema = Joi.object({
  sellerAddress: addressSchema,
  amount: amountSchema,
  txBytes: Joi.string().required().messages({
    'any.required': 'Signed transaction bytes (txBytes) are required',
    'string.base': 'txBytes must be provided as a base64 string',
  }),
  phone: Joi.string().optional(),
}).required()

const txHashParamSchema = Joi.object({
  txHash: txHashSchema,
}).required()

/**
 * STAKING SCHEMA
 * Validates: POST /api/staking/broadcast
 */
const stakingActionSchema = Joi.object({
  action: Joi.string()
    .valid('delegate', 'undelegate', 'redelegate', 'claim')
    .required(),
  delegatorAddress: addressSchema,
  validatorAddress: addressSchema.optional(), // Required for delegate, undelegate, redelegate
  amount: amountSchema.optional(), // Required for delegate, undelegate, redelegate
  denom: Joi.string().default('umlcn'),
  memo: memoSchema,
  gasPrice: gasPriceSchema,
}).required()

/**
 * GOVERNANCE VOTE SCHEMA
 * Validates: POST /api/governance/vote
 */
const governanceVoteSchema = Joi.object({
  proposalId: Joi.number().positive().required(),
  voterAddress: addressSchema,
  option: Joi.string()
    .valid('VOTE_OPTION_YES', 'VOTE_OPTION_NO', 'VOTE_OPTION_ABSTAIN')
    .required(),
  memo: memoSchema,
  gasPrice: gasPriceSchema,
}).required()

/**
 * LIQUIDITY SCHEMA
 * Validates: POST /api/liquidity/add, /api/liquidity/remove
 */
const liquiditySchema = Joi.object({
  poolId: Joi.string().required(),
  userAddress: addressSchema,
  amount0: amountSchema.optional(), // For add liquidity
  amount1: amountSchema.optional(), // For add liquidity
  lpTokens: amountSchema.optional(), // For remove liquidity
  gasPrice: gasPriceSchema,
}).required()

/**
 * BUY TRANSACTION SCHEMA
 * Validates: POST /api/buy/quote
 */
const buyQuoteSchema = Joi.object({
  walletAddress: addressSchema,
  amount: amountSchema, // Fiat amount in KES
  paymentMethod: Joi.string().valid('mpesa', 'card').required(),
  memo: memoSchema,
}).required()

/**
 * BUY CREDIT SCHEMA
 * Validates: POST /api/buy/credit
 */
const buyCreditSchema = Joi.object({
  quoteId: Joi.string().optional(),
  walletAddress: addressSchema,
  amount: amountSchema.when('quoteId', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required().messages({
      'any.required': 'Amount is required when no quoteId is provided',
    }),
  }),
  idempotencyKey: Joi.string().optional().max(128).messages({
    'string.max': 'Idempotency key must not exceed 128 characters',
  }),
}).required()

/**
 * WALLET CONNECTION SCHEMA
 * Validates: POST /api/wallet-connection/connect
 */
const walletConnectionSchema = Joi.object({
  mnemonicOrKey: Joi.string().required(),
  addressPrefix: Joi.string().valid('cosmos', 'mall', 'tmp').optional(),
  password: Joi.string().optional(),
}).required()

/**
 * Validation helper
 * Returns object with { error, value } like Joi
 */
function validate(data, schema) {
  return schema.validate(data, {
    abortEarly: false,
    stripUnknown: false,
  })
}

/**
 * Middleware to validate request body
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = validate(req.body, schema)

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }))
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST_FORMAT',
          message: 'Request validation failed',
          details,
        },
      })
    }

    req.validatedBody = value
    next()
  }
}

/**
 * Middleware to validate query params
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = validate(req.query, schema)

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }))
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST_FORMAT',
          message: 'Query validation failed',
          details,
        },
      })
    }

    req.validatedQuery = value
    next()
  }
}

module.exports = {
  addressSchema,
  amountSchema,
  txHashSchema,
  memoSchema,
  quoteIdSchema,
  signatureSchema,
  gasPriceSchema,
  sendSchema,
  sendMallcoinsSchema,
  processPaymentSchema,
  txHashParamSchema,
  stakingActionSchema,
  governanceVoteSchema,
  liquiditySchema,
  buyQuoteSchema,
  walletConnectionSchema,
  sellSchema,
  validate,
  validateRequest,
  validateQuery,
}

module.exports = {
  // Schemas
  addressSchema,
  amountSchema,
  txHashSchema,
  memoSchema,
  quoteIdSchema,
  signatureSchema,
  gasPriceSchema,

  // Composite schemas
  sendSchema,
  stakingActionSchema,
  governanceVoteSchema,
  liquiditySchema,
  buyQuoteSchema,
  buyCreditSchema,
  walletConnectionSchema,
  sellSchema,

  // Helpers
  validate,
  validateRequest,
  validateQuery,
}
