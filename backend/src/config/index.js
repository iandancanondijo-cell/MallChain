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

const chainId = process.env.CHAIN_ID || 'mallchain-1';
const chainPrefix = process.env.CHAIN_PREFIX || process.env.COSMOS_PREFIX || 'mall';
const baseDenom = process.env.CHAIN_BASE_DENOM || 'stake';
const gasPrice = process.env.GAS_PRICE || `0.01${baseDenom}`;

// Validate MONGO_URI format early
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/marketplace';
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
    paymentWebhook: process.env.PAYMENT_WEBHOOK_SECRET || null,
    operatorMnemonic: process.env.OPERATOR_MNEMONIC || null,
    faucetMnemonic: process.env.FAUCET_MNEMONIC || null,
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
      stkCallbackUrl:
        process.env.CALLBACK_URL ||
        `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/buy/mpesa/callback`,
      payoutCallbackUrl:
        process.env.PAYOUT_CALLBACK_URL ||
        `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000'}/api/buy/payout/callback`,
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
      'B2C_INITIATOR_NAME',
      'SECURITY_CREDENTIAL',
      'COMMAND_ID',
      'ENABLE_WITHDRAWAL_AUTO_PAYOUT',
      'CASHOUT_RECEIVER_ADDRESS',
    ],
  },
};

function validateRuntimeSecrets() {
  // Fail fast in production if critical secrets are missing
  if (isProduction) {
    required('JWT_SECRET', process.env.JWT_SECRET);
    required('SESSION_SECRET', process.env.SESSION_SECRET);
    required('ADMIN_API_KEY', process.env.ADMIN_API_KEY);
  }

  // Validate JWT_SECRET length (>= 32 characters for security)
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long (currently ${process.env.JWT_SECRET.length}). Generate with: openssl rand -hex 16`);
    }
  }

  // Validate SESSION_SECRET length (>= 32 characters for security)
  if (process.env.SESSION_SECRET) {
    if (process.env.SESSION_SECRET.length < 32) {
      throw new Error(`SESSION_SECRET must be at least 32 characters long (currently ${process.env.SESSION_SECRET.length}). Generate with: openssl rand -hex 16`);
    }
  }

  // C9: Require mnemonics in production
  if (isProduction) {
    required('OPERATOR_MNEMONIC', config.secrets.operatorMnemonic);
    required('FAUCET_MNEMONIC', config.secrets.faucetMnemonic);
    required('TREASURY_MNEMONIC', config.secrets.treasuryMnemonic);
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
