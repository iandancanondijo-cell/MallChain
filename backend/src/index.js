// Load environment variables - disable dotenvx if present
if (process.env.DOTENVX_LOADED) {
  console.warn('dotenvx detected, using standard dotenv instead');
}
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const { config, getAllowedOrigins, validateRuntimeSecrets } = require('./config');
const passport = require('passport');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const User = require('./models/user');
const Conversation = require('./models/Conversation');
const { createLimiter, limiters } = require('./middleware/rateLimiter')
const apiKeyAuth = require('./middleware/apiKeyAuth')
const { errorHandler } = require('./utils/errorHandler')
const logger = require('./utils/logger')
const correlationId = require('./middleware/correlationId')
const { metricsMiddleware, register, socketErrorsTotal, socketRoomCapRejectionsTotal, recordCspViolation } = require('./utils/metrics')
const { initCacheService } = require('./services/cacheService')
const { maintenanceGuard } = require('./middleware/maintenanceMode')
const { computeBlockStaleness } = require('./utils/chainHealth')

const authRoutes = require('./routes/auth');
const gdprRoutes = require('./routes/gdpr');
const vaultRoutes = require('./routes/vault');
const txRoutes = require('./routes/tx');
const marketRoutes = require('./routes/market');
const fxRoutes = require('./routes/fx');
const sendRoutes = require('./routes/send');
const blockchainRoutes = require('./routes/blockchain');
const blockchainTxRoutes = require('./routes/blockchainTx');
const walletsRoutes = require('./routes/wallets');
const kycRoutes = require('./routes/kyc');
const { startBlockchainListener } = require('./services/blockchainListener');
const walletConnectionRoutes = require('./routes/walletConnection');
const walletCreationRoutes = require('./routes/walletCreation');
const governanceRoutes = require('./routes/governance');
const liquidityRoutes = require('./routes/liquidity');
const mallpointsRoutes = require('./routes/mallpoints');
const notificationsRoutes = require('./routes/notifications');
const paymentRoutes = require('./routes/payment');
const buyRoutes = require('./routes/buy');
const stakingRoutes = require('./routes/staking');
const keyVaultRoutes = require('./routes/keyVault');
const dexRoutes = require('./routes/dex');
const validatorsRoutes = require('./routes/validators');
const onchainRoutes = require('./routes/onchain');
const historyRoutes = require('./routes/history');
const faucetRoutes = require('./routes/faucet');
const adminPanelRoutes = require('./routes/adminPanel');
const maintenanceStatusRoutes = require('./routes/maintenanceStatus');
const contractsRoutes = require('./routes/contracts');
const devhubRoutes = require('./routes/devhub');
const settingsRoutes = require('./routes/settings');
const rewardsRoutes = require('./routes/rewards');
const addressMapRoutes = require('./routes/addressMap');
const searchRoutes = require('./routes/search');
const axios = require('axios');

const http = require('http')
const net = require('net')
const { Server } = require('socket.io')
// csurf itself is deprecated/unmaintained; @dr.pogodin/csurf is an
// actively-maintained fork with an identical API, so this is a drop-in swap.
const csurf = require('@dr.pogodin/csurf')

// Real-time services
const { startBlockListener } = require('../services/blockListener');
const { priceEngine } = require('../services/priceEngine');
const { marketFeed } = require('../services/marketActivityFeed');
const { walletSyncService } = require('../services/walletSync');
const { notificationManager } = require('../services/notificationManager');
const { initializeDefaultBurnPolicies, initializeDefaultDynamicThresholds } = require('./services/burnCalculator');

const app = express();
const PORT = config.port;
const JWT_SECRET = config.secrets.jwt;
const SESSION_SECRET = config.secrets.session;
const ADMIN_API_KEY = config.secrets.adminApiKey;

if (config.isProduction) {
  // Blindly trusting one hop (the default here) means rate-limiting and
  // req.ip both trust whatever X-Forwarded-For the immediate upstream sends
  // — fine behind exactly one known proxy, but if that upstream is itself
  // reachable directly (misconfigured LB/CDN) a client can just set its own
  // X-Forwarded-For and borrow another user's rate-limit bucket or spoof
  // req.ip. TRUST_PROXY should be the actual proxy/CDN CIDR list in any real
  // deployment; the numeric fallback is a same-as-before default for
  // environments that haven't set it yet.
  if (process.env.TRUST_PROXY) {
    const proxies = process.env.TRUST_PROXY.split(',').map(p => p.trim()).filter(Boolean);
    app.set('trust proxy', proxies);
  } else {
    logger.warn('TRUST_PROXY is not set — falling back to trusting exactly one hop. Set TRUST_PROXY to your reverse proxy/CDN CIDR list(s) for production.');
    app.set('trust proxy', 1);
  }
}

if (!JWT_SECRET) logger.warn('JWT_SECRET is not configured; authentication tokens are insecure.');
if (!SESSION_SECRET) logger.warn('SESSION_SECRET is not configured; session cookies are insecure.');
require('./services/treasuryLimitsService').warnIfUnconfigured();

// TRUST_PROXY fail-closed wiring (see config/index.js parseTrustProxy +
// validateRuntimeSecrets): in production a malformed TRUST_PROXY throws at
// require(config) time, an empty one fails validateRuntimeSecrets, and here
// — regardless of env — we pass the parsed list straight through to
// Express's trust proxy setting so req.ip / req.ips are correct for rate
// limiting. The sentinel `null` means "leave it unset" (the Express default
// behaviour of trusting nothing in effect for local dev).
if (config.trustProxy !== null) {
  app.set('trust proxy', config.trustProxy);
}

