/**
 * Circuit breaker pattern for external API calls
 * Prevents cascading failures when blockchain/RPC is unavailable
 */

const logger = require('./logger')
const { AppError, ErrorCodes } = require('./errorHandler')

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED', // Normal operation
  OPEN: 'OPEN', // Failures exceeded, reject fast
  HALF_OPEN: 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker implementation
 * Monitors failure rate and stops calling failing services
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.nextAttemptTime = null

    // Configuration
    this.failureThreshold = options.failureThreshold || 5 // Failures before opening
    this.successThreshold = options.successThreshold || 2 // Successes needed to close from half-open
    this.timeout = options.timeout || 30000 // Time before trying half-open (ms)
    this.resetTimeout = options.resetTimeout || 60000 // Time before full reset (ms)
    this.name = options.name || 'CircuitBreaker'
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        logger.warn('circuit-breaker', `${this.name} is OPEN, rejecting request`)
        throw new AppError(
          ErrorCodes.SERVICE_UNAVAILABLE,
          `${this.name} service temporarily unavailable. Please try again later.`,
          503,
          { circuitState: CircuitState.OPEN }
        )
      }
      // Try half-open
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
      logger.info('circuit-breaker', `${this.name} transitioning to HALF_OPEN`)
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error)
      throw error
    }
  }

  /**
   * Handle successful call
   */
  onSuccess() {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED
        logger.info('circuit-breaker', `${this.name} recovered, state=CLOSED`)
      }
    }
  }

  /**
   * Handle failed call
   */
  onFailure(error) {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately reopen if half-open fails
      this.state = CircuitState.OPEN
      this.nextAttemptTime = Date.now() + this.timeout
      logger.warn('circuit-breaker', `${this.name} reopened after failure during HALF_OPEN`, {
        error: error.message,
      })
    } else if (this.failureCount >= this.failureThreshold) {
      // Open circuit after threshold
      this.state = CircuitState.OPEN
      this.nextAttemptTime = Date.now() + this.timeout
      logger.warn('circuit-breaker', `${this.name} opened after ${this.failureCount} failures`, {
        error: error.message,
      })
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset() {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.nextAttemptTime = null
    logger.info('circuit-breaker', `${this.name} reset to CLOSED`)
  }
}

/**
 * Exponential backoff retry strategy
 * Retries failed operations with increasing delays
 */
class ExponentialBackoff {
  constructor(options = {}) {
    this.initialDelay = options.initialDelay || 1000 // 1 second
    this.maxDelay = options.maxDelay || 30000 // 30 seconds
    this.multiplier = options.multiplier || 2
    this.maxRetries = options.maxRetries || 5
    this.jitter = options.jitter !== false // Add randomness to prevent thundering herd
    this.name = options.name || 'ExponentialBackoff'
  }

  /**
   * Calculate delay for retry attempt
   */
  calculateDelay(attemptNumber) {
    let delay = Math.min(
      this.initialDelay * Math.pow(this.multiplier, attemptNumber),
      this.maxDelay
    )

    if (this.jitter) {
      // Add ±10% randomness
      delay = delay * (0.9 + Math.random() * 0.2)
    }

    return Math.round(delay)
  }

  /**
   * Execute with retries
   */
  async execute(fn, context = '') {
    let lastError
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await fn()
        if (attempt > 0) {
          logger.info('backoff', `${this.name} succeeded after ${attempt} retries`, {
            context,
          })
        }
        return result
      } catch (error) {
        lastError = error
        if (attempt < this.maxRetries - 1) {
          const delay = this.calculateDelay(attempt)
          logger.warn('backoff', `${this.name} attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
            context,
            error: error.message,
            delay,
          })
          await this.delay(delay)
        }
      }
    }

    logger.error(
      'backoff',
      `${this.name} failed after ${this.maxRetries} attempts`,
      lastError,
      {
        context,
      }
    )
    throw lastError
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Create circuit breaker for blockchain RPC calls
 */
function createBlockchainBreaker() {
  return new CircuitBreaker({
    name: 'BlockchainRPC',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  })
}

/**
 * Create circuit breaker for database calls
 */
function createDatabaseBreaker() {
  return new CircuitBreaker({
    name: 'Database',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 20000,
  })
}

/**
 * Create exponential backoff for blockchain listener
 */
function createBlockchainBackoff() {
  return new ExponentialBackoff({
    name: 'BlockchainListener',
    initialDelay: 3000, // Start at 3 seconds
    maxDelay: 60000, // Cap at 60 seconds
    maxRetries: 10,
    jitter: true,
  })
}

module.exports = {
  CircuitBreaker,
  ExponentialBackoff,
  CircuitState,
  createBlockchainBreaker,
  createDatabaseBreaker,
  createBlockchainBackoff,
}
