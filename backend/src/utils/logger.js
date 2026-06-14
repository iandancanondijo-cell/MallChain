/**
 * Structured logging utility
 * Provides consistent logging across the application
 */

const fs = require('fs')
const path = require('path')

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

class Logger {
  constructor(serviceName = 'blockchain-api') {
    this.serviceName = serviceName
    this.isDev = process.env.NODE_ENV !== 'production'
  }

  /**
   * Format log entry with timestamp and service name
   */
  format(level, context, message, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      context,
      message,
      ...data,
    }
  }

  /**
   * Write log entry
   */
  write(entry) {
    const logStr = JSON.stringify(entry)

    // Console output in development
    if (this.isDev) {
      console.log(logStr)
    }

    // File output always
    const logFile = path.join(logsDir, `${entry.level.toLowerCase()}.log`)
    fs.appendFileSync(logFile, logStr + '\n', { encoding: 'utf-8' })
  }

  /**
   * Info level logging
   * Used for normal operational events (API requests, tx sent, block indexed)
   */
  info(context, message, data = {}) {
    const entry = this.format('INFO', context, message, data)
    this.write(entry)
  }

  /**
   * Warn level logging
   * Used for potential issues (slow queries, partial failures, retries)
   */
  warn(context, message, data = {}) {
    const entry = this.format('WARN', context, message, data)
    this.write(entry)
  }

  /**
   * Error level logging
   * Used for failures (tx failed, RPC unavailable, validation error)
   */
  error(context, message, error, data = {}) {
    const entry = this.format('ERROR', context, message, {
      ...data,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack?.split('\n').slice(0, 5),
    })
    this.write(entry)
  }

  /**
   * Debug level logging
   * Used for development/troubleshooting details
   */
  debug(context, message, data = {}) {
    if (!this.isDev) return
    const entry = this.format('DEBUG', context, message, data)
    this.write(entry)
  }

  /**
   * Log API request
   */
  logRequest(req, res, duration = 0) {
    const extra = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    }
    if (req && req._rawBodyForLogging) {
      try {
        const bodyStr = typeof req._rawBodyForLogging === 'string' ? req._rawBodyForLogging : JSON.stringify(req._rawBodyForLogging)
        extra.body = bodyStr.slice(0, 2048)
      } catch (e) {
        extra.body = '[UNAVAILABLE]'
      }
    }
    this.info('api', `${req.method} ${req.path}`, extra)
  }

  /**
   * Log blockchain operation
   */
  logBlockchainOp(operation, data) {
    this.info('blockchain', operation, data)
  }

  /**
   * Log transaction status
   */
  logTransaction(txHash, status, data = {}) {
    this.info('transaction', `status=${status}`, {
      txHash,
      status,
      ...data,
    })
  }

  /**
   * Log indexer operation
   */
  logIndexer(operation, data) {
    this.info('indexer', operation, data)
  }
}

module.exports = new Logger(process.env.SERVICE_NAME || 'blockchain-api')
