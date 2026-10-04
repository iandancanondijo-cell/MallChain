/**
 * Feature Flags System
 * Runtime-configurable feature flags with environment and database backing
 */

const logger = require('./logger');

// Flag definitions with defaults and metadata
const FLAG_DEFINITIONS = {
  // Authentication & Security
  'auth.require_email_verification': {
    default: false,
    description: 'Require email verification before allowing login',
    type: 'boolean',
  },
  'auth.enable_passkeys': {
    default: false,
    description: 'Enable WebAuthn passkey authentication',
    type: 'boolean',
  },

  // Wallet & Transactions
  'wallet.enable_fiat_onramp': {
    default: false,
    description: 'Enable fiat-to-crypto onramp via M-Pesa',
    type: 'boolean',
  },
  'wallet.enable_nft_transfers': {
    default: true,
    description: 'Enable NFT transfers between users',
    type: 'boolean',
  },
  'wallet.enable_batch_transactions': {
    default: false,
    description: 'Enable batch transaction submission',
    type: 'boolean',
  },

  // Social Features
  'social.enable_tiktok_rewards': {
    default: true,
    description: 'Enable TikTok social reward submissions',
    type: 'boolean',
  },
  'social.enable_x_rewards': {
    default: true,
    description: 'Enable X (Twitter) social reward submissions',
    type: 'boolean',
  },
  'social.enable_instagram_rewards': {
    default: true,
    description: 'Enable Instagram social reward submissions',
    type: 'boolean',
  },

  // Creator Space
  'creator.enable_campaigns': {
    default: true,
    description: 'Enable creator campaign creation',
    type: 'boolean',
  },
  'creator.enable_analytics': {
    default: true,
    description: 'Enable creator analytics dashboard',
    type: 'boolean',
  },

  // DEX & Trading
  'dex.enable_limit_orders': {
    default: false,
    description: 'Enable limit orders on DEX',
    type: 'boolean',
  },
  'dex.enable_liquidity_mining': {
    default: false,
    description: 'Enable liquidity mining rewards',
    type: 'boolean',
  },

  // API & Performance
  'api.enable_request_signing': {
    default: false,
    description: 'Require HMAC request signatures for API calls',
    type: 'boolean',
  },
  'api.enable_response_compression': {
    default: true,
    description: 'Enable gzip/brotli response compression',
    type: 'boolean',
  },
  'api.enable_cursor_pagination': {
    default: true,
    description: 'Use cursor-based pagination instead of offset',
    type: 'boolean',
  },

  // Experimental
  'experimental.enable_ai_assistant': {
    default: false,
    description: 'Enable AI-powered assistant features',
    type: 'boolean',
  },
  'experimental.enable_web3_wallet': {
    default: false,
    description: 'Enable MetaMask/WalletConnect integration',
    type: 'boolean',
  },
};

class FeatureFlagManager {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.CACHE_TTL_MS = Number(process.env.FEATURE_FLAG_CACHE_TTL_MS || 60000); // 1 minute
  }

  /**
   * Get flag value with resolution order:
   * 1. Environment variable (FEATURE_FLAG_<name>)
   * 2. Database override (if configured)
   * 3. Default value from definition
   */
  async getFlag(flagName, context = {}) {
    const definition = FLAG_DEFINITIONS[flagName];
    if (!definition) {
      logger.warn('Feature flag not defined, returning false', { flagName });
      return false;
    }

    // Check cache first
    const cacheKey = `${flagName}:${JSON.stringify(context)}`;
    if (this.cache.has(cacheKey) && !this.isExpired(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Resolution order
    let value = await this.resolveFlag(flagName, definition, context);

    // Cache result
    this.cache.set(cacheKey, value);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL_MS);

    return value;
  }

  /**
   * Resolve flag value from environment or default
   */
  async resolveFlag(flagName, definition, context) {
    // Check environment variable
    const envKey = `FEATURE_FLAG_${flagName.toUpperCase().replace(/\./g, '_')}`;
    if (process.env[envKey] !== undefined) {
      const envValue = process.env[envKey];
      return this.parseValue(envValue, definition.type);
    }

    // TODO: Check database override table if needed
    // const dbOverride = await this.getDatabaseOverride(flagName, context);
    // if (dbOverride !== null) return dbOverride;

    // Return default
    return definition.default;
  }

  /**
   * Parse string value to appropriate type
   */
  parseValue(value, type) {
    switch (type) {
      case 'boolean':
        return value === 'true' || value === '1' || value === true;
      case 'number':
        return Number(value);
      case 'string':
        return String(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      default:
        return value;
    }
  }

  /**
   * Check if cached value is expired
   */
  isExpired(cacheKey) {
    const expiry = this.cacheExpiry.get(cacheKey);
    return !expiry || Date.now() > expiry;
  }

  /**
   * Get all flags with their current values
   */
  async getAllFlags(context = {}) {
    const flags = {};
    for (const flagName of Object.keys(FLAG_DEFINITIONS)) {
      flags[flagName] = await this.getFlag(flagName, context);
    }
    return flags;
  }

  /**
   * Get flag definition metadata
   */
  getFlagDefinition(flagName) {
    return FLAG_DEFINITIONS[flagName];
  }

  /**
   * Get all flag definitions
   */
  getAllDefinitions() {
    return FLAG_DEFINITIONS;
  }

  /**
   * Clear flag cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    logger.info('Feature flag cache cleared');
  }

  /**
   * Check multiple flags at once
   */
  async checkFlags(flagNames, context = {}) {
    const results = {};
    for (const flagName of flagNames) {
      results[flagName] = await this.getFlag(flagName, context);
    }
    return results;
  }
}

const flagManager = new FeatureFlagManager();

module.exports = {
  FeatureFlagManager,
  flagManager,
  FLAG_DEFINITIONS,
  getFlag: flagManager.getFlag.bind(flagManager),
  getAllFlags: flagManager.getAllFlags.bind(flagManager),
  getFlagDefinition: flagManager.getFlagDefinition.bind(flagManager),
};