app.use(helmet({
  contentSecurityPolicy: config.isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameSrc: ["'none'"],
          workerSrc: ["'none'"],
          reportUri: '/csp-report',
        },
      }
    : {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", 'http://localhost:5173', 'ws://localhost:5173'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameSrc: ["'none'"],
          workerSrc: ["'none'"],
          reportUri: '/csp-report',
        },
      },
  crossOriginResourcePolicy: { policy: 'same-site' },
  frameguard: { action: 'deny' },
  hsts: config.isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
    force: true,
  } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { policy: 'none' },
}));
app.disable('x-powered-by');
app.use(correlationId);
app.use(metricsMiddleware);
/**
 * Task 3.1-3.6: CORS (Cross-Origin Resource Sharing) Configuration
 * 
 * CORS allows the frontend (at different domain/port) to make requests to the backend.
 * Without proper CORS configuration, browsers block cross-origin requests.
 * 
 * Configuration:
 * - getAllowedOrigins() reads FRONTEND_URL and CORS_ORIGINS env vars
 * - CORS_ORIGINS: comma-separated list of allowed origins (e.g., "http://localhost:5173,https://app.example.com")
 * - credentials: true allows cookies and Authorization headers in requests
 * 
 * How it works:
 * 1. Browser makes request from origin A to server at origin B
 * 2. Browser checks Access-Control-Allow-Origin response header
 * 3. If origin A matches, browser allows script to access response
 * 4. If no match or missing, browser blocks access (CORS error)
 * 
 * Security considerations:
 * - Only specific origins can access backend (not "*" in production)
 * - credentials: true requires explicit origin (cannot use "*")
 * - Frontend must set Authorization header in requests (handled in API service)
 * - Preflight requests (OPTIONS) are handled automatically by cors middleware
 */
app.use(cors({
  // getAllowedOrigins() returns array of origins from FRONTEND_URL and CORS_ORIGINS env vars
  // Example: ["http://localhost:5173", "https://app.example.com"]
  origin: getAllowedOrigins(),
  
  // Allow credentials (cookies, auth headers) in cross-origin requests
  // Without this, Authorization: Bearer headers are blocked by browser
  // Task 3.5: credentials: true enables Authorization header passing from frontend
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
const sanitizeSensitive = require('./middleware/sanitizeSensitive');
app.use(sanitizeSensitive);
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// Task 7.1: API Rate Limiting
// 
// Protects backend from abuse by limiting request rate per IP address
// Prevents denial of service (DoS) attacks and runaway client loops
//
// Configuration:
// - windowMs: Time window in milliseconds (e.g., 15 minutes)
// - max: Maximum requests per window per IP
//
// Example: max 100 requests per 15 minutes = 6.7 requests/minute (reasonable for most APIs)
// Rejected requests get 429 Too Many Requests status code
//
// Task 6.3: 429 error handling on frontend - user sees "wait X seconds" message

const apiLimiter = createLimiter({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.txMax,
});

const minesLimiter = createLimiter({
  windowMs: 60000,
  max: 100,
});

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.logRequest(req, res, duration)
  })
  next()
})

// Apply rate limiting to specific critical routes
// Task 7.1: Transaction endpoint uses apiLimiter (strict limits on expensive operations)
app.use('/api/tx', apiLimiter);
// Task 7.1: Treasury endpoint uses apiLimiter (financial operations need rate limiting)
app.use('/api/mallwallet/treasury', apiLimiter);
// Task 7.1: Mines endpoint uses minesLimiter (gaming feature, moderate rate limiting)
app.use('/api/mines', minesLimiter);

// Request ID middleware for tracing
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Passport for OAuth (Google)
// Session cookies are signed with SESSION_SECRET — mounting this middleware
// with the 'dev-secret' fallback it used to have would let anyone forge a
// session cookie, so refuse to start rather than silently run insecurely.
if (!SESSION_SECRET) {
  logger.error('SESSION_SECRET is not configured; refusing to start session middleware with an insecure default.');
  process.exit(1);
}
// May be a comma-separated list: express-session signs new cookies with the
// first entry but accepts any of them when verifying an existing cookie, so
// a rotation can add the new secret first, let both work while old sessions
// drain out, then remove the old one — instead of invalidating every
// logged-in user's session the instant the secret changes.
const sessionSecrets = SESSION_SECRET.split(',').map(s => s.trim()).filter(Boolean);
app.use(session({
  secret: sessionSecrets.length > 1 ? sessionSecrets : SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.isProduction,
    sameSite: 'strict',
    httpOnly: true,
    // This cookie only backs the brief passport OAuth handshake (Google
    // login) — the app's ongoing auth is the separate stateless JWT, not
    // this session — so an unset maxAge (session cookie, cleared on
    // browser close) is intentional rather than a bug. Still, an OAuth
    // redirect that outlives a very short-lived session cookie (slow
    // consent screen, mobile browser backgrounding) fails oddly, so give
    // it a bounded lifetime instead of "until the tab closes".
    maxAge: 1000 * 60 * 30,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  }
}));
app.use(passport.initialize());
app.use(passport.session());
require('./utils/passport');

// CSRF protection - only apply to specific session-based routes
// Disabled globally to prevent issues with public API endpoints
// CSRF can be applied to specific routes that need session protection (e.g., OAuth callbacks)
const csrfProtection = csurf({ cookie: true });

// CSRF token endpoint for frontend (if needed for session-based auth)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Validate critical runtime secrets and configuration early
try {
  if (typeof validateRuntimeSecrets === 'function') validateRuntimeSecrets();
} catch (err) {
  logger.error('Runtime secret validation failed', { error: err.message });
  process.exit(1);
}

