# Troubleshooting Guide: Backend-Frontend Integration

## Table of Contents

1. [CORS Errors and Solutions](#cors-errors-and-solutions)
2. [Authentication/Token Issues](#authenticationtoken-issues)
3. [WebSocket Connection Failures](#websocket-connection-failures)
4. [Database Connectivity Problems](#database-connectivity-problems)
5. [Rate Limiting Issues](#rate-limiting-issues)
6. [Performance Problems](#performance-problems)
7. [Debugging Techniques and Tools](#debugging-techniques-and-tools)
8. [Common Error Messages and Resolutions](#common-error-messages-and-resolutions)
9. [Quick Checklist](#quick-checklist)

---

## CORS Errors and Solutions

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header is present"

**Symptoms:**
- Browser console shows CORS policy error
- API requests fail with network error
- Frontend cannot reach backend APIs
- Error appears in browser console, not in network tab response

**Root Causes:**
1. Backend CORS middleware not configured
2. Frontend origin not in allowed origins list
3. Backend not running or unreachable
4. Missing credentials: true flag in CORS configuration
5. Preflight (OPTIONS) request failing

**Solutions:**

**Step 1: Verify Backend is Running**
```bash
# Check if backend is listening on port 4000
lsof -i :4000

# Or test with curl
curl -i http://localhost:4000/api/health
```

**Step 2: Check CORS Configuration in Backend**
```javascript
// backend/src/middleware/cors.ts
import cors from 'cors';

const allowedOrigins = [
  'http://localhost:5173',  // Frontend dev server
  process.env.FRONTEND_URL,  // From .env
];

if (process.env.CORS_ORIGINS) {
  const additional = process.env.CORS_ORIGINS.split(',').map(o => o.trim());
  allowedOrigins.push(...additional);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
```

**Step 3: Verify Environment Variables**
```bash
# In backend/.env, ensure these are set:
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173  # Can be comma-separated list
NODE_ENV=development
```

**Step 4: Check Frontend API Configuration**
```typescript
// mallchain-os-v14/src/config.ts
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
  // Should point to backend, not frontend
};
```

**Step 5: Test Preflight Request**
```bash
# Simulate browser preflight request
curl -X OPTIONS http://localhost:4000/api/wallets \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v
```

Expected response headers should include:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

**Step 6: Production CORS Setup**
```bash
# In backend/.env for production
FRONTEND_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
NODE_ENV=production
```

### Issue: "CORS policy: The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true'"

**Root Cause:** `credentials: true` not set in CORS options

**Solution:**
```javascript
app.use(cors({
  credentials: true,  // Add this line
  origin: 'http://localhost:5173',
}));
```

### Issue: Preflight request fails but actual request works

**Root Cause:** OPTIONS method not handled by Express server

**Solution:**
```javascript
// Ensure CORS middleware is before route handlers
app.use(cors({/* options */}));

// Then define your routes
app.get('/api/...', handler);
```

---

## Authentication/Token Issues

### Issue: "401 Unauthorized: Invalid or expired token"

**Symptoms:**
- Protected API endpoints return 401
- User is logged in but cannot access data
- Token exists in localStorage but doesn't work
- Error appears in browser console after successful login

**Root Causes:**
1. JWT token has expired
2. JWT_SECRET mismatch between login and verification
3. Token format incorrect (missing "Bearer " prefix)
4. Token not passed in Authorization header
5. Backend and frontend JWT_SECRET out of sync

**Solutions:**

**Step 1: Check JWT_SECRET Configuration**
```bash
# Backend: verify JWT_SECRET is set and consistent
cat backend/.env | grep JWT_SECRET

# Should be same across all backend instances
# Must be >= 32 characters for security
```

**Step 2: Verify Token Storage**
```javascript
// In frontend browser console
console.log(localStorage.getItem('token'));
// Should show: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Step 3: Check Token Format in Request Headers**
```bash
# Use browser DevTools Network tab to inspect
# Should see Authorization header:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Or test with curl:
TOKEN=$(cat backend/.env | grep JWT_SECRET)
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/wallets
```

**Step 4: Verify Token Expiration**
```javascript
// Decode token to check expiration (in browser console)
const token = localStorage.getItem('token');
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Token expires at:', new Date(payload.exp * 1000));
console.log('Current time:', new Date());
console.log('Expired?', payload.exp * 1000 < Date.now());
```

**Step 5: Check Backend Auth Middleware**
```javascript
// backend/src/middleware/auth.ts
import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Step 6: Clear and Re-Login**
```javascript
// Frontend: clear corrupted token and login again
localStorage.removeItem('token');
localStorage.removeItem('userId');
// Refresh page and login again
```

### Issue: "Token mismatch" errors after environment change

**Symptoms:**
- Works in development but not after restart
- Works on one machine but not another
- Tokens suddenly become invalid

**Solutions:**
1. Ensure JWT_SECRET is exactly the same in backend/.env
2. Never commit JWT_SECRET to version control
3. Generate strong random secret:
```bash
# Generate secure 32+ character secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue: Frontend stores token but API says "no token"

**Symptoms:**
- localStorage has token
- Authorization header missing in network requests
- API returns "No token provided" error

**Solutions:**

**Check API Service Implementation:**
```typescript
// mallchain-os-v14/src/services/api.ts
export class Api {
  async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const token = localStorage.getItem('token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;  // Ensure this is added
    }
    
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    // Handle 401
    if (response.status === 401) {
      localStorage.removeItem('token');
      // Redirect to login
      window.location.href = '/login';
    }
    
    return response.json();
  }
}
```

---

## WebSocket Connection Failures

### Issue: "WebSocket connection failed" or Socket.IO won't connect

**Symptoms:**
- Console shows connect_error events
- Socket.IO emits error: "Connection refused"
- Real-time updates not working
- No "Connected" message in console

**Root Causes:**
1. Backend Socket.IO server not running
2. Backend port 4000 is blocked by firewall
3. Socket.IO transport misconfigured (missing websocket)
4. CORS not configured for WebSocket
5. Socket.IO version mismatch between client and server

**Solutions:**

**Step 1: Verify Socket.IO Server Running**
```bash
# Backend: check if Socket.IO initialized
grep -n "socket.io\|io()" backend/src/server.ts

# Should see Socket.IO initialization
# Example:
# const io = require('socket.io')(server, {
#   cors: { origin: 'http://localhost:5173' }
# });
```

**Step 2: Check Port Availability**
```bash
# Verify backend is listening on port 4000
netstat -tlnp | grep 4000
# or
lsof -i :4000

# Should show something like:
# node    12345 user  TCP *:4000 (LISTEN)
```

**Step 3: Test WebSocket Connection**
```bash
# Use websocat or npm package
npm install -g websocat

# Test WebSocket endpoint
websocat ws://localhost:4000/socket.io/?EIO=4&transport=websocket
```

**Step 4: Check Socket.IO Configuration**
```javascript
// backend/src/socket.ts
const io = require('socket.io')(server, {
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],  // Must include websocket
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Log connections
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('subscribe:wallet', (address) => {
    console.log(`Subscribe wallet: ${address}`);
    socket.join(`wallet:${address}`);
  });
});
```

**Step 5: Check Frontend Socket Configuration**
```typescript
// mallchain-os-v14/src/services/socket.ts
import { io } from 'socket.io-client';

export const socketManager = {
  connect(url: string) {
    const socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],  // Order matters
    });

    socket.on('connect', () => {
      console.log('Connected to backend');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return socket;
  },
};
```

**Step 6: Check Browser DevTools**
- Open DevTools → Network tab
- Look for WebSocket connection (should show green/connected)
- Check headers: should include Upgrade: websocket
- Check messages tab: should show emitted events

**Step 7: Firewall/Network Issues**
```bash
# Check if port 4000 is blocked
sudo ufw allow 4000  # Linux

# Or on macOS with firewall:
sudo defaults write /Library/Preferences/com.apple.alf allowsignedenabled -bool false
```

### Issue: Socket emits events but client doesn't receive them

**Symptoms:**
- Socket connected successfully
- Backend logs show events emitted
- Frontend doesn't receive updates
- Real-time features don't work

**Solutions:**

**Step 1: Verify Room Subscription**
```javascript
// Frontend: subscribe to room
socket.emit('subscribe:wallet', 'mall1abc123...');

// Backend should log:
// Subscribe wallet: mall1abc123...
// Socket joined room: wallet:mall1abc123...
```

**Step 2: Check Event Listener Registration**
```typescript
// Frontend: register listeners BEFORE subscribing
socket.on('wallet:update', (data) => {
  console.log('Wallet updated:', data);
});

// Then subscribe
socket.emit('subscribe:wallet', address);
```

**Step 3: Verify Backend Broadcast**
```javascript
// Backend: when event occurs, broadcast to room
io.to('wallet:address').emit('wallet:update', {
  address: 'mall1abc123...',
  balances: { mallcoin: 1000 },
  timestamp: Date.now(),
});
```

**Step 4: Enable Socket.IO Debug Logging**
```javascript
// Backend: enable debug mode
const io = require('socket.io')(server, {
  debug: true,  // or
});

// Or in environment:
DEBUG=socket.io:* npm run dev
```

```typescript
// Frontend: enable debug logging
const socket = io(url, {
  reconnection: true,
  // Enable socket.io client debug
});

// In console:
localStorage.debug = 'socket.io-client:*';
```



---

## Database Connectivity Problems

### Issue: "MongoError: connect ECONNREFUSED 127.0.0.1:27017"

**Symptoms:**
- Backend fails to start
- Error: "Failed to connect to MongoDB"
- Backend process exits immediately on startup
- Cannot create collections or queries fail

**Root Causes:**
1. MongoDB server not running
2. MongoDB connection string incorrect in .env
3. MongoDB authentication fails (wrong username/password)
4. MongoDB port blocked by firewall
5. MongoDB not installed

**Solutions:**

**Step 1: Verify MongoDB is Running**
```bash
# Check if MongoDB daemon running
ps aux | grep mongod

# Or start MongoDB
# On macOS with brew:
brew services start mongodb-community

# On Linux with systemctl:
sudo systemctl start mongod

# Or manually:
mongod --dbpath /path/to/data
```

**Step 2: Check Connection String**
```bash
# In backend/.env:
MONGO_URI=mongodb://localhost:27017/marketplace

# Or with authentication:
MONGO_URI=mongodb://username:password@localhost:27017/marketplace?authSource=admin

# Test connection string
mongo "mongodb://localhost:27017/marketplace"
```

**Step 3: Verify MongoDB Service**
```bash
# Connect with mongo client
mongo localhost:27017

# Should show:
# MongoDB server version: x.x.x
# >

# List databases
show dbs

# Exit
exit
```

**Step 4: Check Backend Connection Code**
```javascript
// backend/src/db/mongoose.ts
import mongoose from 'mongoose';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      retryWrites: true,
      w: 'majority',
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
}
```

**Step 5: Check Environment Variables**
```bash
# Verify .env has correct MongoDB connection
cat backend/.env | grep MONGO

# Common issues:
# - Typo in hostname (e.g., "mongo" instead of "localhost")
# - Wrong port (27017 is default)
# - Missing database name
```

**Step 6: Test with MongoDB CLI**
```bash
# Install mongo shell if needed
npm install -g mongodb-cli

# Connect and test
mongo --host localhost --port 27017

# Create test database and collection
use marketplace
db.test.insertOne({ test: true })
db.test.findOne()
```

### Issue: "Redis connection refused" or rate limiting not working

**Symptoms:**
- Rate limiting doesn't work (no 429 responses)
- Cache not working
- Socket.IO adapter fails
- "Could not connect to Redis" error in logs

**Root Causes:**
1. Redis server not running
2. Redis port (6379) blocked
3. Redis connection string incorrect
4. Redis password incorrect (if AUTH required)
5. Redis data corrupted

**Solutions:**

**Step 1: Start Redis**
```bash
# Start Redis server
redis-server

# Or on macOS with brew:
brew services start redis

# Or on Linux:
sudo systemctl start redis-server
```

**Step 2: Check Redis Connection**
```bash
# Connect with redis-cli
redis-cli ping
# Should return: PONG

# Check Redis info
redis-cli info server
```

**Step 3: Verify Backend Redis Config**
```javascript
// backend/src/cache/redis.ts
import redis from 'redis';

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,  // If required
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected');
});
```

**Step 4: Check Rate Limiter Setup**
```javascript
// backend/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from 'redis';

const redisClient = redis.createClient();

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  }),
  windowMs: 60 * 1000,  // 1 minute
  max: 120,  // 120 requests per minute
  standardHeaders: true,  // Return RateLimit-* headers
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

**Step 5: Test Rate Limit**
```bash
# Make multiple requests quickly
for i in {1..150}; do
  curl http://localhost:4000/api/health
  echo "Request $i"
done

# Should see 429 after 120 requests
```

---

## Rate Limiting Issues

### Issue: "429 Too Many Requests"

**Symptoms:**
- After multiple API calls, requests start failing
- Error: "Rate limit exceeded, try again later"
- Affects all endpoints equally
- No differentiation between API endpoint types

**Root Causes:**
1. Rate limit threshold too low for workload
2. Rate limit window too short
3. Multiple frontend instances or background jobs causing high request rate
4. Testing with rapid requests without delay

**Solutions:**

**Step 1: Check Rate Limit Configuration**
```javascript
// backend/src/config/rateLimits.ts
export const rateLimitConfig = {
  general: {
    windowMs: 60 * 1000,  // 1 minute window
    max: 120,  // 120 requests/min = 2 per second
  },
  transactions: {
    windowMs: 60 * 1000,
    max: 40,  // 40 requests/min for /api/tx
  },
  mines: {
    windowMs: 60 * 1000,
    max: 100,  // 100 requests/min for mining endpoints
  },
};

// Apply different limits to different routes
app.use('/api/tx', rateLimiter(rateLimitConfig.transactions));
app.use('/api/mines', rateLimiter(rateLimitConfig.mines));
app.use('/api/', rateLimiter(rateLimitConfig.general));
```

**Step 2: Adjust for Production Load**
```bash
# In backend/.env, add custom rate limits if needed:
RATE_LIMIT_GENERAL_MAX=120
RATE_LIMIT_GENERAL_WINDOW=60
RATE_LIMIT_TX_MAX=40
RATE_LIMIT_TX_WINDOW=60
```

**Step 3: Implement Request Deduplication (Frontend)**
```typescript
// mallchain-os-v14/src/services/api.ts
class Api {
  private pendingRequests = new Map<string, Promise<any>>();

  async get<T>(path: string): Promise<ApiResult<T>> {
    const key = `GET:${path}`;
    
    // Return existing request if one is in flight
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }
    
    const promise = this.doRequest<T>('GET', path);
    this.pendingRequests.set(key, promise);
    
    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  private async doRequest<T>(method: string, path: string): Promise<ApiResult<T>> {
    // Actual request logic
  }
}
```

**Step 4: Implement Retry with Backoff (Frontend)**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<ApiResult<T>>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<ApiResult<T>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fn();
    
    if (result.code !== 429) {
      return result;  // Success or non-rate-limit error
    }
    
    if (attempt < maxRetries - 1) {
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`Rate limited. Retrying after ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return { ok: false, error: 'Rate limit exceeded after retries' };
}
```

**Step 5: Monitor Rate Limit Headers**
```typescript
// Frontend: check rate limit headers in response
const response = await fetch(...);
const remaining = response.headers.get('RateLimit-Remaining');
const resetTime = response.headers.get('RateLimit-Reset');

console.log(`Requests remaining: ${remaining}`);
console.log(`Reset time: ${new Date(parseInt(resetTime) * 1000)}`);
```

---

## Performance Problems

### Issue: "API responses are slow" or "High latency"

**Symptoms:**
- API endpoints taking > 500ms to respond
- UI feels sluggish or unresponsive
- Wallet updates delayed
- Transaction submissions taking too long

**Root Causes:**
1. No database indexes
2. Missing Redis caching
3. Blocking operations on main thread
4. N+1 query problems
5. Unoptimized blockchain RPC calls
6. Large result sets

**Solutions:**

**Step 1: Check Database Indexes**
```javascript
// backend/src/models/Wallet.ts
import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  address: { type: String, required: true, index: true },  // Add index
  balances: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now, index: true },
});

// Ensure indexes exist
walletSchema.index({ address: 1 });
walletSchema.index({ lastUpdated: -1 });
```

**Step 2: Implement Response Caching**
```javascript
// backend/src/middleware/cache.ts
import redis from 'redis';

const redisClient = redis.createClient();

export function cacheMiddleware(ttlSeconds = 300) {
  return async (req, res, next) => {
    const key = `cache:${req.method}:${req.path}`;
    
    // Try cache first
    redisClient.get(key, (err, cached) => {
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      next();
    });
  };
}

// Use in routes:
app.get('/api/validators', cacheMiddleware(60), getValidators);

// Clear cache when data changes:
function invalidateCache(key) {
  redisClient.del(`cache:GET:${key}`);
}
```

**Step 3: Profile Slow Requests**
```javascript
// backend/src/middleware/timing.ts
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {  // Log slow requests
      console.warn(`SLOW: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  
  next();
});
```

**Step 4: Optimize Queries**
```javascript
// BEFORE: N+1 queries
const wallets = await Wallet.find({});
for (const wallet of wallets) {
  wallet.transactions = await Transaction.find({ address: wallet.address });
}

