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

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,

  port: Number(process.env.PORT || 4000),

  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/marketplace',

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
};

function validateRuntimeSecrets() {
  // Fail fast in production if critical secrets are missing
  if (isProduction) {
    required('JWT_SECRET', process.env.JWT_SECRET);
    required('SESSION_SECRET', process.env.SESSION_SECRET);
    required('ADMIN_API_KEY', process.env.ADMIN_API_KEY);
  }

  // Warn about operator/faucet mnemonics in non-production; disallow unsafe defaults
  if (config.secrets.operatorMnemonic && isProduction) {
    // operator mnemonic present in production - recommend secure secret manager
    console.warn('Operator mnemonic loaded from env; ensure this is a secure secret store, rotate regularly.');
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

module.exports = { config, getAllowedOrigins };
