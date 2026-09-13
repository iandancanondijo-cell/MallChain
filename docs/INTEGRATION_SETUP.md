# Backend-Frontend Integration Setup Guide

This guide covers configuring and running both the Mallchain backend and mallchain-os-v14 frontend in development and production environments.

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Production Environment Setup](#production-environment-setup)
3. [Environment Variable Configuration](#environment-variable-configuration)
4. [CORS Configuration](#cors-configuration)
5. [Starting Services](#starting-services)
6. [Verifying Integration](#verifying-integration)
7. [Troubleshooting](#troubleshooting)

---

## Development Environment Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- MongoDB (local or Atlas connection string)
- Redis (local or cloud instance)
- Blockchain testnet node (RPC and REST endpoints)
- Git

### Backend Setup (Port 4000)

1. **Clone and navigate to backend directory:**
   ```bash
   cd /path/to/MarketplaceBlockchain-Mallchain
   npm install
   ```

2. **Create .env file from template:**
   ```bash
   cp .env.example .env
   ```

3. **Configure .env with development values:**
   ```
   # Server
   NODE_ENV=development
   PORT=4000

   # MongoDB
   MONGO_URI=mongodb://localhost:27017/mallchain_dev
   # Or for MongoDB Atlas:
   # MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/mallchain_dev

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Secrets (generate with: openssl rand -base64 32)
   JWT_SECRET=<32-character-minimum-random-string>
   SESSION_SECRET=<32-character-minimum-random-string>

   # Frontend
   FRONTEND_URL=http://localhost:5173
   CORS_ORIGINS=http://localhost:5173
   BACKEND_PUBLIC_URL=http://localhost:4000

   # Blockchain
   CHAIN_ID=mallchain-testnet-1
   CHAIN_RPC=http://localhost:26657
   CHAIN_REST=http://localhost:1317
   ```

4. **Verify .env has required secrets:**
   - JWT_SECRET: at least 32 characters
   - SESSION_SECRET: at least 32 characters
   - MONGO_URI: valid MongoDB connection string

5. **Start MongoDB (if running locally):**
   ```bash
   mongod
   ```

6. **Start Redis (if running locally):**
   ```bash
   redis-server
   ```

### Frontend Setup (Port 5173)

1. **Navigate to frontend directory:**
   ```bash
   cd mallchain-os-v14
   npm install
   ```

2. **Create .env file from template:**
   ```bash
   cp .env.example .env
   ```

3. **Configure .env for development with real backend:**
   ```
   # Point to local backend
   VITE_API_BASE_URL=http://localhost:4000
   
   # Demo mode disabled (using real backend)
   VITE_DEMO_MODE=false
   
   # Network configuration
   VITE_NETWORK=testnet
   
   # Session timeout in minutes
   VITE_SESSION_TTL=120
   ```

   **OR for demo mode (no backend needed):**
   ```
   VITE_API_BASE_URL=
   VITE_DEMO_MODE=true
   VITE_NETWORK=testnet
   VITE_SESSION_TTL=120
   ```

---

## Production Environment Setup

### Backend Production Configuration

1. **Create production .env:**
   ```
   # Server
   NODE_ENV=production
   PORT=4000

   # MongoDB (use managed service)
   MONGO_URI=mongodb+srv://prod_user:secure_password@prod-cluster.mongodb.net/mallchain_prod

   # Redis (use managed service)
   REDIS_HOST=redis.example.com
   REDIS_PORT=6379
   REDIS_PASSWORD=<secure-password>

   # Secrets (MUST be strong random values)
   JWT_SECRET=<very-secure-32-char-minimum>
   SESSION_SECRET=<very-secure-32-char-minimum>

   # Frontend
   FRONTEND_URL=https://mallchain.example.com
   CORS_ORIGINS=https://mallchain.example.com,https://www.mallchain.example.com
   BACKEND_PUBLIC_URL=https://api.mallchain.example.com

   # Blockchain
   CHAIN_ID=mallchain-mainnet-1
   CHAIN_RPC=https://mainnet-rpc.mallchain.com
   CHAIN_REST=https://mainnet-lcd.mallchain.com
   ```

2. **Security checklist:**
   - [ ] JWT_SECRET is 32+ characters and cryptographically random
   - [ ] SESSION_SECRET is 32+ characters and cryptographically random
   - [ ] MONGO_URI uses secure password, not in logs
   - [ ] REDIS_PASSWORD is set and secure
   - [ ] FRONTEND_URL is HTTPS
   - [ ] CORS_ORIGINS contains only production domains
   - [ ] NODE_ENV is explicitly set to "production"
   - [ ] .env file is not committed to version control
   - [ ] Environment variables are stored in secure vault (AWS Secrets Manager, Azure Key Vault, etc.)

### Frontend Production Build

1. **Create production .env:**
   ```
   VITE_API_BASE_URL=https://api.mallchain.example.com
   VITE_DEMO_MODE=false
   VITE_NETWORK=mainnet
   VITE_SESSION_TTL=120
   ```

2. **Build and deploy:**
   ```bash
   npm run build
   # Output: dist/ directory ready for CDN/static hosting
   ```

3. **HTTPS enforcement:**
   - All requests to VITE_API_BASE_URL must use HTTPS
   - Backend must have valid SSL certificate
   - Use security headers (HSTS, CSP)

---

## Environment Variable Configuration

### Backend Environment Variables

| Variable | Required | Min Length | Format | Description |
|----------|----------|-----------|--------|-------------|
| NODE_ENV | Yes | — | "development" \| "production" | Server environment mode |
| PORT | Yes | — | 1-65535 | Server port |
| MONGO_URI | Yes | 10 | MongoDB URL | Database connection string |
| REDIS_HOST | Yes | — | hostname | Redis server hostname |
| REDIS_PORT | Yes | — | 1-65535 | Redis server port |
| JWT_SECRET | Yes | 32 | Random string | JWT signing secret |
| SESSION_SECRET | Yes | 32 | Random string | Session encryption secret |
| FRONTEND_URL | Yes | 7 | HTTP(S) URL | Frontend origin for CORS |
| CORS_ORIGINS | No | — | Comma-separated URLs | Additional allowed CORS origins |
| BACKEND_PUBLIC_URL | Yes | 7 | HTTP(S) URL | Public backend URL |
| CHAIN_ID | Yes | — | Chain ID string | Blockchain chain identifier |
| CHAIN_RPC | Yes | 7 | HTTP(S) URL | Blockchain RPC endpoint |
| CHAIN_REST | Yes | 7 | HTTP(S) URL | Blockchain REST endpoint |

### Frontend Environment Variables

| Variable | Required | Default | Format | Description |
|----------|----------|---------|--------|-------------|
| VITE_API_BASE_URL | No | "" (empty) | HTTP(S) URL | Backend API base URL (empty = demo mode) |
| VITE_DEMO_MODE | No | "true" | "true" \| "false" | Enable local store simulation |
| VITE_NETWORK | No | "testnet" | "mainnet" \| "testnet" | Blockchain network |
| VITE_SESSION_TTL | No | "120" | Positive integer | Session timeout in minutes |

### Generating Secure Secrets

```bash
# Generate JWT_SECRET and SESSION_SECRET (32 bytes = 256 bits)
openssl rand -base64 32

# Example output:
# aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789==

# Store these in .env (remove any trailing == if needed)
```

---

## CORS Configuration

Cross-Origin Resource Sharing (CORS) is critical for allowing the frontend (running on a different port or domain) to communicate with the backend API. This section explains how to properly configure CORS for both development and production environments.

### Understanding CORS in This Integration

The Mallchain system has two separate web servers:
- **Frontend (React + Vite):** Runs on port 5173 in development, or a static hosting service in production
- **Backend (Node.js + Express):** Runs on port 4000 in development, or a backend server in production

Since they run on different ports/domains, browsers enforce CORS policies. The backend must explicitly allow the frontend's origin to make API requests.

### Environment Variables for CORS

#### FRONTEND_URL

The primary frontend origin that will access the backend.

**Development example:**
```bash
FRONTEND_URL=http://localhost:5173
```

**Production example:**
```bash
FRONTEND_URL=https://mallchain.example.com
```

**Rules:**
- Must be a complete HTTP or HTTPS URL
- Do NOT include trailing slash
- Must exactly match the origin from which the browser makes requests
- Single origin only (use CORS_ORIGINS for multiple)

#### CORS_ORIGINS (Optional)

Additional origins allowed to access the backend API, provided as a comma-separated list.

**Use cases:**
- Multiple frontend deployments (staging, preview branches)
- Multiple domains for the same application
- Mobile app webviews with custom origins
- Development team members with different local ports

**Development example:**
```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173
```

**Production example:**
```bash
CORS_ORIGINS=https://mallchain.example.com,https://www.mallchain.example.com,https://app.mallchain.io
```

**Rules:**
- Comma-separated list (no spaces)
- Each entry must be a complete HTTP or HTTPS URL
- Do NOT include trailing slashes
- Origins from both FRONTEND_URL and CORS_ORIGINS are combined into the allowlist
- If not set, only FRONTEND_URL is allowed

### Development vs Production CORS Behavior

#### Development Mode (NODE_ENV=development)

**Typical configuration:**
```bash
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

**Behavior:**
- Accepts HTTP connections (no HTTPS required)
- Allows localhost and 127.0.0.1 origins
- More permissive error messages for debugging
- CORS headers logged for troubleshooting

**Best practices:**
- Always specify localhost explicitly
- Include both `localhost` and `127.0.0.1` if your browser uses both
- Test CORS with browser DevTools Network tab

#### Production Mode (NODE_ENV=production)

**Typical configuration:**
```bash
NODE_ENV=production
FRONTEND_URL=https://mallchain.example.com
CORS_ORIGINS=https://mallchain.example.com,https://www.mallchain.example.com
```

**Behavior:**
- Requires HTTPS for all origins (HTTP rejected)
- Strict origin validation (exact match required)
- Minimal error messages for security
- CORS violations return 403 Forbidden
- secure: true set on cookies

**Best practices:**
- Use HTTPS for all production origins
- Limit CORS_ORIGINS to only necessary domains
- Never use wildcard `*` in production
- Regularly audit allowed origins
- Use CDN/reverse proxy to avoid CORS when possible

### Credentials Support

The backend is configured with `credentials: true` to support:
- **Cookies:** Session cookies, authentication cookies
- **Authorization headers:** JWT Bearer tokens
- **Custom headers:** Application-specific headers

**Important:** When `credentials: true` is set:
- The backend CANNOT use wildcard `*` for Access-Control-Allow-Origin
- Each origin must be explicitly listed
- Browsers will include cookies and authorization headers in requests

**Frontend requirements:**
When making requests to the backend with credentials, the frontend must use:
```javascript
// Using fetch
fetch('http://localhost:4000/api/endpoint', {
  credentials: 'include',
  headers: {
    'Authorization': 'Bearer <token>'
  }
});

// Using axios
axios.get('http://localhost:4000/api/endpoint', {
  withCredentials: true,
  headers: {
    'Authorization': 'Bearer <token>'
  }
});
```

### Configuring Multiple Allowed Origins

**Scenario:** You have multiple frontend deployments that need to access the same backend.

**Example configuration:**
```bash
# Backend .env
FRONTEND_URL=https://app.mallchain.com
CORS_ORIGINS=https://app.mallchain.com,https://staging.mallchain.com,https://preview-123.mallchain.com,https://mobile.mallchain.com
```

**How it works:**
1. Backend reads FRONTEND_URL and CORS_ORIGINS at startup
2. CORS_ORIGINS is split by comma into an array
3. Both FRONTEND_URL and CORS_ORIGINS entries are combined into allowlist
4. On each request, the backend checks if request Origin matches any entry in allowlist
5. If match found, backend responds with `Access-Control-Allow-Origin: <request-origin>`
6. If no match, request is rejected (no CORS headers sent)

**Testing multiple origins:**
```bash
# Test allowed origin
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: https://app.mallchain.com" \
  -H "Access-Control-Request-Method: GET"
# Should return: Access-Control-Allow-Origin: https://app.mallchain.com

# Test another allowed origin
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: https://staging.mallchain.com" \
  -H "Access-Control-Request-Method: GET"
# Should return: Access-Control-Allow-Origin: https://staging.mallchain.com

# Test disallowed origin
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: https://malicious.com" \
  -H "Access-Control-Request-Method: GET"
# Should NOT return Access-Control-Allow-Origin header
```

### Troubleshooting CORS Issues

#### Error: "CORS policy: No 'Access-Control-Allow-Origin' header is present"

**Cause:** Backend is not including the required CORS header in the response.

**Solutions:**
1. **Check backend is running:** Verify backend server is started and responding at the expected port
   ```bash
   curl http://localhost:4000/api/health
   ```

2. **Verify FRONTEND_URL matches:** The origin in the browser request must exactly match FRONTEND_URL or an entry in CORS_ORIGINS
   ```bash
   # Check .env file
   cat .env | grep FRONTEND_URL
   # Should match the URL in browser address bar
   ```

3. **Check for typos:** Common mistakes include:
   - Trailing slash: `http://localhost:5173/` ❌ → `http://localhost:5173` ✅
   - Wrong protocol: `https://localhost:5173` ❌ → `http://localhost:5173` ✅ (in dev)
   - Wrong port: `http://localhost:3000` ❌ → `http://localhost:5173` ✅

4. **Restart backend after changes:** Environment variables are read at startup
   ```bash
   # Stop backend (Ctrl+C) and restart
   npm run dev
   ```

5. **Check CORS middleware is loaded:** Verify backend logs show CORS configuration
   ```
   ✓ CORS configured for origins: http://localhost:5173
   ```

#### Error: "CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values"

**Cause:** Multiple middleware or proxies are adding CORS headers.

**Solutions:**
1. Ensure CORS middleware is only applied once in backend
2. Check if reverse proxy (nginx, Apache) is also adding CORS headers
3. Remove duplicate CORS configuration from one location

#### Error: "CORS policy: Credentials flag is 'true', but the 'Access-Control-Allow-Credentials' header is ''"

**Cause:** Frontend is sending credentials but backend is not configured to allow them.

**Solutions:**
1. Verify backend CORS middleware has `credentials: true`
2. Check that origin is explicitly allowed (not wildcard)
3. Ensure frontend is using correct credentials mode:
   ```javascript
   fetch(url, { credentials: 'include' })
   ```

#### Error: "CORS policy: Request header field authorization is not allowed"

**Cause:** Backend is not allowing the Authorization header in CORS configuration.

**Solutions:**
1. Check CORS middleware includes Authorization in allowedHeaders
2. Verify preflight OPTIONS request is handled correctly
3. Backend should include:
   ```javascript
   cors({
     allowedHeaders: ['Content-Type', 'Authorization'],
     // ...
   })
   ```

#### Error: Requests work with Postman/curl but fail in browser

**Cause:** Browsers enforce CORS; tools like Postman do not.

**Solutions:**
1. This is expected behavior—not a bug
2. Must properly configure CORS for browser requests
3. Use browser DevTools Network tab to inspect CORS headers
4. Ensure preflight OPTIONS requests return 200 OK

#### Production Error: CORS works in development but fails in production

**Causes:**
- FRONTEND_URL still set to localhost instead of production domain
- Production frontend is using HTTPS but CORS allows HTTP
- Reverse proxy or CDN is stripping CORS headers

**Solutions:**
1. Update backend .env for production:
   ```bash
   FRONTEND_URL=https://your-production-domain.com
   CORS_ORIGINS=https://your-production-domain.com,https://www.your-production-domain.com
   ```

2. Verify HTTPS is used everywhere:
   ```bash
   # All should use https://
   echo $FRONTEND_URL
   echo $CORS_ORIGINS
   echo $VITE_API_BASE_URL
   ```

3. Check reverse proxy configuration (nginx example):
   ```nginx
   # Do NOT add CORS headers in nginx if backend handles CORS
   # Or configure nginx to handle CORS and disable in backend
   ```

4. Test with curl from production environment:
   ```bash
   curl -i -X OPTIONS https://api.production.com/api/health \
     -H "Origin: https://production.com"
   ```

### Security Best Practices for CORS

#### 1. Never Use Wildcard in Production

**Bad (insecure):**
```javascript
// DO NOT DO THIS IN PRODUCTION
cors({ origin: '*' })
```

**Good (secure):**
```javascript
cors({ origin: getAllowedOrigins() }) // Explicit list from env vars
```

**Why:** Wildcard allows any website to make requests to your API, potentially exposing sensitive data or enabling CSRF attacks.

#### 2. Always Validate Origin Format

**Implementation:**
- Validate that all CORS origins are valid URLs
- Reject malformed origins at startup
- Log any origin validation failures

**Example check:**
```javascript
function validateOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
    return true;
  } catch (err) {
    console.error(`Invalid CORS origin: ${origin}`);
    return false;
  }
}
```

#### 3. Use HTTPS in Production

**Requirements:**
- All production origins must use HTTPS
- Backend API must use HTTPS
- Set `secure: true` on cookies when NODE_ENV=production
- Enable HSTS headers

**Enforcement:**
```bash
# Production .env
NODE_ENV=production
FRONTEND_URL=https://app.mallchain.com  # HTTPS required
```

#### 4. Minimize Allowed Origins

**Best practice:**
- Only include origins that genuinely need API access
- Remove old/unused origins from CORS_ORIGINS
- Regularly audit the allowlist
- Consider separate backends for different client types if possible

**Example:**
```bash
# Instead of:
CORS_ORIGINS=https://app1.com,https://app2.com,https://old-app.com,https://staging.com,https://preview-1.com,https://preview-2.com

# Better:
CORS_ORIGINS=https://app.mallchain.com,https://www.mallchain.com
# Use separate backend for staging/previews if possible
```

#### 5. Monitor CORS Violations

**Implementation:**
- Log rejected CORS requests
- Monitor for suspicious patterns (scraping, attacks)
- Alert on unexpected origins attempting access

**Example logging:**
```javascript
// Backend: log rejected CORS requests
if (!allowedOrigins.includes(requestOrigin)) {
  console.warn(`CORS rejected: ${requestOrigin} at ${new Date().toISOString()}`);
}
```

#### 6. Implement Rate Limiting

**Purpose:** Prevent abuse even from allowed origins.

**Configuration:**
```bash
# Backend implements rate limiting:
# - 120 requests/minute per IP for general endpoints
# - 40 requests/minute for transaction endpoints
# - 100 requests/minute for mines endpoints
```

**Why:** CORS controls which origins can access the API, but rate limiting controls how much they can access it.

---

## Starting Services

### Development - Start in Order

#### 1. Start Backend (Terminal 1)

```bash
cd /path/to/MarketplaceBlockchain-Mallchain
npm run dev
# or
node server.js
```

**Expected output:**
```
✓ Server listening on port 4000
✓ MongoDB connected
✓ Redis connected
✓ Socket.IO server ready
```

#### 2. Start Frontend (Terminal 2)

```bash
cd mallchain-os-v14
npm run dev
# or
npm run dev -- --host localhost --port 5173
```

**Expected output:**
```
Local:   http://localhost:5173/
```

#### 3. Optional: Start Local Blockchain (Terminal 3)

For full local development without connecting to testnet:

```bash
# Using Cosmos SDK testnet setup
cd ~/.marketplace_test
./marketplace version
./marketplace start
```

### Production - Using Docker Compose

Example `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    image: mallchain/backend:latest
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      PORT: 4000
      MONGO_URI: ${MONGO_URI}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: ${JWT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
      CORS_ORIGINS: ${CORS_ORIGINS}
      BACKEND_PUBLIC_URL: ${BACKEND_PUBLIC_URL}
      CHAIN_ID: ${CHAIN_ID}
      CHAIN_RPC: ${CHAIN_RPC}
      CHAIN_REST: ${CHAIN_REST}
    depends_on:
      - mongo
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  frontend:
    image: mallchain/frontend:latest
    ports:
      - "80:3000"
    environment:
      VITE_API_BASE_URL: https://api.mallchain.example.com
      VITE_DEMO_MODE: "false"
      VITE_NETWORK: mainnet
      VITE_SESSION_TTL: "120"

  mongo:
    image: mongo:6
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
```

Deploy with:
```bash
docker-compose up -d
```

---

## Verifying Integration

### 1. Backend Health Check

```bash
curl http://localhost:4000/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "blockchain": {
    "chainId": "mallchain-testnet-1",
    "latestHeight": "12345",
    "latestBlockTime": "2024-01-20T15:30:45Z"
  },
  "mongodb": "connected",
  "redis": "connected"
}
```

### 2. Frontend Connection

1. Open http://localhost:5173 in browser
2. Open browser DevTools (F12 → Console)
3. Look for messages:
   - "API connected to http://localhost:4000" — backend connection OK
   - "Socket connected" — WebSocket connection OK

### 3. Test Authentication Flow

```bash
# Register new user
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"SecurePassword123!"}'

# Expected response:
# {"ok":true,"data":{"token":"eyJ...","user":{"id":"...","username":"testuser"}}}

# Store the token
TOKEN="eyJ..."

# Access protected endpoint
curl http://localhost:4000/api/wallets/mall1abc123... \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Test Socket.IO Connection

In browser console at http://localhost:5173:

```javascript
// Check Socket.IO client
console.log(window.socket); // Should exist and show connection details

// Subscribe to wallet updates
window.socket?.emit('subscribe:wallet', 'mall1abc123...');

// Listen for updates
window.socket?.on('wallet:update', (data) => {
  console.log('Wallet update:', data);
});
```

### 5. Verify CORS Configuration

```bash
# From frontend origin (should succeed)
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"

# Should return:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Credentials: true

# From disallowed origin (should fail)
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: http://malicious.com" \
  -H "Access-Control-Request-Method: GET"

# Should NOT return Access-Control-Allow-Origin header
```

---

## Troubleshooting

### Backend Won't Start

**Error: `ECONNREFUSED` on MongoDB**
- Check MongoDB is running: `sudo systemctl status mongod`
- Verify MONGO_URI in .env is correct
- Check port 27017 is accessible: `telnet localhost 27017`

**Error: `ECONNREFUSED` on Redis**
- Check Redis is running: `sudo systemctl status redis-server`
- Verify REDIS_HOST and REDIS_PORT in .env
- Check port 6379 is accessible: `redis-cli ping`

**Error: `Runtime secret validation failed`**
- JWT_SECRET must be at least 32 characters
- SESSION_SECRET must be at least 32 characters
- Regenerate: `openssl rand -base64 32`

### Frontend Won't Connect to Backend

**Error: `CORS policy: No 'Access-Control-Allow-Origin' header`**
- Check VITE_API_BASE_URL matches FRONTEND_URL in backend .env
- Default: frontend at http://localhost:5173, backend at http://localhost:4000
- Verify backend CORS middleware is active
- Restart backend after changing CORS_ORIGINS
- See detailed [CORS Configuration](#cors-configuration) section above for comprehensive troubleshooting

**Error: `Failed to fetch` when accessing protected routes**
- Check token is stored in localStorage
- Verify Authorization header is being sent: DevTools → Network tab → Headers
- Check JWT_SECRET matches between backend and token generation
- Login again to get fresh token

### Socket.IO Not Connecting

**Error: `WebSocket connection failed`**
- Verify backend Socket.IO server is running: DevTools → Console should show connection attempts
- Check firewall allows WebSocket connections (port 4000)
- Try with different transport: `socket.io-client` defaults to websocket then falls back to polling
- Verify CORS is configured for Socket.IO (separate from REST CORS)

**No events received after subscribing**
- Check subscription event was emitted: `socket.emit('subscribe:wallet', address)`
- Verify room name format: `wallet:{address}` or `blocks:live` etc.
- Check blockchain events are being triggered (may need to send test transaction)
- Look at backend logs for event emission

### Authentication Issues

**Error: `401 Unauthorized` on protected routes**
- Token may have expired (default 120 min session TTL)
- Check token is being sent: DevTools → Network → Request Headers → Authorization
- Verify token format: `Bearer eyJ...` (with "Bearer " prefix)
- Re-login to get fresh token

**Error: `Invalid token` when accessing backend directly**
- Tokens are JWT signed with JWT_SECRET
- Each backend instance must have same JWT_SECRET
- Check token hasn't been tampered with
- Generate new token by logging in again

### Performance Issues

**Slow API responses (> 1s)**
- Check MongoDB indexes on frequently queried collections
- Monitor Redis cache hit rate: `redis-cli info stats`
- Check backend logs for slow queries
- Verify blockchain RPC is responsive: `curl {CHAIN_RPC}/health`

**Socket.IO events delayed or missed**
- Check Redis adapter is configured for Socket.IO (needed for horizontal scaling)
- Monitor number of concurrent connections: `socket.io/stats`
- Check network latency: DevTools → Network tab → timing
- May need to throttle client-side event handlers

### Production Deployment Issues

**HTTPS certificate errors**
- Verify SSL certificate is valid: `openssl s_client -connect api.mallchain.example.com:443`
- Check certificate includes correct domain
- Consider using Let's Encrypt with Certbot for auto-renewal

**Database connection drops**
- Check MongoDB connection string is correct
- Verify authentication credentials
- Increase connection pool size if under heavy load
- Monitor network connectivity to database

**Rate limiting triggered**
- Check for bot traffic or scraping
- Adjust rate limits in backend config if needed
- Implement request deduplication on frontend
- Use caching to reduce redundant requests

### Getting Help

If issues persist:

1. **Check backend logs:**
   ```bash
   tail -f server.log
   ```

2. **Check frontend console (F12):**
   - Look for CORS errors
   - Check network requests in Network tab
   - Review console warnings/errors

3. **Verify services are running:**
   ```bash
   # MongoDB
   mongo --eval "db.adminCommand('ping')"
   
   # Redis
   redis-cli ping
   
   # Backend
   curl http://localhost:4000/api/health
   
   # Frontend (should return HTML)
   curl http://localhost:5173
   ```

4. **Enable debug logging:**
   - Backend: Set `DEBUG=*` before starting
   - Frontend: Check localStorage `localStorage.debug = '*'`

---

## Summary

**Development Quick Start:**
```bash
# Terminal 1: Backend
cd /path/to/repo && npm run dev

# Terminal 2: Frontend
cd mallchain-os-v14 && npm run dev

# Terminal 3: Browser
open http://localhost:5173
```

**Verify all components:**
- Backend health: `curl http://localhost:4000/api/health`
- Frontend loads: `http://localhost:5173`
- Can login and receive JWT token
- Socket.IO connects and receives real-time updates
- API calls return data from backend (not demo mode)

---

**For questions or issues, refer to:**
- Backend README: `../README.md`
- Frontend README: `../mallchain-os-v14/README.md`
- Design Doc: `.kiro/specs/backend-frontend-integration/design.md`
- Requirements: `.kiro/specs/backend-frontend-integration/requirements.md`