// AFTER: Single query with aggregation
const wallets = await Wallet.aggregate([
  {
    $lookup: {
      from: 'transactions',
      localField: 'address',
      foreignField: 'address',
      as: 'transactions',
    },
  },
]);
```

**Step 5: Enable Frontend Request Caching**
```typescript
// mallchain-os-v14/src/services/api.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CachedApi {
  private cache = new Map<string, CacheEntry<any>>();

  async get<T>(path: string, ttlSeconds = 5): Promise<ApiResult<T>> {
    const cached = this.cache.get(path);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl * 1000) {
      console.log(`Returning cached: ${path}`);
      return { ok: true, data: cached.data };
    }
    
    const result = await this.doFetch<T>('GET', path);
    
    if (result.ok) {
      this.cache.set(path, {
        data: result.data,
        timestamp: Date.now(),
        ttl: ttlSeconds,
      });
    }
    
    return result;
  }

  private async doFetch<T>(method: string, path: string): Promise<ApiResult<T>> {
    // Actual fetch logic
  }
}
```

### Issue: "Frontend bundle size too large"

**Symptoms:**
- Initial page load very slow
- First Contentful Paint (FCP) > 3 seconds
- Bundle size > 500KB (gzipped)
- Poor performance on slow networks

**Solutions:**

**Step 1: Analyze Bundle Size**
```bash
# Install bundle analyzer
npm install --save-dev rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({
      open: true,
      gzipSize: true,
    }),
  ],
};

