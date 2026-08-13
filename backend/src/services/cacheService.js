/**
 * Redis caching service for frequently accessed data
 * Provides caching layer for blockchain queries, prices, and other expensive operations
 */

const logger = require('../utils/logger');

class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 300; // 5 minutes default TTL
  }

  /**
   * Check if Redis is available
   */
  isAvailable() {
    return this.redis && this.redis.status === 'ready';
  }

  /**
   * Get cached value
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (value === null) {
        return null;
      }
      
      // Try to parse as JSON
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (err) {
      logger.warn('cache-service', 'Failed to get cached value', err, { key });
      return null;
    }
  }

  /**
   * Set cached value with optional TTL
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      return true;
    } catch (err) {
      logger.warn('cache-service', 'Failed to set cached value', err, { key });
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (err) {
      logger.warn('cache-service', 'Failed to delete cached value', err, { key });
      return false;
    }
  }

  /**
   * Clear all keys matching a pattern
   */
  async clearPattern(pattern) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (err) {
      logger.warn('cache-service', 'Failed to clear pattern', err, { pattern });
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet(key, fn, ttl = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  /**
   * Cache keys for different data types
   */
  static Keys = {
    // Wallet balance cache: wallet_balance:{address}
    walletBalance: (address) => `wallet_balance:${address}`,
    
    // Market price cache: market_price
    marketPrice: () => `market_price`,
    
    // Emission state cache: emission_state
    emissionState: () => `emission_state`,
    
    // Validator info cache: validator:{address}
    validator: (address) => `validator:${address}`,
    
    // Transaction status cache: tx_status:{hash}
    transactionStatus: (hash) => `tx_status:${hash}`,
    
    // Exchange rate cache: exchange_rate:{pair}
    exchangeRate: (pair) => `exchange_rate:${pair}`,
  };

  /**
   * TTL values for different data types (in seconds)
   */
  static TTL = {
    // Short-lived: 30 seconds
    SHORT: 30,
    
    // Medium-lived: 5 minutes (default)
    MEDIUM: 300,
    
    // Long-lived: 1 hour
    LONG: 3600,
    
    // Very long-lived: 24 hours
    VERY_LONG: 86400,
  };
}

// Global cache service instance
let cacheService = null;

/**
 * Initialize cache service with Redis client
 */
function initCacheService(redisClient) {
  cacheService = new CacheService(redisClient);
  logger.info('cache-service', 'Cache service initialized');
  return cacheService;
}

/**
 * Get cache service instance
 */
function getCacheService() {
  return cacheService;
}

module.exports = {
  CacheService,
  initCacheService,
  getCacheService,
};
