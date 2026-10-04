/**
 * Secret Rotation Manager
 * Handles rotation of JWT secrets, API keys, and other credentials
 * 
 * Features:
 * - Zero-downtime secret rotation
 * - Support for multiple active keys during rotation
 * - Automatic cleanup of expired keys\n * - Audit logging of rotations
 */

const crypto = require('crypto');
const logger = require('./logger');
const promClient = require('prom-client');

// Metrics
const secretRotationCounter = new promClient.Counter({
  name: 'secret_rotations_total',
  help: 'Total secret rotations performed',
  labelNames: ['secret_type'],
});

const secretRotationFailureCounter = new promClient.Counter({
  name: 'secret_rotation_failures_total',
  help: 'Total secret rotation failures',
  labelNames: ['secret_type', 'reason'],
});

// Configuration
const ROTATION_CHECK_INTERVAL_MS = Number(process.env.SECRET_ROTATION_CHECK_INTERVAL_MS || 86400000); // 24 hours
const JWT_KEY_RETENTION_DAYS = Number(process.env.JWT_KEY_RETENTION_DAYS || 7); // Keep old keys for 7 days
const API_KEY_RETENTION_DAYS = Number(process.env.API_KEY_RETENTION_DAYS || 30); // Keep old API keys for 30 days

/**
 * Secret rotation policy
 */
const ROTATION_POLICIES = {
  jwt: {
    enabled: process.env.ROTATE_JWT_SECRETS === 'true',
    interval: Number(process.env.JWT_ROTATION_INTERVAL_DAYS || 30) * 24 * 60 * 60 * 1000,
    retentionDays: JWT_KEY_RETENTION_DAYS,
    generateFn: () => crypto.randomBytes(32).toString('base64'),
  },
  apiKey: {
    enabled: process.env.ROTATE_API_KEYS === 'true',
    interval: Number(process.env.API_KEY_ROTATION_INTERVAL_DAYS || 90) * 24 * 60 * 60 * 1000,
    retentionDays: API_KEY_RETENTION_DAYS,
    generateFn: () => crypto.randomBytes(32).toString('hex'),
  },
  dbPassword: {
    enabled: process.env.ROTATE_DB_PASSWORD === 'true',
    interval: Number(process.env.DB_PASSWORD_ROTATION_INTERVAL_DAYS || 90) * 24 * 60 * 60 * 1000,
    retentionDays: 1, // Very short retention for DB passwords
    generateFn: () => crypto.randomBytes(16).toString('base64'),
  },
};

class SecretRotationManager {
  constructor() {
    this.secrets = new Map(); // secretType -> [{ value, createdAt, isActive, version }]
    this.rotationSchedules = new Map();
    this.initialized = false;
  }

  /**
   * Initialize rotation manager
   */
  initialize() {
    if (this.initialized) return;

    Object.entries(ROTATION_POLICIES).forEach(([secretType, policy]) => {
      if (policy.enabled) {
        this.scheduleRotation(secretType, policy);
      }
    });

    this.initialized = true;
    logger.info('security', 'Secret rotation manager initialized', {
      enabledPolicies: Object.keys(ROTATION_POLICIES).filter(k => ROTATION_POLICIES[k].enabled),
    });
  }

  /**
   * Schedule rotation for a secret type
   */
  scheduleRotation(secretType, policy) {
    // Clear any existing schedule
    if (this.rotationSchedules.has(secretType)) {
      clearInterval(this.rotationSchedules.get(secretType));
    }

    // Schedule rotation
    const intervalId = setInterval(() => {
      this.rotate(secretType, policy);
    }, policy.interval);

    this.rotationSchedules.set(secretType, intervalId);

    logger.info('security', 'Secret rotation scheduled', {
      secretType,
      intervalDays: policy.interval / (24 * 60 * 60 * 1000),
    });
  }