# Build and analyze
npm run build
# Opens bundle analysis in browser
```

**Step 2: Implement Code Splitting**
```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'socket': ['socket.io-client'],
          'ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
};
```

**Step 3: Lazy Load Heavy Features**
```typescript
// mallchain-os-v14/src/App.tsx
import { lazy, Suspense } from 'react';

const MarketplaceExplorer = lazy(() => import('./pages/MarketplaceExplorer'));
const AdvancedCharts = lazy(() => import('./components/AdvancedCharts'));

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/explorer" element={<MarketplaceExplorer />} />
      </Routes>
    </Suspense>
  );
}
```

**Step 4: Enable Gzip Compression**
```bash
# Verify backend sends gzipped responses
# Check response headers in Network tab
Content-Encoding: gzip
```



---

## Debugging Techniques and Tools

### Browser DevTools

**Network Tab - Inspecting API Requests**
1. Open DevTools (F12)
2. Go to Network tab
3. Make API request
4. Click on request to see:
   - Request headers (including Authorization)
   - Response headers (including CORS headers)
   - Response payload (JSON body)
   - Timing breakdown

**Console Tab - Debugging**
```javascript
// Check configuration
console.log(config);

// Check stored token
console.log(localStorage.getItem('token'));

// Decode JWT token
const token = localStorage.getItem('token');
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log(payload);