const CHAIN_REST = config.chain.rest;
// How stale the latest block can be before we consider consensus halted
// rather than just slow. A REST endpoint that responds but keeps returning
// the same old block (validator down, consensus stuck) previously reported
// as fully healthy — this endpoint responding was the only thing checked.
const CHAIN_STALE_BLOCK_MS = Number(process.env.CHAIN_STALE_BLOCK_MS || 60000);

async function checkChainHealth() {
  const base = CHAIN_REST.replace(/\/$/, '');
  const [nodeRes, blockRes] = await Promise.all([
    axios.get(`${base}/cosmos/base/tendermint/v1beta1/node_info`, { timeout: 5000 }),
    axios.get(`${base}/cosmos/base/tendermint/v1beta1/blocks/latest`, { timeout: 5000 }),
  ]);

  const chainId = nodeRes.data?.default_node_info?.network || 'unknown';
  const moniker = nodeRes.data?.default_node_info?.moniker || 'unknown';
  const latestHeight = blockRes.data?.block?.header?.height || '0';
  const latestBlockTime = blockRes.data?.block?.header?.time || null;

  const { blockAgeMs, isStale } = computeBlockStaleness(latestBlockTime, CHAIN_STALE_BLOCK_MS);

  return {
    status: isStale ? 'stale' : 'ok',
    chainId,
    moniker,
    latestHeight,
    latestBlockTime,
    blockAgeMs,
    restEndpoint: base,
    timestamp: new Date().toISOString(),
  };
}

app.get('/api/health', async (req, res) => {
  // Each dependency is checked independently — a chain outage used to throw
  // out of checkChainHealth() before database/redis were even checked, so
  // the response collapsed to a bare chain-only error with no db/redis
  // fields at all. That's exactly the wrong time to lose that signal: a
  // multi-dependency partial outage is when ops most needs to see all
  // three statuses at once, not just whichever one happened to throw first.
  let chainStatus;
  try {
    chainStatus = await checkChainHealth();
  } catch (err) {
    logger.warn('Chain health check failed', { error: err.message || err });
    chainStatus = { status: 'down', error: err.message || 'chain unavailable' };
  }

  let dbStatus = 'ok';
  try {
    dbStatus = mongoose.connection.readyState === 1 ? 'ok' : 'disconnected';
  } catch (dbErr) {
    dbStatus = 'error';
  }

  let redisStatus = 'ok';
  try {
    if (global.redisClient) {
      await global.redisClient.ping();
      redisStatus = 'ok';
    } else {
      redisStatus = 'not_configured';
    }
  } catch (redisErr) {
    redisStatus = 'error';
  }

  const overallStatus = chainStatus.status === 'ok' && dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';
  return res.status(overallStatus === 'ok' ? 200 : 503).json({
    status: overallStatus,
    backend: 'ok',
    chain: chainStatus,
    database: { status: dbStatus },
    redis: { status: redisStatus }
  });
});

// Readiness probe - checks if service can accept traffic
app.get('/api/ready', async (req, res) => {
  try {
    // Check if blockchain is responding
    const chainStatus = await checkChainHealth();
    if (chainStatus.status === 'stale') {
      return res.status(503).json({ status: 'not_ready', reason: 'blockchain_stale', blockAgeMs: chainStatus.blockAgeMs });
    }
    if (chainStatus.status !== 'ok') {
      return res.status(503).json({ status: 'not_ready', reason: 'blockchain_unavailable' });
    }

    // Check database
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: 'not_ready', reason: 'database_unavailable' });
    }

    return res.json({ status: 'ready' });
  } catch (err) {
    return res.status(503).json({ status: 'not_ready', reason: err.message });
  }
});

// Liveness probe - checks if service is running
app.get('/api/live', (req, res) => {
  res.json({ status: 'alive' });
});