  /**
   * Perform rotation of a secret type
   */
  async rotate(secretType, policy = ROTATION_POLICIES[secretType]) {
    try {
      logger.info('security', 'Starting secret rotation', { secretType });

      // Generate new secret
      const newSecret = policy.generateFn();

      // Store new secret
      if (!this.secrets.has(secretType)) {
        this.secrets.set(secretType, []);
      }

      const secretList = this.secrets.get(secretType);
      const version = secretList.length + 1;

      // Mark old secrets as inactive
      secretList.forEach(s => {
        s.isActive = false;
      });

      // Add new secret
      secretList.push({
        value: newSecret,
        version,
        createdAt: Date.now(),
        isActive: true,
        expiresAt: Date.now() + (policy.retentionDays * 24 * 60 * 60 * 1000),
      });

      // Clean up expired secrets
      this.cleanupExpiredSecrets(secretType);

      secretRotationCounter.inc({ secret_type: secretType });

      logger.info('security', 'Secret rotation completed', {
        secretType,
        version,
        newActiveSecret: newSecret.slice(0, 8) + '...', // Log prefix only
      });

      // Update environment or configuration
      await this.applyRotation(secretType, newSecret);

      return newSecret;
    } catch (err) {
      logger.error('security', 'Secret rotation failed', err, { secretType });
      secretRotationFailureCounter.inc({ secret_type: secretType, reason: err.message });
      throw err;
    }
  }

  /**
   * Apply rotated secret to system
   * Can be overridden for custom behavior
   */
  async applyRotation(secretType, newSecret) {
    // Override this in subclass or provide custom handler
    logger.debug('security', 'Rotation applied', {
      secretType,
      secretPrefix: newSecret.slice(0, 8),
    });
  }

  /**
   * Get currently active secret
   */
  getActiveSecret(secretType) {
    const secrets = this.secrets.get(secretType) || [];
    const active = secrets.find(s => s.isActive);
    return active?.value || null;
  }

  /**
   * Get all valid secrets (active + recent for validation)
   * Used for validating old tokens during transition period
   */
  getValidSecrets(secretType) {
    const secrets = this.secrets.get(secretType) || [];
    const now = Date.now();

    return secrets
      .filter(s => s.expiresAt > now)
      .map(s => ({
        value: s.value,
        version: s.version,
        isActive: s.isActive,
      }));
  }

  /**
   * Clean up expired secrets
   */
  cleanupExpiredSecrets(secretType) {
    const secrets = this.secrets.get(secretType) || [];
    const now = Date.now();

    const before = secrets.length;
    const filtered = secrets.filter(s => s.expiresAt > now);
    this.secrets.set(secretType, filtered);
    const after = filtered.length;

    if (before !== after) {
      logger.info('security', 'Expired secrets cleaned up', {
        secretType,
        removed: before - after,
      });
    }
  }

  /**
   * Get rotation status
   */
  getStatus(secretType = null) {
    const status = {};

    const types = secretType ? [secretType] : Array.from(this.secrets.keys());

    types.forEach(type => {
      const secrets = this.secrets.get(type) || [];
      const policy = ROTATION_POLICIES[type];

      status[type] = {
        enabled: policy?.enabled || false,
        totalSecrets: secrets.length,
        activeSecret: secrets.find(s => s.isActive)
          ? `v${secrets.find(s => s.isActive).version}`
          : 'none',
        secrets: secrets.map(s => ({
          version: s.version,
          createdAt: new Date(s.createdAt).toISOString(),
          expiresAt: new Date(s.expiresAt).toISOString(),
          isActive: s.isActive,
          isExpired: s.expiresAt < Date.now(),
        })),
      };
    });

    return secretType ? status[secretType] : status;
  }

  /**
   * Perform manual rotation (admin operation)
   */
  async forceRotate(secretType) {
    const policy = ROTATION_POLICIES[secretType];
    if (!policy) {
      throw new Error(`Unknown secret type: ${secretType}`);
    }

    logger.info('security', 'Forcing secret rotation', { secretType });
    return this.rotate(secretType, policy);
  }

  /**
   * Audit log for secret access
   */
  logSecretAccess(secretType, version, context = {}) {
    logger.info('security', 'Secret accessed', {
      secretType,
      version,
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  /**
   * Get rotation schedule
   */
  getSchedule() {
    const schedule = {};

    Object.entries(ROTATION_POLICIES).forEach(([secretType, policy]) => {
      schedule[secretType] = {
        enabled: policy.enabled,
        intervalDays: policy.interval / (24 * 60 * 60 * 1000),
        retentionDays: policy.retentionDays,
      };
    });

    return schedule;
  }
}

const rotationManager = new SecretRotationManager();

// Initialize on module load
process.nextTick(() => {
  rotationManager.initialize();
});

module.exports = {
  SecretRotationManager,
  rotationManager,
  ROTATION_POLICIES,
  secretRotationCounter,
  secretRotationFailureCounter,
};
