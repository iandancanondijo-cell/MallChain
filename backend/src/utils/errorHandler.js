/**
 * Standardized error handling for blockchain API
 * Provides error codes, messages, and HTTP status codes
 */

const logger = require('./logger')
const { backendErrorsTotal } = require('./metrics')

/**
 * Error code definitions
 * Format: CATEGORY_SPECIFIC
 */
const ErrorCodes = {
  // Validation errors (400)
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_REQUEST_FORMAT: 'INVALID_REQUEST_FORMAT',

  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Resource errors (404)
  NOT_FOUND: 'NOT_FOUND',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',

  // State/business logic errors (422)
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_GAS: 'INSUFFICIENT_GAS',
  INVALID_TRANSACTION: 'INVALID_TRANSACTION',
  NONCE_MISMATCH: 'NONCE_MISMATCH',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Blockchain/RPC errors (503)
  BLOCKCHAIN_UNAVAILABLE: 'BLOCKCHAIN_UNAVAILABLE',
  RPC_TIMEOUT: 'RPC_TIMEOUT',
  RPC_ERROR: 'RPC_ERROR',
  CHAIN_UNAVAILABLE: 'CHAIN_UNAVAILABLE',

  // Database errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',
  QUERY_ERROR: 'QUERY_ERROR',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
}

/**
 * Map error codes to HTTP status codes
 */
const StatusCodeMap = {
  INVALID_ADDRESS: 400,
  INVALID_AMOUNT: 400,
  INVALID_SIGNATURE: 400,
  MISSING_REQUIRED_FIELD: 400,
  INVALID_REQUEST_FORMAT: 400,

  UNAUTHORIZED: 401,
  INSUFFICIENT_PERMISSIONS: 403,
  INVALID_TOKEN: 401,

  NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  TRANSACTION_NOT_FOUND: 404,

  INSUFFICIENT_BALANCE: 422,
  INSUFFICIENT_GAS: 422,
  INVALID_TRANSACTION: 422,
  NONCE_MISMATCH: 422,

  RATE_LIMIT_EXCEEDED: 429,

  BLOCKCHAIN_UNAVAILABLE: 503,
  RPC_TIMEOUT: 504,
  RPC_ERROR: 503,
  CHAIN_UNAVAILABLE: 503,

  DATABASE_ERROR: 500,
  QUERY_ERROR: 500,

  INTERNAL_ERROR: 500,
  UNKNOWN_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

/**
 * User-friendly error messages
 */
const MessageMap = {
  INVALID_ADDRESS: 'Invalid blockchain address format',
  INVALID_AMOUNT: 'Invalid amount. Must be a positive number.',
  INVALID_SIGNATURE: 'Invalid transaction signature',
  MISSING_REQUIRED_FIELD: 'Missing required field',
  INVALID_REQUEST_FORMAT: 'Invalid request format',

  UNAUTHORIZED: 'Authentication required',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions for this operation',
  INVALID_TOKEN: 'Invalid or expired authentication token',

  NOT_FOUND: 'Resource not found',
  ADDRESS_NOT_FOUND: 'Address not found on chain',
  TRANSACTION_NOT_FOUND: 'Transaction not found',

  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction',
  INSUFFICIENT_GAS: 'Insufficient gas to complete transaction',
  INVALID_TRANSACTION: 'Invalid transaction. Check parameters and try again.',
  NONCE_MISMATCH: 'Transaction sequence mismatch. Please retry.',

  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before retrying.',

  BLOCKCHAIN_UNAVAILABLE: 'Blockchain is currently unavailable. Please try again later.',
  RPC_TIMEOUT: 'Blockchain operation timed out. Please try again.',
  RPC_ERROR: 'Blockchain RPC error. Please try again later.',
  CHAIN_UNAVAILABLE: 'Chain is not available. Please try again later.',

  DATABASE_ERROR: 'Database error occurred. Please try again.',
  QUERY_ERROR: 'Database query failed. Please try again.',

  INTERNAL_ERROR: 'Internal server error. Please try again later.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again later.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable. Please try again later.',
}

/**
 * Structured error class
 */
class AppError extends Error {
  constructor(code, message = null, statusCode = null, data = {}) {
    super()
    this.code = code
    this.message = message || MessageMap[code] || 'Unknown error'
    this.statusCode = statusCode || StatusCodeMap[code] || 500
    this.data = data
    this.timestamp = new Date().toISOString()
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(Object.keys(this.data).length && { details: this.data }),
      },
    }
  }
}

/**
 * Global error handler middleware
 * Catches all errors and formats them consistently
 */
function errorHandler() {
  return (err, req, res, next) => {
    let error = err

    // Convert unknown errors to AppError. A generic thrown error can still
    // carry a real HTTP status (e.g. body-parser's PayloadTooLargeError sets
    // status/statusCode to 413) — preserve it instead of forcing every
    // non-AppError to 500, which would turn a legitimate 4xx into a
    // misleading 500 the moment a route not already using AppError directly
    // hits this handler.
    if (!(err instanceof AppError)) {
      const isProduction = process.env.NODE_ENV === 'production'
      error = new AppError(
        ErrorCodes.INTERNAL_ERROR,
        // A raw driver/library error message can contain connection
        // strings, file paths, or field values (e.g. a Mongo duplicate-key
        // error echoes the offending document). Never forward that to the
        // client in production — the full message still reaches the log
        // call below either way.
        isProduction ? MessageMap[ErrorCodes.INTERNAL_ERROR] || 'Internal server error' : err.message,
        err.statusCode || err.status || 500,
        isProduction ? {} : { originalError: err.message?.substring(0, 100) }
      )
    }

    // Log error
    logger.error(
      'error-handler',
      `${req.method} ${req.path} - ${error.code}`,
      error,
      {
        requestId: req.id,
        statusCode: error.statusCode,
        path: req.path,
        method: req.method,
      }
    )

    backendErrorsTotal.inc({ code: error.code, status_code: error.statusCode })

    // Send response — includes requestId (set by index.js's request-id
    // middleware) so a client-reported error can be correlated with logs.
    const body = error.toJSON()
    if (req.id) body.error.requestId = req.id
    res.status(error.statusCode).json(body)
  }
}

/**
 * Async route wrapper to catch promise rejections
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = {
  AppError,
  ErrorCodes,
  StatusCodeMap,
  MessageMap,
  errorHandler,
  asyncHandler,
}