// Check Socket.IO connection
console.log(socket.connected);
console.log(socket.id);

// Enable Socket.IO debugging
localStorage.debug = 'socket.io-client:*';
```

**Application Tab - Checking State**
- Local Storage: Check for token, userId, preferences
- Cookies: Verify session cookies if used
- IndexedDB: Check for cached data

### Backend Debugging

**Enable Request Logging**
```javascript
// backend/src/middleware/logging.ts
import morgan from 'morgan';

// Development: detailed logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Production: combined format
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
}

// Custom logging for sensitive endpoints
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});
```

**Enable Debug Logging**
```bash
# Set DEBUG environment variable
DEBUG=marketplace:* npm run dev

# Or for specific modules:
DEBUG=marketplace:api,marketplace:socket npm run dev

# In code:
const debug = require('debug')('marketplace:api');
debug('Request received:', req.method, req.path);
```

**Add Debug Breakpoints**
```javascript
// Use Node.js inspector
node --inspect=0.0.0.0:9229 npm run dev

// Then open: chrome://inspect
// Click "inspect" under Node target
```

**Console Logging Best Practices**
```javascript
// Use structured logging
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'backend',
  endpoint: req.path,
  method: req.method,
  userId: req.user?.userId,
  duration: Date.now() - startTime,
  statusCode: res.statusCode,
}));
```

### Testing API Endpoints

**Using cURL**
```bash
# Test CORS with preflight
curl -X OPTIONS http://localhost:4000/api/wallets \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Get request with token
TOKEN="eyJhbGci..."
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/wallets

