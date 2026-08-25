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
const { metricsMiddleware, register, socketErrorsTotal, socketRoomCapRejectionsTotal } = require('./utils/metrics')
const { initCacheService } = require('./services/cacheService')
const { maintenanceGuard } = require('./middleware/maintenanceMode')
const { computeBlockStaleness } = require('./utils/chainHealth')

const authRoutes = require('./routes/auth');
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
  app.set('trust proxy', 1);
}

if (!JWT_SECRET) logger.warn('JWT_SECRET is not configured; authentication tokens are insecure.');
if (!SESSION_SECRET) logger.warn('SESSION_SECRET is not configured; session cookies are insecure.');

app.use(helmet({
  contentSecurityPolicy: config.isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", config.frontendUrl || 'http://localhost:5173'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      }
    : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
    force: true,
  } : false,
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
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.isProduction,
    sameSite: 'strict',
    httpOnly: true
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
  try {
    const chainStatus = await checkChainHealth();

    // Check database connectivity
    let dbStatus = 'ok';
    try {
      if (mongoose.connection.readyState === 1) {
        dbStatus = 'ok';
      } else {
        dbStatus = 'disconnected';
      }
    } catch (dbErr) {
      dbStatus = 'error';
    }

    // Check Redis connectivity
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

    const overallStatus = chainStatus.status === 'ok' ? 'ok' : 'degraded';
    return res.status(overallStatus === 'ok' ? 200 : 503).json({
      status: overallStatus,
      backend: 'ok',
      chain: chainStatus,
      database: { status: dbStatus },
      redis: { status: redisStatus }
    });
  } catch (err) {
    logger.warn('Chain health check failed', { error: err.message || err });
    return res.status(503).json({ status: 'degraded', backend: 'ok', chain: { status: 'down', error: err.message || 'chain unavailable' } });
  }
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

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/auth', authRoutes);
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
const taskAssignmentRoutes = require('./routes/taskAssignment');
app.use('/api/task-assignment', taskAssignmentRoutes);

const economyRoutes = require('./routes/economy');
app.use('/api/economy', economyRoutes);
const mallwalletRoutes = require('./routes/mallwallet');
app.use('/api/mallwallet', mallwalletRoutes);
// Mallwallet integrations (moved from separate project)
const mallwalletTreasury = require('./mallwallet/routes/treasury');
app.use('/api/mallwallet/treasury', mallwalletTreasury);

// Transaction routes and explorer
const transactionsRoutes = require('./routes/transactions')
const explorerRoutes = require('./routes/explorer')
app.use('/api/transactions', transactionsRoutes)
app.use('/api/explorer', explorerRoutes)

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
    logger.info('Background workers started')
  } catch (err) {
    logger.warn('Background workers were not started', { error: err.message || err })
  }
}

// Monitoring (Prometheus registry)
try {
  const register = require('./mallwallet/monitoring/prometheus');
  app.get('/metrics', apiKeyAuth, async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
} catch (err) {
  logger.warn('Prometheus monitoring not available', { error: err.message || err });
}

app.get('/api/protected', require('./middleware/auth'), (req, res) => {
  res.json({ msg: 'protected', user: req.user });
});

async function start() {
  const mongo = config.mongoUri;
  mongoose.set('strictQuery', false);
  try {
    await mongoose.connect(mongo);
    logger.info('Mongo connected', { mongo });
    await initializeDefaultBurnPolicies();
    await initializeDefaultDynamicThresholds();
  } catch (err) {
    logger.warn('MongoDB unavailable; starting server in degraded mode', { error: err.message || err });
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

  // Cleanup on shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...')
    if (stopBlockListener) stopBlockListener()
    process.exit(0)
  })
}

start().catch(err => { logger.error('Server startup failed', { error: err }); process.exit(1); });
