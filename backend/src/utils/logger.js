/**
 * Structured logging utility
 * Provides consistent logging across the application
 */

const fs = require('fs')
const path = require('path')
const pino = require('pino')
const axios = require('axios')

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// O2: every log call used to block the event loop on fs.appendFileSync —
// under real request volume that's a synchronous disk write on every
// single logger.info/warn/error call, in the middle of request handling.
// pino.destination() is backed by sonic-boom, which batches writes and
// flushes asynchronously off the main thread instead. Containers/K8s
// (see the Dockerfiles and infra/k8s manifests) collect logs from stdout,
// so that's the primary destination; the file is kept only as a
// convenience for local/non-containerized runs, not a second source of truth.
const fileDestination = pino.destination({ dest: path.join(logsDir, 'app.log'), sync: false })
const pinoLogger = pino({ level: 'debug' }, pino.multistream([
  { stream: process.stdout },
  { stream: fileDestination },
]))

const LEVEL_MAP = { INFO: 'info', WARN: 'warn', ERROR: 'error', DEBUG: 'debug' }

// Fire-and-forget error alerting (webhook/Slack) — the PagerDuty-free
// alternative: set ALERT_WEBHOOK_URL (and ALERT_WEBHOOK_FORMAT=slack for a
// Slack incoming webhook's {text: ...} shape; anything else posts the raw
// entry as JSON, for a generic receiver). Throttled per (context+message)
// so a hot error loop can't turn into an alert storm — at most one
// notification per ALERT_WEBHOOK_MIN_INTERVAL_MS (default 60s) for the same
// error site.
const alertLastSentAt = new Map()
function notifyAlertWebhook(entry) {
  const url = process.env.ALERT_WEBHOOK_URL
  if (!url) return

  const key = `${entry.context}:${entry.message}`
  const minInterval = Number(process.env.ALERT_WEBHOOK_MIN_INTERVAL_MS || 60000)
  const now = Date.now()
  const last = alertLastSentAt.get(key) || 0
  if (now - last < minInterval) return
  alertLastSentAt.set(key, now)

  const isSlack = String(process.env.ALERT_WEBHOOK_FORMAT || '').toLowerCase() === 'slack'
  const payload = isSlack
    ? { text: `:rotating_light: [${entry.service}] ${entry.context}: ${entry.message}\n${entry.errorMessage || ''}` }
    : entry

  axios.post(url, payload, { timeout: 5000 }).catch(() => {
    // Never let alerting itself become a new source of unhandled errors —
    // there is nowhere further to report this failure to.
  })
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
      correlationId: data.correlationId || 'none',
      ...data,
    }
  }

  /**
   * Write log entry
   */
  write(entry) {
    const pinoLevel = LEVEL_MAP[entry.level] || 'info'
    // pino already provides its own `level` (numeric) and `time` (epoch ms)
    // on every line — passing entry.level/timestamp through as extra merged
    // fields would just overwrite those with our string/ISO versions, which
    // defeats the point of using pino's standard shape. Everything else
    // (service, context, correlationId, errorMessage, ...) still goes
    // through untouched.
    const { level, timestamp, message, ...rest } = entry
    pinoLogger[pinoLevel](rest, message)

    if (entry.level === 'ERROR') {
      notifyAlertWebhook(entry)
    }
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
      correlationId: req.correlationId || 'none',
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