# POST request
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

**Using Postman**
1. Import API collection or create manually
2. Set base URL: http://localhost:4000
3. Add Authorization header: Bearer <token>
4. Test each endpoint
5. Export results for documentation

**Using REST Client VS Code Extension**
```http
### Test CORS
OPTIONS http://localhost:4000/api/wallets
Origin: http://localhost:5173

### Get wallets
GET http://localhost:4000/api/wallets
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

### Login
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "testpass"
}
```

### Monitoring Tools

**Backend Health Monitoring**
```bash
# Check health endpoints regularly
watch -n 5 'curl -s http://localhost:4000/api/health | jq .'

# Monitor with longer output
curl http://localhost:4000/api/health | jq '.' | watch -n 1 cat
```

**Redis Monitoring**
```bash
# Monitor Redis in real-time
redis-cli monitor

# Watch for cache keys
redis-cli SCAN 0 MATCH 'cache:*'

# Check memory usage
redis-cli INFO memory
```

**MongoDB Monitoring**
```bash
# Connect to MongoDB
mongo localhost:27017

# Check current operations
db.currentOp()

# Get database stats
db.stats()

# List collections
db.getCollectionNames()
```

---

## Common Error Messages and Resolutions

### Frontend Error Messages

**"Failed to fetch"**
- **Cause:** Network request failed, backend unreachable
- **Fix:** Verify backend running: `lsof -i :4000`
- **Fix:** Check API base URL in config: `console.log(config.apiBaseUrl)`