app.get('/api', (req, res) => res.json({
  status: 'ok',
  version: process.env.npm_package_version || '0.1.0',
  routes: ['/api/auth', '/api/vault', '/api/tx', '/api/market', '/api/send', '/api/blockchain', '/api/blockchain/tx', '/api/mallwallet', '/metrics'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/vault', maintenanceGuard('vault'), vaultRoutes);
app.use('/api/tx', txRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/fx', fxRoutes);
app.use('/api/send', maintenanceGuard('send'), sendRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/blockchain/tx', blockchainTxRoutes);
app.use('/api/wallets', walletsRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/walletConnection', walletConnectionRoutes);
app.use('/api/wallet', walletCreationRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/mallpoints', mallpointsRoutes);
app.use('/api/notifications', notificationsRoutes);
const referralsRoutes = require('./routes/referrals');
app.use('/api/referrals', referralsRoutes);
const marketplaceEscrowRoutes = require('./routes/marketplace');
app.use('/api/marketplace', maintenanceGuard('marketplace'), marketplaceEscrowRoutes);
const messagingRoutes = require('./routes/messaging');
app.use('/api/messaging', messagingRoutes);
app.use('/api/payment', maintenanceGuard('payment'), paymentRoutes);
app.use('/api/buy', maintenanceGuard('buy'), buyRoutes);
const badgeRoutes = require('./routes/badge');
app.use('/api/badge', maintenanceGuard('badge'), badgeRoutes);
const withdrawRoutes = require('./routes/withdraw');
app.use('/api/withdraw', maintenanceGuard('withdraw'), withdrawRoutes);
const withdrawalAmlRoutes = require('./routes/withdrawalAml');
app.use('/api/withdrawals/aml', maintenanceGuard('withdraw'), withdrawalAmlRoutes);
app.use('/api/staking', maintenanceGuard('staking'), stakingRoutes);
app.use('/api/key-vault', maintenanceGuard('key-vault'), keyVaultRoutes);
app.use('/api/dex', maintenanceGuard('dex'), dexRoutes);
app.use('/api/validators', validatorsRoutes);
app.use('/api/onchain', onchainRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/faucet', faucetRoutes);
// /api/treasury and /api/invite were removed: both were unauthenticated
// duplicates of real, properly-gated functionality — treasury operations
// already exist correctly under /api/admin/treasury/* (requireAdmin +
// audit logging), and invite/claim had no legitimate equivalent, no
// frontend caller, and let anyone farm real Mallcoin payouts by creating
// and immediately claiming their own invite with zero auth.
const minesRoutes = require('./routes/mines');
app.use('/api/mines', minesRoutes);
app.use('/api/admin', adminPanelRoutes);
// Public read of maintenance status — separate from /api/admin/maintenance
// (which requires admin auth) because regular, unauthenticated users need
// this to show a real banner and disable paused actions.
app.use('/api/maintenance', maintenanceStatusRoutes);
const taskAssignmentRoutes = require('./routes/taskAssignment');
app.use('/api/task-assignment', taskAssignmentRoutes);

const economyRoutes = require('./routes/economy');
app.use('/api/economy', economyRoutes);
const eduRoutes = require('./routes/edu');
app.use('/api/edu', eduRoutes);
const mallwalletRoutes = require('./routes/mallwallet');
app.use('/api/mallwallet', mallwalletRoutes);
// Mallwallet integrations (moved from separate project)
const mallwalletTreasury = require('./mallwallet/routes/treasury');
app.use('/api/mallwallet/treasury', mallwalletTreasury);

// Transaction routes and explorer
const transactionsRoutes = require('./routes/transactions')
const explorerRoutes = require('./routes/explorer')
app.use('/api/transactions', transactionsRoutes)

// C6: Explorer route consolidation / proxy.
//
// There are two possible explorer backends:
//   A) The in-process Express routes in routes/explorer.js (local, MongoDB,
//      no Postgres or indexer dependency). These are ALWAYS mounted under
//      /api/explorer so basic explorer functionality works out of the box.
//   B) A dedicated standalone Explorer + Indexer backend (uses Postgres —
//      see the POSTGRES_* / EXPLORER_* env block in the root .env.example)
//      which ships heavyweight features: block indexing, EVM events,
//      tx search, validator monitoring, etc.
//
// When EXPLORER_ENABLED=true and EXPLORER_BACKEND_URL is configured, we
// proxy /api/explorer/* sub-routes that the local backend doesn't handle
// (or all of them, per EXPLORER_PROXY_ALL) to the standalone backend.
// This lets clients hit a single URL (the main backend) rather than
// managing a separate host/port for the indexer.
const EXPLORER_ENABLED = process.env.EXPLORER_ENABLED === 'true'
const EXPLORER_BACKEND_URL = (process.env.EXPLORER_BACKEND_URL || '').replace(/\/$/, '')
const EXPLORER_PROXY_PREFIX = process.env.EXPLORER_PROXY_PREFIX || '/api/explorer'
const EXPLORER_PROXY_ALL = process.env.EXPLORER_PROXY_ALL === 'true'

if (EXPLORER_ENABLED && EXPLORER_BACKEND_URL) {
  logger.info(
    'Explorer proxy configured',
    { EXPLORER_BACKEND_URL, EXPLORER_PROXY_PREFIX, EXPLORER_PROXY_ALL },
  )
}

// Verified live against a real explorer/backend instance: this used to list
// the paths that should be PROXIED (blocks, stats, account, liquidity-pools,
// ...) rather than the ones routes/explorer.js actually implements
// (/latest, /block/:height, /tx/:hash) — the exact inverse of what the
// comment above it described. Since Set.has() does exact string equality,
// it also could never have matched a real request path against a
// ":param"-shaped entry anyway. Net effect: every one of those listed paths
// was falling through to the proxy handler's "treat as local, skip
// proxying" branch with no local route left to catch it, so it 404'd
// instead of reaching the real indexer. isExplorerLocalPath() checks the
// paths routes/explorer.js genuinely handles, with real pattern matching for
// the two dynamic ones.
function isExplorerLocalPath(subPath) {
  if (subPath === '/latest') return true
  if (/^\/block\/[^/]+$/.test(subPath)) return true
  if (/^\/tx\/[^/]+$/.test(subPath)) return true
  return false
}

// Mount local explorer FIRST so the proxy doesn't shadow routes that the
// local backend already handles natively.
app.use(EXPLORER_PROXY_PREFIX, explorerRoutes)

// Only install the proxy forwarder when the standalone backend is
// configured. Use the existing axios dep (no http-proxy-middleware added
// as a new dependency) to keep the dependency tree minimal.
if (EXPLORER_ENABLED && EXPLORER_BACKEND_URL) {
  const EXPLORER_PROXY_TIMEOUT = Number(process.env.EXPLORER_PROXY_TIMEOUT_MS || 15000)
  // 3 consecutive upstream failures → enter 5-minute cool-off, returning an
  // HTTP 503 `explorer_down` immediately instead of hammering the backend
  // through the full 15s timeout on every request. Any successful request
  // during the non-open window resets the failure counter.
  const circuit = {
    failures: 0,
    threshold: 3,
    cooloffMs: 5 * 60 * 1000,
    openUntil: 0,
  }
  function circuitOpenOrTripped() {
    const now = Date.now()
    if (circuit.openUntil && now < circuit.openUntil) return true
    if (circuit.openUntil) { circuit.openUntil = 0; circuit.failures = 0; }
    return false
  }
  function markFailure() {
    circuit.failures += 1
    if (circuit.failures >= circuit.threshold) {
      circuit.openUntil = Date.now() + circuit.cooloffMs
      logger.warn('Explorer proxy circuit breaker OPEN', {
        failures: circuit.failures,
        cooloffMs: circuit.cooloffMs,
        nextRetryAt: new Date(circuit.openUntil).toISOString(),
      })
    }
  }
  function markSuccess() {
    circuit.failures = 0
    circuit.openUntil = 0
  }

  app.use(`${EXPLORER_PROXY_PREFIX}`, async (req, res, next) => {
    const subPath = req.path.startsWith('/') ? req.path : `/${req.path}`
    if (!EXPLORER_PROXY_ALL && isExplorerLocalPath(subPath)) {
      return next()
    }

    if (circuitOpenOrTripped()) {
      const retryAfterSecs = Math.max(1, Math.ceil((circuit.openUntil - Date.now()) / 1000))
      res.set('Retry-After', String(retryAfterSecs))
      return res.status(503).json({
        code: 'EXPLORER_DOWN',
        status: 'not_ready',
        message: 'Explorer backend circuit breaker is open; retry after cool-off',
        path: subPath,
        retryAfterMs: circuit.openUntil - Date.now(),
      })
    }

    try {
      // Forward the FULL prefixed path (not the mount-relative subPath) —
      // explorer/backend/server.js mounts its own routes under
      // EXPLORER_PROXY_PREFIX too (`app.use('/api/explorer', explorerRoutes)`),
      // so stripping the prefix here made every proxied request 404 upstream.
      // Verified live: a real explorer/backend instance on 4100 answers
      // `/api/explorer/blocks` but not bare `/blocks`.
      const upUrl = `${EXPLORER_BACKEND_URL}${EXPLORER_PROXY_PREFIX}${subPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`
      const upstream = await axios.request({
        method: req.method,
        url: upUrl,
        data: Object.keys(req.body || {}).length ? req.body : undefined,
        params: req.query,
        headers: {
          'accept': req.headers.accept || 'application/json',
          'x-request-id': req.id || '',
          'x-forwarded-for': req.ip || '',
          'x-forwarded-host': req.hostname || '',
        },
        timeout: EXPLORER_PROXY_TIMEOUT,
        validateStatus: () => true,
        responseType: 'arraybuffer',
      })
      const upstream5xx = upstream.status >= 500 && upstream.status < 600
      if (upstream5xx) {
        markFailure()
      } else {
        markSuccess()
      }
      if (upstream.headers['content-type']) {
        res.setHeader('content-type', upstream.headers['content-type'])
      }
      return res.status(upstream.status).send(upstream.data)
    } catch (proxyErr) {
      markFailure()
      logger.error(
        'Explorer proxy upstream failed',
        { path: subPath, error: proxyErr.message, circuitFailures: circuit.failures },
      )
      if (circuit.openUntil) {
        const retryAfterSecs = Math.max(1, Math.ceil((circuit.openUntil - Date.now()) / 1000))
        res.set('Retry-After', String(retryAfterSecs))
        return res.status(503).json({
          code: 'EXPLORER_DOWN',
          status: 'not_ready',
          message: 'Explorer backend unreachable and circuit breaker opened',
          upstream: EXPLORER_BACKEND_URL,
          path: subPath,
          detail: proxyErr.message || String(proxyErr),
          retryAfterMs: circuit.openUntil - Date.now(),
        })
      }
      return res.status(502).json({
        error: 'Explorer backend unreachable',
        upstream: EXPLORER_BACKEND_URL,
        path: subPath,
        detail: proxyErr.message || String(proxyErr),
      })
    }
  })
}

// Previously-written but unmounted routes: registering existing, already-
// implemented handlers — no new backend logic.
app.use('/api/contracts', contractsRoutes);
app.use('/api/devhub', devhubRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/address', addressMapRoutes);
app.use('/api/search', limiters.standard, searchRoutes);

// Global error handling middleware
app.use(errorHandler())

function checkRedisAvailable(host, port, timeoutMs = 2000) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    const onDone = available => {
      socket.destroy()
      resolve(available)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => onDone(true))
    socket.once('timeout', () => onDone(false))
    socket.once('error', () => onDone(false))

    socket.connect(port, host)
  })
}

async function startBackgroundWorkers() {
  try {
    const redisHost = config.redis.host
    const redisPort = config.redis.port
    const redisReady = await checkRedisAvailable(redisHost, redisPort)

    if (!redisReady) {
      logger.warn('Redis is unavailable; background workers will remain disabled')
      return
    }

    require('./mallwallet/workers/transactionWorker');
    require('./workers/transactionWorker');
    require('./mallwallet/workers/paymentCallbackWorker');
    // C2: Mallpoints convert-flow liquidity dead-letter outbox worker.
    // Retries pool liquidity adds that failed after a successful creditMlcns.
    // After 3 exponential retries, failed jobs are written to the Mongo
    // convert_dead_letters collection for operator remediation (the user's
    // MLCNS credit never rolls back post-success, so we can't silently drop).
    require('./mallwallet/workers/convertLiquidityWorker');
    // Recurring scan releasing withdrawals held in queued_liquidity once
    // the MLCN/KES pool's reserve recovers enough to cover them — see
    // withdrawalLiquidityQueueService.js. Schedules its own repeatable job.
    require('./mallwallet/workers/withdrawalLiquidityWorker');
    logger.info('Background workers started')
  } catch (err) {
    logger.warn('Background workers were not started', { error: err.message || err })
  }
}

// Prometheus metrics endpoint. There used to be a SECOND, identical
// app.get('/metrics', ...) registered much earlier in this file (using only
// `register` from utils/metrics) — Express matches routes in registration
// order and that earlier handler never called next(), so it silently won
// every request: /metrics was served with NO auth at all, and this
// apiKeyAuth-gated handler was dead code that never ran. Requiring
// mallwallet/monitoring/prometheus registers marketplace_tx_job_status_total
// onto this same shared registry (see that file) — it no longer keeps its
// own separate one, so there's nothing left to merge.
try {
  require('./mallwallet/monitoring/prometheus');
  app.get('/metrics', apiKeyAuth.metrics, async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
} catch (err) {
  logger.warn('Prometheus monitoring not available', { error: err.message || err });
}

app.get('/api/protected', require('./middleware/auth'), (req, res) => {
  res.json({ msg: 'protected', user: req.user });
});

// Browser CSP/HSTS violation report endpoint. Helmet registers `reportUri:
// /csp-report` on the CSP directives above, which sends a POST every time a
// directive is violated. Without this handler the browser calls fire into a
// 404 (defeating the purpose of having a report URI) — and without the
// dedupe below a single user running a Chrome extension that CSP blocks
// would hammer this endpoint at 100+/sec and blow up our backend counter.
// Must be registered BEFORE helmet's `reportOnly` or after the directives.
app.post('/csp-report', express.json({ limit: '128kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] }), (req, res) => {
  try {
    const body = req.body || {};
    const report = body['csp-report'] || body[0]?.body || body;
    if (report && typeof report === 'object') {
      recordCspViolation({
        blockedUri: report['blocked-uri'] || report.blocked_uri || report.blockedUri,
        violatedDirective: report['violated-directive'] || report.violated_directive || report.violatedDirective,
        documentUri: report['document-uri'] || report.document_uri || report.documentUri,
      });
    }
  } catch (_err) {
    // A malformed report from a weird browser should never produce a 5xx on
    // our side; we simply discard it.
  }
  res.status(204).end();
});

async function start() {
  const mongo = config.mongoUri;
  mongoose.set('strictQuery', false);
  // autoIndex builds/checks every schema index on every connect — safe and
  // convenient in dev, but a real production data volume turns that into an
  // unpredictable startup-time (and, if a new index is ever added on
  // deploy, mid-traffic) collection scan. Index changes there should be a
  // deliberate migration step, not an implicit side effect of restarting.
  // TLS was previously not supported at all here (production-readiness E3)
  // — not just left off, there was no option to turn it on. Disabled by
  // default so local dev against a plain mongod keeps working; a
  // mongodb+srv:// Atlas URI already implies TLS on its own, but a
  // self-hosted TLS-enabled mongod (or a plain mongodb:// Atlas-style URI)
  // needs this explicitly. MONGO_TLS_CA_FILE is for a self-signed or
  // private-CA server; omit it to verify against the system trust store.
  const mongoTlsOptions = String(process.env.MONGO_TLS).toLowerCase() === 'true'
    ? {
      tls: true,
      tlsCAFile: process.env.MONGO_TLS_CA_FILE || undefined,
      tlsCertificateKeyFile: process.env.MONGO_TLS_CERT_KEY_FILE || undefined,
      tlsAllowInvalidCertificates: String(process.env.MONGO_TLS_ALLOW_INVALID_CERTIFICATES).toLowerCase() === 'true',
    }
    : {};

  try {
    await mongoose.connect(mongo, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
      autoIndex: !config.isProduction,
      ...mongoTlsOptions,
    });
    logger.info('Mongo connected', { mongo });
    await initializeDefaultBurnPolicies();
    await initializeDefaultDynamicThresholds();
  } catch (err) {
    logger.warn('MongoDB unavailable; starting server in degraded mode', { error: err.message || err });
  }

  // global.redisClient backs both /api/health's Redis check and the cache
  // service below — previously neither was ever wired to a real client, so
  // /api/health always reported Redis as "not_configured" regardless of
  // whether it was actually running, and the cache service never
  // initialized at all. Redis is also what BullMQ (faucet cooldowns,
  // background jobs) and the auth cache use for state shared across
  // instances, so — unlike Mongo above — treat it as required, not
  // optional, in production: a Redis-less prod deployment silently falls
  // back to per-instance in-memory state for all of that.
  try {
    // getConnection() is a lazyConnect + enableOfflineQueue:false singleton
    // also used by BullMQ elsewhere — with both of those set, a command
    // issued before the socket is actually open is rejected outright
    // instead of queued, so .connect() must be awaited explicitly first.
    // Skip it if something else already started connecting (races the
    // "already connecting/connected" rejection) and just verify readiness
    // with ping either way.
    global.redisClient = require('./mallwallet/queue/redis')();
    if (global.redisClient.status === 'wait') {
      await global.redisClient.connect();
    }
    await global.redisClient.ping();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable at startup', { error: err.message || err });
    if (config.isProduction) {
      logger.error('Redis is required in production (shared BullMQ/faucet/auth-cache state) — refusing to start without it.');
      process.exit(1);
    }
  }

  // Initialize Redis cache service if Redis is available
  if (global.redisClient) {
    try {
      initCacheService(global.redisClient);
      logger.info('Redis cache service initialized');
    } catch (err) {
      logger.warn('Failed to initialize cache service', { error: err.message });
    }
  }

  // Task 5.1-5.12: Socket.IO Real-Time Communication Setup
// 
// Socket.IO provides WebSocket connection for real-time updates:
// - Wallet balance changes
// - New blocks mined
// - Market activity
// - Price updates
//
// Connection flow:
// 1. Frontend connects to backend Socket.IO server on app startup
// 2. Socket.IO handles fallback to polling if WebSocket unavailable
// 3. Backend broadcasts events to subscribed rooms (e.g., wallet:address)
// 4. Frontend listens on event listeners to update UI
//
// Room isolation:
// - Each wallet address gets its own room (wallet:mall1abc...)
// - Multiple clients can subscribe to same wallet
// - Server broadcasts wallet:update only to subscribed clients
// - Prevents unauthorized access to other wallets' data
const server = http.createServer(app)
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean)
const io = new Server(server, {
  // CORS configuration for Socket.IO connections
  // Must match frontend origin to allow WebSocket handshake
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Support both WebSocket and HTTP long-polling transports
  // Polling fallback ensures connections work even with restrictive proxies
  transports: ['websocket', 'polling']
})

global.io = io

// Decodes a JWT if the client sent one (socket.handshake.auth.token) and
// attaches the user id to socket.data.userId — non-blocking, so anonymous
// connections still work for the genuinely public feeds (market/price/
// blocks). Per-room subscription handlers below are what actually enforce
// ownership for anything wallet/user/conversation-specific; previously they
// only validated that the requested id/address was well-formed, not that
// the connecting socket had any right to it — any client that knew (or
// guessed a format-valid) address/id could subscribe to another account's
// balance updates, notifications, or private messages.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      socket.data.userId = decoded.userId || decoded.id
    } catch (err) {
      logger.warn('Socket JWT verification failed', { socketId: socket.id, error: err.message })
    }
  }
  next()
})

// Task 5.1: Main connection handler for new Socket.IO clients
// Per-socket cap on total joined rooms, across every subscription type
// (wallet/market/price/blocks/user/conversation). Wallet subscriptions are
// already limited to one (the caller's own address) by the ownership check
// below, but per-conversation subscriptions have no such natural ceiling —
// a socket left open across many chat threads could otherwise accumulate
// rooms indefinitely.
const MAX_ROOMS_PER_SOCKET = 20

function joinRoomWithCap(socket, room) {
  if (socket.rooms.has(room)) return true // already joined, not a new room
  if (socket.rooms.size >= MAX_ROOMS_PER_SOCKET) {
    socketRoomCapRejectionsTotal.inc()
    logger.warn('Socket room cap exceeded', { socketId: socket.id, room, roomCount: socket.rooms.size })
    socket.emit('error', { message: 'Too many active subscriptions on this connection' })
    return false
  }
  socket.join(room)
  return true
}

io.on('connection', socket => {
  logger.info('Socket connected', { socketId: socket.id })

  // Send initial connection message to notify client of successful connection
  // Timestamp helps detect connection delays in real-time debug scenarios
  socket.emit('system', {
    message: 'Connected to Mallcoin realtime network',
    timestamp: Date.now()
  })

  // Task 5.3: Handle wallet subscription requests
  // Clients emit 'subscribe:wallet' with their address to receive balance updates
  socket.on('subscribe:wallet', async (address) => {
    // Task 8.7: Validate wallet address before allowing subscription
    // Prevents malformed subscriptions from filling server memory or causing errors
    if (!address || typeof address !== 'string') {
      logger.warn('Invalid wallet subscription attempt', { socketId: socket.id, address })
      socket.emit('error', { message: 'Invalid wallet address format' })
      return
    }

    // Validate Mallchain address format: mall1<38-58 lowercase alphanumeric>
    // Format requirement prevents subscription to arbitrary room names
    // Malformed addresses like "mail1abc" or "mall1ABC" are rejected
    const addressPattern = /^mall1[a-z0-9]{38,58}$/
    if (!addressPattern.test(address)) {
      logger.warn('Invalid wallet address format', { socketId: socket.id, address })
      socket.emit('error', { message: 'Invalid wallet address: must be mall1...' })
      return
    }

    // Ownership check: a valid-looking address alone used to be enough to
    // join the room and receive that wallet's live balance updates.
    if (!socket.data.userId) {
      logger.warn('Unauthenticated wallet subscription attempt', { socketId: socket.id, address })
      socket.emit('error', { message: 'Sign in required to subscribe to wallet updates' })
      return
    }
    const owner = await User.findById(socket.data.userId).select('walletAddress')
    if (!owner || owner.walletAddress !== address) {
      logger.warn('Wallet subscription address mismatch', { socketId: socket.id, userId: socket.data.userId, address })
      socket.emit('error', { message: 'You can only subscribe to your own wallet' })
      return
    }

    // Add socket to named room
    // Socket.IO automatically handles room broadcast (e.g., io.to('wallet:address').emit())
    if (!joinRoomWithCap(socket, `wallet:${address}`)) return
    logger.info('Socket subscribed to wallet', { socketId: socket.id, address })

    // Task 5.6: Send cached wallet data if available
    // Prevents initial UI flicker by providing immediate data
    // walletSyncService maintains cache of recent wallet states
    const cached = walletSyncService.getCachedWallet(address)
    if (cached) {
      socket.emit('wallet:update', cached)
    }
  })

  // Task 5.4: Handle wallet unsubscription requests
  // Clients emit 'unsubscribe:wallet' when leaving a wallet view
  socket.on('unsubscribe:wallet', (address) => {
    // Task 8.7: Validate wallet address before unsubscribing
    // Same validation as subscribe to prevent room injection
    if (!address || typeof address !== 'string') {
      logger.warn('Invalid wallet unsubscribe attempt', { socketId: socket.id, address })
      return
    }

    const addressPattern = /^mall1[a-z0-9]{38,58}$/
    if (!addressPattern.test(address)) {
      logger.warn('Invalid wallet address format for unsubscribe', { socketId: socket.id, address })
      return
    }

    // Remove socket from room - stops receiving updates for this wallet
    socket.leave(`wallet:${address}`)
    logger.info('Socket unsubscribed from wallet', { socketId: socket.id, address })
  })

  // Task 5.5: Market feed subscription
  // All clients subscribe to single "market:feed" room for market-wide updates
  socket.on('subscribe:market', () => {
    if (!joinRoomWithCap(socket, 'market:feed')) return
    // Send recent market events to new subscriber
    socket.emit('market:feed', marketFeed.getRecentEvents(50))
  })

  // Task 5.5: Price updates subscription
  // All clients subscribe to "price:updates" room for price data
  socket.on('subscribe:price', () => {
    if (!joinRoomWithCap(socket, 'price:updates')) return
    // Send current market prices to new subscriber
    socket.emit('price:current', priceEngine.getMarketData())
  })

  // Task 5.5: Live blocks subscription
  // All clients subscribe to "blocks:live" room for new blockchain blocks
  socket.on('subscribe:blocks', () => {
    if (!joinRoomWithCap(socket, 'blocks:live')) return
    logger.info('Socket subscribed to block updates', { socketId: socket.id })
  })

  // Per-user notification subscription — mirrors the wallet room pattern.
  // Clients emit 'subscribe:user' with their Mongo user id to receive
  // live 'notification' events (see services/notify.js).
  socket.on('subscribe:user', (userId) => {
    if (!userId || typeof userId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      logger.warn('Invalid user subscription attempt', { socketId: socket.id, userId })
      return
    }
    // A well-formed Mongo id was previously enough to join another
    // account's notification room — this only allows subscribing to your
    // own, verified via the JWT decoded in io.use() above.
    if (!socket.data.userId || socket.data.userId !== userId) {
      logger.warn('User subscription id mismatch', { socketId: socket.id, authedUserId: socket.data.userId, requestedUserId: userId })
      return
    }
    if (!joinRoomWithCap(socket, `user:${userId}`)) return
    logger.info('Socket subscribed to user notifications', { socketId: socket.id, userId })
  })

  socket.on('unsubscribe:user', (userId) => {
    if (!userId || typeof userId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(userId)) return
    socket.leave(`user:${userId}`)
  })

  // Per-conversation messaging subscription — joined while a chat thread is
  // open so both participants receive 'message:new' pushes in real time.
  socket.on('subscribe:conversation', async (conversationId) => {
    if (!conversationId || typeof conversationId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      logger.warn('Invalid conversation subscription attempt', { socketId: socket.id, conversationId })
      return
    }
    // A well-formed conversation id used to be enough to receive both
    // participants' live messages — now requires actually being one of them.
    if (!socket.data.userId) {
      logger.warn('Unauthenticated conversation subscription attempt', { socketId: socket.id, conversationId })
      return
    }
    const convo = await Conversation.findOne({ _id: conversationId, participants: socket.data.userId }).select('_id')
    if (!convo) {
      logger.warn('Conversation subscription denied — not a participant', { socketId: socket.id, userId: socket.data.userId, conversationId })
      return
    }
    if (!joinRoomWithCap(socket, `conversation:${conversationId}`)) return
    logger.info('Socket subscribed to conversation', { socketId: socket.id, conversationId })
  })

  socket.on('unsubscribe:conversation', (conversationId) => {
    if (!conversationId || typeof conversationId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(conversationId)) return
    socket.leave(`conversation:${conversationId}`)
  })

  // Task 5.1: Handle socket disconnection
  // Cleanup: Socket.IO automatically removes socket from all rooms
  socket.on('disconnect', () => {
    logger.info('Socket disconnected', { socketId: socket.id })
  })

  // Handle socket errors
  // Logs errors for debugging connection issues
  socket.on('error', (error) => {
    socketErrorsTotal.inc()
    logger.error('Socket error', { socketId: socket.id, error })
  })
})

  server.listen(PORT);
  logger.info('Server listening', { port: PORT });
  
  // Start background workers (non-blocking)
  startBackgroundWorkers().catch(err => logger.error('Background workers failed', { error: err }));
  
  // Start blockchain event listener (pulls from RPC)
  const stopBlockListener = startBlockListener()

  // Daily volume reset
  setInterval(() => {
    priceEngine.resetDailyVolume()
    logger.info('Daily volume reset')
  }, 24 * 60 * 60 * 1000)

  // Monthly badge snapshot (14th of each month, see jobs/badgeSnapshot.js).
  // Not Redis-gated like startBackgroundWorkers() above — it's a plain
  // node-cron schedule, and the streak check it depends on already
  // degrades gracefully (reads as "no badge") when Redis is unavailable.
  require('./jobs/badgeSnapshot').start();

  // Auto-tops-up the operator wallet's gas balance from the treasury before
  // it runs dry (see jobs/operatorStakeWatcher.js) — badge issuance,
  // Mallpoints awards, and EDU chain anchoring all sign with the operator
  // key and fail together the moment it hits zero.
  require('./jobs/operatorStakeWatcher').start();

  // Claims the treasury's staking rewards (x/mint inflation via
  // x/distribution) back into its liquid balance — see
  // jobs/treasuryRewardsSweeper.js. This is what makes the treasury a real
  // ongoing source of stake in production rather than something that only
  // ever depletes. No-ops harmlessly until scripts/delegate-treasury.js has
  // bonded some treasury stake to a validator.
  require('./jobs/treasuryRewardsSweeper').start();

  // Cleanup on shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...')
    if (stopBlockListener) stopBlockListener()
    process.exit(0)
  })
}

start().catch(err => { logger.error('Server startup failed', { error: err }); process.exit(1); });
