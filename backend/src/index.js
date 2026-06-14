require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const { config, getAllowedOrigins, validateRuntimeSecrets } = require('./config');
const passport = require('passport');
const session = require('express-session');
const { createLimiter } = require('./middleware/rateLimiter')
const apiKeyAuth = require('./middleware/apiKeyAuth')
const { errorHandler } = require('./utils/errorHandler')
const logger = require('./utils/logger')

const authRoutes = require('./routes/auth');
const vaultRoutes = require('./routes/vault');
const txRoutes = require('./routes/tx');
const marketRoutes = require('./routes/market');
const sendRoutes = require('./routes/send');
const blockchainRoutes = require('./routes/blockchain');
const blockchainTxRoutes = require('./routes/blockchainTx');
const walletsRoutes = require('./routes/wallets');
const { startBlockchainListener } = require('./services/blockchainListener');
const walletConnectionRoutes = require('./routes/walletConnection');
const governanceRoutes = require('./routes/governance');
const liquidityRoutes = require('./routes/liquidity');
const mallpointsRoutes = require('./routes/mallpoints');
const notificationsRoutes = require('./routes/notifications');
const paymentRoutes = require('./routes/payment');
const buyRoutes = require('./routes/buy');
const stakingRoutes = require('./routes/staking');
const validatorsRoutes = require('./routes/validators');
const onchainRoutes = require('./routes/onchain');
const inviteRoutes = require('./routes/invite');
const historyRoutes = require('./routes/history');
const faucetRoutes = require('./routes/faucet');
const treasuryRoutes = require('./routes/treasury');
const axios = require('axios');

const http = require('http')
const net = require('net')
const { Server } = require('socket.io')

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

if (!JWT_SECRET) console.warn('JWT_SECRET is not configured; authentication tokens are insecure.');
if (!SESSION_SECRET) console.warn('SESSION_SECRET is not configured; session cookies are insecure.');

app.use(helmet({
  contentSecurityPolicy: config.isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", config.frontendUrl || 'http://localhost:5173'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      }
    : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.disable('x-powered-by');
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
const sanitizeSensitive = require('./middleware/sanitizeSensitive');
app.use(sanitizeSensitive);
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

const apiLimiter = createLimiter({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.txMax,
});

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.logRequest(req, res, duration)
  })
  next()
})
app.use('/api/tx', apiLimiter);
app.use('/api/mallwallet/treasury', apiLimiter);

// Passport for OAuth (Google)
app.use(session({
  secret: SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());
require('./utils/passport');

// Validate critical runtime secrets and configuration early
try {
  if (typeof validateRuntimeSecrets === 'function') validateRuntimeSecrets();
} catch (err) {
  console.error('Runtime secret validation failed:', err.message);
  process.exit(1);
}

const CHAIN_REST = config.chain.rest;

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

  return {
    status: 'ok',
    chainId,
    moniker,
    latestHeight,
    latestBlockTime,
    restEndpoint: base,
    timestamp: new Date().toISOString(),
  };
}

app.get('/api/health', async (req, res) => {
  try {
    const chainStatus = await checkChainHealth();
    return res.json({ status: 'ok', backend: 'ok', chain: chainStatus });
  } catch (err) {
    console.warn('Chain health check failed:', err.message || err);
    return res.status(503).json({ status: 'degraded', backend: 'ok', chain: { status: 'down', error: err.message || 'chain unavailable' } });
  }
});

app.get('/api', (req, res) => res.json({
  status: 'ok',
  version: process.env.npm_package_version || '0.1.0',
  routes: ['/api/auth', '/api/vault', '/api/tx', '/api/market', '/api/send', '/api/blockchain', '/api/blockchain/tx', '/api/mallwallet', '/metrics'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/tx', txRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/send', sendRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/blockchain/tx', blockchainTxRoutes);
app.use('/api/wallets', walletsRoutes);
app.use('/api/walletConnection', walletConnectionRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/mallpoints', mallpointsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/buy', buyRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/validators', validatorsRoutes);
app.use('/api/onchain', onchainRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/faucet', faucetRoutes);
app.use('/api/treasury', treasuryRoutes);
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
      console.warn('Redis is unavailable; background workers will remain disabled')
      return
    }

    require('./mallwallet/workers/transactionWorker');
    require('./workers/transactionWorker');
    console.log('Background workers started')
  } catch (err) {
    console.warn('Background workers were not started:', err.message || err)
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
  console.warn('Prometheus monitoring not available:', err.message || err);
}

app.get('/api/protected', require('./middleware/auth'), (req, res) => {
  res.json({ msg: 'protected', user: req.user });
});

async function start() {
  const mongo = config.mongoUri;
  mongoose.set('strictQuery', false);
  try {
    await mongoose.connect(mongo);
    console.log('Mongo connected to', mongo);
    await initializeDefaultBurnPolicies();
    await initializeDefaultDynamicThresholds();
  } catch (err) {
    console.warn('MongoDB unavailable; starting server in degraded mode:', err.message || err);
  }
  // create HTTP server and Socket.IO for realtime updates
  const server = http.createServer(app)
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  })

  global.io = io

  io.on('connection', socket => {
    console.log('✅ Socket connected:', socket.id)

    // Send initial connection message
    socket.emit('system', {
      message: 'Connected to Mallcoin realtime network',
      timestamp: Date.now()
    })

    // Handle wallet subscription
    socket.on('subscribe:wallet', (address) => {
      socket.join(`wallet:${address}`)
      console.log(`📊 Socket ${socket.id} subscribed to wallet ${address}`)

      // Send current cached wallet data if available
      const cached = walletSyncService.getCachedWallet(address)
      if (cached) {
        socket.emit('wallet:update', cached)
      }
    })

    // Handle wallet unsubscription
    socket.on('unsubscribe:wallet', (address) => {
      socket.leave(`wallet:${address}`)
      console.log(`🚫 Socket ${socket.id} unsubscribed from wallet ${address}`)
    })

    // Handle market feed subscription
    socket.on('subscribe:market', () => {
      socket.join('market:feed')
      socket.emit('market:feed', marketFeed.getRecentEvents(50))
    })

    // Handle price updates subscription
    socket.on('subscribe:price', () => {
      socket.join('price:updates')
      socket.emit('price:current', priceEngine.getMarketData())
    })

    // Handle block updates subscription
    socket.on('subscribe:blocks', () => {
      socket.join('blocks:live')
      console.log(`📦 Socket ${socket.id} subscribed to block updates`)
    })

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected:', socket.id)
    })

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })
  })

  server.listen(PORT, async () => {
    console.log('🚀 Server listening on', PORT);
    
    // Start background workers
    await startBackgroundWorkers()
    
    // Start blockchain event listener (pulls from RPC)
    const stopBlockListener = startBlockListener()

    // Daily volume reset
    setInterval(() => {
      priceEngine.resetDailyVolume()
      console.log('💵 Daily volume reset')
    }, 24 * 60 * 60 * 1000)

    // Cleanup on shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...')
      if (stopBlockListener) stopBlockListener()
      process.exit(0)
    })
  });
}

start().catch(err => { console.error(err); process.exit(1); });