**"Unexpected token < in JSON at position 0"**
- **Cause:** Response is HTML (error page) not JSON
- **Likely:** 404 or 500 error from backend
- **Fix:** Check network tab response body, verify endpoint path

**"CORS policy: No 'Access-Control-Allow-Origin' header"**
- **Cause:** Backend CORS not configured
- **Fix:** Check backend CORS middleware configuration
- **Fix:** Verify FRONTEND_URL in backend .env

**"Invalid or expired token"**
- **Cause:** JWT token invalid or expired
- **Fix:** Clear localStorage and re-login
- **Fix:** Check JWT_SECRET in backend .env

**"Too many requests"**
- **Cause:** Rate limit exceeded
- **Fix:** Wait before retrying
- **Fix:** Implement exponential backoff in frontend

### Backend Error Messages

**"MongoError: connect ECONNREFUSED"**
- **Cause:** MongoDB not running or wrong connection string
- **Fix:** Start MongoDB: `mongod --dbpath /data/db`
- **Fix:** Check MONGO_URI in .env

**"Error: listen EADDRINUSE: address already in use :::4000"**
- **Cause:** Port 4000 already in use
- **Fix:** Kill process: `lsof -i :4000 | awk 'NR>1 {print $2}' | xargs kill -9`
- **Fix:** Or change port: `PORT=4001 npm run dev`

