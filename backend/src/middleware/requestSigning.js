/**
 * Request Signing and Validation Middleware
 * Implements HMAC-SHA256 signatures for sensitive operations
 * Prevents tampering and replays
 * 
 * Features:
 * - Request body/payload signing
 * - Timestamp-based replay prevention
 * - Key versioning support
 * - Signature algorithm flexibility
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const promClient = require('prom-client');

// Metrics
const signatureValidationCounter = new promClient.Counter({
  name: 'request_signature_validations_total',
  help: 'Total request signature validations',
  labelNames: ['status'],
});

const signatureFailureCounter = new promClient.Counter({
  name: 'request_signature_failures_total',
  help: 'Total request signature validation failures',
  labelNames: ['reason'],
});

// Configuration
const SIGNATURE_ALGORITHM = 'sha256';
const TIMESTAMP_TOLERANCE_MS = Number(process.env.SIGNATURE_TIMESTAMP_TOLERANCE_MS || 300000); // 5 minutes
const SIGNATURE_HEADER = 'x-signature';
const TIMESTAMP_HEADER = 'x-timestamp';
const KEY_VERSION_HEADER = 'x-key-version';

/**
 * Calculate HMAC signature for request
 */
function calculateSignature(payload, secret, algorithm = SIGNATURE_ALGORITHM) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .createHmac(algorithm, secret)
    .update(payloadStr)
    .digest('hex');
}

/**
 * Get signing key for request
 * Supports key versioning for rotation
 */
function getSigningKey(keyVersion = '1') {
  const keyVar = `REQUEST_SIGNING_KEY_${keyVersion}`;
  const key = process.env[keyVar];

  if (!key) {
    throw new Error(`Signing key not found: ${keyVar}`);
  }

  return key;
}

/**
 * Validate request signature
 */
function validateSignature(signature, payload, secret, algorithm = SIGNATURE_ALGORITHM) {
  const expectedSignature = calculateSignature(payload, secret, algorithm);

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );
}

/**
 * Middleware to verify request signatures
 * Applied to sensitive endpoints (payments, withdrawals, etc.)
 */
function requireRequestSignature(req, res, next) {
  const signature = req.get(SIGNATURE_HEADER);
  const timestamp = req.get(TIMESTAMP_HEADER);
  const keyVersion = req.get(KEY_VERSION_HEADER) || '1';

  // Validate signature header present
  if (!signature) {
    logger.warn('security', 'Missing request signature', {
      path: req.path,
      method: req.method,
    });

    signatureFailureCounter.inc({ reason: 'missing_signature' });
    return res.status(401).json({
      error: 'missing_signature',
      message: 'Request signature required',
    });
  }

  // Validate timestamp header present
  if (!timestamp) {
    logger.warn('security', 'Missing request timestamp', {
      path: req.path,
      method: req.method,
    });

    signatureFailureCounter.inc({ reason: 'missing_timestamp' });
    return res.status(401).json({
      error: 'missing_timestamp',
      message: 'Request timestamp required',
    });
  }

  // Validate timestamp is recent (prevent replay attacks)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (timeDiff > TIMESTAMP_TOLERANCE_MS) {
    logger.warn('security', 'Request timestamp expired', {
      path: req.path,
      requestTime: new Date(requestTime).toISOString(),
      now: new Date(now).toISOString(),
      diff: timeDiff,
      tolerance: TIMESTAMP_TOLERANCE_MS,
    });

    signatureFailureCounter.inc({ reason: 'expired_timestamp' });
    return res.status(401).json({
      error: 'expired_timestamp',
      message: 'Request timestamp is too old',
    });
  }

  // Get signing key
  let signingKey;
  try {
    signingKey = getSigningKey(keyVersion);
  } catch (err) {
    logger.error('security', 'Failed to get signing key', err, {
      keyVersion,
    });

    signatureFailureCounter.inc({ reason: 'invalid_key_version' });
    return res.status(401).json({
      error: 'invalid_key_version',
      message: 'Invalid key version',
    });
  }

  // Build payload for signature validation
  // Include timestamp and key version for replay prevention
  const payloadForSignature = {
    method: req.method,
    path: req.path,
    timestamp,
    keyVersion,
    body: req.body || {},
  };

  // Validate signature
  try {
    const isValid = validateSignature(
      signature,
      payloadForSignature,
      signingKey,
      SIGNATURE_ALGORITHM,
    );

    if (!isValid) {
      logger.warn('security', 'Invalid request signature', {
        path: req.path,
        method: req.method,
        keyVersion,
      });

      signatureFailureCounter.inc({ reason: 'invalid_signature' });
      return res.status(401).json({
        error: 'invalid_signature',
        message: 'Request signature is invalid',
      });
    }

    signatureValidationCounter.inc({ status: 'valid' });
    logger.debug('security', 'Request signature valid', {
      path: req.path,
      keyVersion,
    });

    // Attach signature info to request for logging
    req.signature = {
      valid: true,
      keyVersion,
      timestamp,
    };

    next();
  } catch (err) {
    logger.error('security', 'Signature validation error', err, {
      path: req.path,
    });

    signatureFailureCounter.inc({ reason: 'validation_error' });
    return res.status(500).json({
      error: 'signature_validation_error',
      message: 'Failed to validate request signature',
    });
  }
}

/**
 * Middleware to attach signature to outgoing responses
 * Client can verify response authenticity
 */
function attachResponseSignature(req, res, next) {
  const originalJson = res.json;

  res.json = function(data) {
    try {
      const keyVersion = req.signature?.keyVersion || '1';
      const signingKey = getSigningKey(keyVersion);

      const timestamp = Date.now();
      const payloadForSignature = {
        status: res.statusCode,
        timestamp,
        keyVersion,
        data,
      };

      const signature = calculateSignature(payloadForSignature, signingKey);

      res.set(SIGNATURE_HEADER, signature);
      res.set(TIMESTAMP_HEADER, timestamp);
      res.set(KEY_VERSION_HEADER, keyVersion);
    } catch (err) {
      logger.error('security', 'Failed to attach response signature', err);
      // Continue without signature rather than failing response
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Generate client request signature helper
 * Used in tests or documentation
 */
function generateClientSignature(method, path, body, secret, keyVersion = '1') {
  const timestamp = Date.now();
  const payload = {
    method,
    path,
    timestamp,
    keyVersion,
    body,
  };

  const signature = calculateSignature(payload, secret);

  return {
    signature,
    timestamp,
    keyVersion,
    headers: {
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: timestamp,
      [KEY_VERSION_HEADER]: keyVersion,
    },
  };
}

module.exports = {
  requireRequestSignature,
  attachResponseSignature,
  calculateSignature,
  validateSignature,
  generateClientSignature,
  getSigningKey,
  SIGNATURE_ALGORITHM,
  TIMESTAMP_TOLERANCE_MS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  KEY_VERSION_HEADER,
  signatureValidationCounter,
  signatureFailureCounter,
};
