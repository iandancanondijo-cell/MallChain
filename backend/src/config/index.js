/**
 * Centralized runtime configuration for the API server.
 * All services should import from here instead of reading process.env ad hoc.
 */

const isProduction = process.env.NODE_ENV === 'production';

function required(name, value) {
  if (isProduction && (value === undefined || value === null || value === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateMongoUri(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }
  
  // MongoDB URI must start with mongodb:// or mongodb+srv://
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(`MONGO_URI must start with "mongodb://" or "mongodb+srv://", got: ${uri.substring(0, 50)}...`);
  }
  
  // Basic format validation: must have at least host
  const uriPattern = /^mongodb(\+srv)?:\/\/.+/i;
  if (!uriPattern.test(uri)) {
    throw new Error(`MONGO_URI has invalid format: ${uri.substring(0, 50)}...`);
  }
  
  return uri;
}

function requireSecret(name, value, { allowInDev = false } = {}) {
  if (isProduction) {
    return required(name, value);
  }
  if (!value && !allowInDev) {
    console.warn(`Warning: ${name} is not set. In production this will fail.`);
  }
  return value;
}

// Safaricom's Daraja API has no way to sign its webhook payloads (no HMAC
// header support), so the only practical way to authenticate a callback is
// a shared-secret token baked into the callback URL itself — Safaricom just
// echoes back whatever URL was registered, query string included.
function appendWebhookToken(url, secret) {
  if (!secret) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(secret)}`;
}

const chainId = process.env.CHAIN_ID || 'mallchain-1';
const chainPrefix = process.env.CHAIN_PREFIX || process.env.COSMOS_PREFIX || 'mall';
const baseDenom = process.env.CHAIN_BASE_DENOM || 'stake';
const gasPrice = process.env.GAS_PRICE || `0.01${baseDenom}`;

// In production, an unset MONGO_URI must fail fast (matching every other
// required() secret) rather than silently falling back to a localhost
// instance that doesn't exist in a real deployment — dev/test keep the
// convenience default.
const mongoUri = required('MONGO_URI', process.env.MONGO_URI) || 'mongodb://localhost:27017/marketplace';
validateMongoUri(mongoUri);

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,

  port: Number(process.env.PORT || 4000),

  mongoUri: mongoUri,

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
  },

  secrets: {
    jwt: required('JWT_SECRET', process.env.JWT_SECRET),
    session: required('SESSION_SECRET', process.env.SESSION_SECRET),
    adminApiKey: required('ADMIN_API_KEY', process.env.ADMIN_API_KEY),
    monitoringApiKey: process.env.MONITORING_API_KEY || null,
    paymentWebhook: process.env.PAYMENT_WEBHOOK_SECRET || null,
    operatorMnemonic: process.env.OPERATOR_MNEMONIC || null,
    faucetMnemonic: process.env.FAUCET_MNEMONIC || null,
    fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY || null,
    fieldBlindIndexKey: process.env.FIELD_BLIND_INDEX_KEY || null,
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  chain: {
    id: chainId,
    prefix: chainPrefix,
    baseDenom,
    gasPrice,
    rpc: process.env.CHAIN_RPC || process.env.COSMOS_RPC_URL || 'http://127.0.0.1:26657',
    rest:
      process.env.CHAIN_REST_URL ||
      process.env.CHAIN_REST ||
      'http://127.0.0.1:1317',
    broadcastMode: process.env.BROADCAST_MODE || 'BROADCAST_MODE_SYNC',
    txConfirmTimeoutMs: Number(process.env.TX_CONFIRM_TIMEOUT_MS || 120000),
    txPollIntervalMs: Number(process.env.TX_POLL_INTERVAL_MS || 2000),
    listenerIntervalMs: Number(process.env.BLOCKCHAIN_LISTENER_INTERVAL_MS || 3000),
  },

  walletService: {
    enabled: process.env.WALLET_SERVICE_ENABLED !== 'false',
    port: Number(process.env.WALLET_SERVICE_PORT || 4001),
    bindHost: process.env.WALLET_SERVICE_HOST || '127.0.0.1',
  },

  rateLimit: {
    apiWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
    apiMax: Number(process.env.RATE_LIMIT_MAX || 120),
    txMax: Number(process.env.RATE_LIMIT_TX_MAX || 40),
  },

  payment: {
    safaricom: {
      apiBaseUrl: process.env.SAFARICOM_API || 'https://sandbox.safaricom.co.ke',
      consumerKey: process.env.SAFARICOM_KEY || '',
      consumerSecret: process.env.SAFARICOM_SECRET || '',
      businessShortCode: process.env.BUSINESS_SHORT_CODE || '174379',
      passkey: process.env.PASSKEY || '',
      stkCallbackUrl: appendWebhookToken(
        process.env.CALLBACK_URL ||
          `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/buy/mpesa/callback`,
        process.env.PAYMENT_WEBHOOK_SECRET
      ),
      payoutCallbackUrl: appendWebhookToken(
        process.env.PAYOUT_CALLBACK_URL ||
          `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/buy/payout/callback`,
        process.env.PAYMENT_WEBHOOK_SECRET
      ),
      badgeCallbackUrl: appendWebhookToken(
        process.env.BADGE_CALLBACK_URL ||
          `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/badge/mpesa/callback`,
        process.env.PAYMENT_WEBHOOK_SECRET
      ),
      b2cInitiatorName: process.env.B2C_INITIATOR_NAME || 'testapi',
      securityCredential: process.env.SECURITY_CREDENTIAL || '',
      commandId: process.env.COMMAND_ID || 'BusinessPayment',
      autoPayoutEnabled: String(process.env.ENABLE_WITHDRAWAL_AUTO_PAYOUT || '').toLowerCase() === 'true',
      cashoutReceiverAddress: process.env.CASHOUT_RECEIVER_ADDRESS || '',
    },
    envPlacement: [
      'SAFARICOM_API',
      'SAFARICOM_KEY',
      'SAFARICOM_SECRET',
      'BUSINESS_SHORT_CODE',
      'PASSKEY',
      'CALLBACK_URL',
      'PAYOUT_CALLBACK_URL',
      'BADGE_CALLBACK_URL',
      'B2C_INITIATOR_NAME',
      'SECURITY_CREDENTIAL',
      'COMMAND_ID',
      'ENABLE_WITHDRAWAL_AUTO_PAYOUT',
      'CASHOUT_RECEIVER_ADDRESS',
    ],
  },

  // Best-effort — see emailService.js/smsService.js's isConfigured() guards.
  // Unlike payment.safaricom, neither is production-required: a badge
  // notification failing to send shouldn't take down the API, unlike a
  // failed M-Pesa payment.
  email: {
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'noreply@mallchain.local',
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    },
  },

  sms: {
    africastalking: {
      apiKey: process.env.AFRICASTALKING_API_KEY || '',
      username: process.env.AFRICASTALKING_USERNAME || '',
      senderId: process.env.AFRICASTALKING_SENDER_ID || '',
      apiBaseUrl: process.env.AFRICASTALKING_API_BASE_URL || 'https://api.africastalking.com',
    },
  },

  badge: {
    // How many consecutive active days (see utils/activityTracker.js) the
    // monthly snapshot (jobs/badgeSnapshot.js) requires to earn a badge.
    streakRequiredDays: Number(process.env.BADGE_STREAK_REQUIRED_DAYS || 7),
    purchasePriceKes: Number(process.env.BADGE_PURCHASE_PRICE_KES || 17),
  },
};

// Literal placeholder values that appear in .env.example (a committed,
// publicly-readable file). A secret matching one of these — even if it's
// long enough to pass the length check — is a known, guessable value, not
// an actual secret. Compared case-insensitively against secret values below.
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace_with_random_32plus_char_secret',
  'dev-secret',
  'changeme',
  'change_me',
  'secret',
  'password',
]);

function assertNotPlaceholder(name, value) {
  if (value && KNOWN_PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
    throw new Error(`${name} is still set to a placeholder/example value. Generate a real secret with: openssl rand -hex 16`);
  }
}

function validateRuntimeSecrets() {
  // Fail fast in production if critical secrets are missing
  if (isProduction) {
    required('JWT_SECRET', process.env.JWT_SECRET);
    required('SESSION_SECRET', process.env.SESSION_SECRET);
    required('ADMIN_API_KEY', process.env.ADMIN_API_KEY);
    required('MONITORING_API_KEY', process.env.MONITORING_API_KEY);
    required('FIELD_ENCRYPTION_KEY', process.env.FIELD_ENCRYPTION_KEY);
    required('FIELD_BLIND_INDEX_KEY', process.env.FIELD_BLIND_INDEX_KEY);

    // TEST_MODE bypasses the Vault requirement for treasury signing (see
    // utils/keyManager.js) and short-circuits faucetService's mnemonic
    // resolution straight to a raw env var. Left on by accident in
    // production, it silently weakens custody of funds that should only
    // ever be signed via Vault.
    if (String(process.env.TEST_MODE).toLowerCase() === 'true') {
      throw new Error('TEST_MODE must not be enabled in production (NODE_ENV=production): it bypasses Vault-backed treasury signing.');
    }
  }

  // Validate JWT_SECRET length (>= 32 characters for security)
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long (currently ${process.env.JWT_SECRET.length}). Generate with: openssl rand -hex 16`);
    }
    assertNotPlaceholder('JWT_SECRET', process.env.JWT_SECRET);
  }

  // Validate SESSION_SECRET length (>= 32 characters for security). May be
  // a comma-separated list for rotation (see index.js's session() setup) —
  // validate each entry on its own for the same reason as ADMIN_API_KEY above.
  if (process.env.SESSION_SECRET) {
    const sessionSecrets = process.env.SESSION_SECRET.split(',').map(s => s.trim()).filter(Boolean);
    for (const sessionSecret of sessionSecrets) {
      if (sessionSecret.length < 32) {
        throw new Error(`SESSION_SECRET must be at least 32 characters long (each comma-separated entry, currently ${sessionSecret.length}). Generate with: openssl rand -hex 16`);
      }
      assertNotPlaceholder('SESSION_SECRET', sessionSecret);
    }
  }

  // Validate ADMIN_API_KEY length (>= 32 characters) — it gates admin
  // endpoints and /metrics the same way JWT_SECRET gates auth, but had no
  // strength check at all. May be a comma-separated list (see
  // middleware/apiKeyAuth.js) to support rotation — validate each entry on
  // its own so one strong key can't mask a weak one hiding next to it.
  if (process.env.ADMIN_API_KEY) {
    const adminKeys = process.env.ADMIN_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
    for (const adminKey of adminKeys) {
      if (adminKey.length < 32) {
        throw new Error(`ADMIN_API_KEY must be at least 32 characters long (each comma-separated entry, currently ${adminKey.length}). Generate with: openssl rand -hex 16`);
      }
      assertNotPlaceholder('ADMIN_API_KEY', adminKey);
    }
  }

  // Validate MONITORING_API_KEY length (>= 32 characters) — gates /metrics
  // read-only scraping. Must NOT share a value with ADMIN_API_KEY (scope
  // separation: metrics scrape compromises → admin panel not also).
  if (process.env.MONITORING_API_KEY) {
    const monitorKeys = process.env.MONITORING_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
    for (const monitorKey of monitorKeys) {
      if (monitorKey.length < 32) {
        throw new Error(`MONITORING_API_KEY must be at least 32 characters long (each comma-separated entry, currently ${monitorKey.length}). Generate with: openssl rand -hex 16`);
      }
      assertNotPlaceholder('MONITORING_API_KEY', monitorKey);
    }
    if (process.env.ADMIN_API_KEY) {
      const adminSet = new Set(process.env.ADMIN_API_KEY.split(',').map(k => k.trim()).filter(Boolean));
      for (const monitorKey of monitorKeys) {
        if (adminSet.has(monitorKey)) {
          throw new Error('MONITORING_API_KEY must not share a value with ADMIN_API_KEY. Use two different secrets: prometheus scrape credentials should not grant admin-panel access. Generate with: openssl rand -hex 32');
        }
      }
    }
  }

  // Field-level PII encryption keys (production-readiness E2/E1) — 32-byte
  // hex, and deliberately two DIFFERENT keys: reusing one key for both the
  // cipher and the blind-index would let an attacker who obtains the
  // (more-exposed, needed-for-search) index key also decrypt the data.
  if (process.env.FIELD_ENCRYPTION_KEY) {
    const buf = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex');
    if (buf.length !== 32) {
      throw new Error(`FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes), decoded to ${buf.length}. Generate with: openssl rand -hex 32`);
    }
  }
  if (process.env.FIELD_BLIND_INDEX_KEY) {
    const buf = Buffer.from(process.env.FIELD_BLIND_INDEX_KEY, 'hex');
    if (buf.length !== 32) {
      throw new Error(`FIELD_BLIND_INDEX_KEY must be a 64-character hex string (32 bytes), decoded to ${buf.length}. Generate with: openssl rand -hex 32`);
    }
    if (process.env.FIELD_BLIND_INDEX_KEY === process.env.FIELD_ENCRYPTION_KEY) {
      throw new Error('FIELD_BLIND_INDEX_KEY must not be the same value as FIELD_ENCRYPTION_KEY.');
    }
  }

  // C9: Require mnemonics in production
  if (isProduction) {
    required('OPERATOR_MNEMONIC', config.secrets.operatorMnemonic);
    // No FAUCET_MNEMONIC requirement — the faucet is hard-disabled in
    // production (see services/faucetService.js's isFaucetEnabled()), so
    // requiring a funded hot-wallet key for a feature that can't run would
    // just be a pointless extra secret to provision and protect.

    // Without this, /api/buy/mpesa/callback and /api/buy/payout/callback
    // accept unauthenticated requests that mark a fiat purchase "confirmed"
    // and trigger an on-chain MLCNS credit — anyone who learns a paymentId
    // could mint themselves coins with a forged callback.
    required('PAYMENT_WEBHOOK_SECRET', config.secrets.paymentWebhook);

    // Treasury signing in production must go through Vault (see
    // utils/keyManager.js's getTreasuryMnemonic): TEST_MODE is already
    // rejected above, so TREASURY_MNEMONIC is never a valid production path
    // — VAULT_ADDR + VAULT_TOKEN are the only way treasury signing can work.
    // This previously checked a non-existent config.secrets.treasuryMnemonic
    // field (always undefined), which meant every production startup failed
    // unconditionally regardless of how Vault was actually configured.
    if (!process.env.VAULT_ADDR || !process.env.VAULT_TOKEN) {
      throw new Error('VAULT_ADDR and VAULT_TOKEN are required in production for treasury signing (see utils/keyManager.js).');
    }
  }
}

function getAllowedOrigins() {
  const origins = [
    config.frontendUrl,
    ...config.corsOrigins,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ].filter(Boolean);

  if (!config.isProduction) {
    return (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    };
  }

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  };
}

module.exports = { config, getAllowedOrigins, validateRuntimeSecrets };