**"Error: JWT_SECRET is not set"**
- **Cause:** Environment variable missing
- **Fix:** Add to backend/.env: `JWT_SECRET=<32+ character string>`

**"Cannot find module 'socket.io'"**
- **Cause:** Dependencies not installed
- **Fix:** Run `npm install` in backend directory

**"Mongoose validation error"**
- **Cause:** Invalid data sent to database
- **Fix:** Check request body matches schema
- **Fix:** Log error details: `console.error(error.errors)`

### Socket.IO Error Messages

**"WebSocket connection failed"**
- **Cause:** Socket.IO server not reachable
- **Fix:** Verify backend running
- **Fix:** Check firewall/network blocking port 4000

**"connect_error: Authentication failed"**
- **Cause:** Token invalid or not sent
- **Fix:** Verify Authorization header included
- **Fix:** Check token not expired

**"Cannot emit to non-existent room"**
- **Cause:** Typo in room name or room not created
- **Fix:** Verify room name: `wallet:address` format
- **Fix:** Check client actually joined room

---

## Quick Checklist

Use this checklist when troubleshooting integration issues:

### Backend Startup
- [ ] MongoDB running: `mongo localhost:27017`
- [ ] Redis running: `redis-cli ping`
- [ ] Backend .env file exists and has all required variables
- [ ] JWT_SECRET is >= 32 characters
- [ ] MONGO_URI is correct connection string
- [ ] FRONTEND_URL matches frontend origin
- [ ] Backend starts without errors: `npm run dev`
- [ ] Backend health check works: `curl http://localhost:4000/api/health`

### Frontend Startup
- [ ] Frontend .env file exists
- [ ] VITE_API_BASE_URL points to backend (http://localhost:4000)
- [ ] Frontend builds without errors: `npm run build`
- [ ] Frontend starts: `npm run dev`
- [ ] Frontend accessible at http://localhost:5173

### API Communication
- [ ] CORS headers present in API responses
- [ ] Authorization header sent with token
- [ ] Token valid and not expired
- [ ] Rate limit not exceeded
- [ ] Request body valid JSON if POST/PUT
- [ ] Response status code expected (200, 201, 400, 401, 429)

### Real-Time (Socket.IO)
- [ ] Socket.IO server initialized on backend
- [ ] Socket.IO client connects successfully
- [ ] No transport warnings (should use websocket)
- [ ] Subscribe events emit to backend
- [ ] Backend broadcasts to correct room
- [ ] Frontend receives events in console

### Debugging Steps
1. Check browser console for errors
2. Check backend logs for errors
3. Check Network tab (headers, body, status code)
4. Check localStorage (token exists)
5. Test API with curl or Postman
6. Verify environment variables
7. Check services running (MongoDB, Redis)
8. Review security/CORS configuration
9. Check rate limiting status
10. Enable DEBUG logging for more info

---

## Need More Help?

### Common Resources
- Backend README: `/backend/README.md`
- Frontend README: `/mallchain-os-v14/README.md`
- API Reference: `/docs/API_REFERENCE.md`
- Architecture: `/docs/INTEGRATION_ARCHITECTURE.md`

### Quick Commands

**View Backend Logs**
```bash
tail -f backend/logs/app.log
```

**View Frontend Build**
```bash
npm run build  # In mallchain-os-v14/
# Check dist/ folder size
du -sh mallchain-os-v14/dist/
```

**Reset All Services**
```bash
# Stop all processes
pkill -f "npm run dev"
pkill -f "mongod"
pkill -f "redis-server"

# Start fresh
mongod --dbpath /data/db &
redis-server &
cd backend && npm run dev &
cd mallchain-os-v14 && npm run dev &
```

**Generate Test Data**
```bash
# Backend script to populate test data
node backend/scripts/seed-db.js
```

**Check All Ports**
```bash
# Verify services running on expected ports
netstat -tlnp | grep -E "4000|5173|27017|6379|26657"
```

