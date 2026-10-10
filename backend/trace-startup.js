require('dotenv').config();
console.log('[TRACE] 1. dotenv loaded');

const mongoose = require('mongoose');
console.log('[TRACE] 2. mongoose loaded');

const { config } = require('./src/config');
console.log('[TRACE] 3. config loaded');

const { initCacheService } = require('./src/services/cacheService');
console.log('[TRACE] 4. cacheService loaded');

// Simulate start() function
async function start() {
  console.log('[TRACE] 5. start() called');
  
  const mongo = config.mongoUri;
  mongoose.set('strictQuery', false);
  console.log('[TRACE] 6. mongoose configured');
  
  try {
    console.log('[TRACE] 7. Attempting MongoDB connection to:', mongo);
    await mongoose.connect(mongo, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
      autoIndex: !config.isProduction,
    });
    console.log('[TRACE] 8. MongoDB connected successfully');
  } catch (err) {
    console.log('[TRACE] 8b. MongoDB connection failed (OK in degraded mode):', err.message);
  }

  console.log('[TRACE] 9. Attempting Redis connection');
  try {
    global.redisClient = require('./src/mallwallet/queue/redis')();
    console.log('[TRACE] 10. Redis client created');
    
    if (global.redisClient.status === 'wait') {
      console.log('[TRACE] 11. Connecting to Redis...');
      await global.redisClient.connect();
      console.log('[TRACE] 12. Redis connected');
    }
    
    console.log('[TRACE] 13. Pinging Redis...');
    await global.redisClient.ping();
    console.log('[TRACE] 14. Redis ping successful');
  } catch (err) {
    console.log('[TRACE] 14b. Redis failed:', err.message);
    if (config.isProduction) {
      console.error('[TRACE] Redis required in production, exiting');
      process.exit(1);
    }
  }

  console.log('[TRACE] 15. start() function complete');
}

start().catch(err => {
  console.error('[TRACE] start() threw error:', err.message);
  console.error(err.stack);
  process.exit(1);
}).then(() => {
  console.log('[TRACE] 16. Everything done, exiting');
  process.exit(0);
});

setTimeout(() => {
  console.log('[TRACE] TIMEOUT - still running after 10 seconds');
}, 10000);
