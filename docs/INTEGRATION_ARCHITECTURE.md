# Backend-Frontend Integration Architecture

## Executive Summary

This document describes the integration architecture between the mallchain-os-v14 React frontend and the Mallchain blockchain backend. The integration enables real-time blockchain data synchronization, secure authentication, and bidirectional communication through REST APIs and WebSocket connections. The frontend transitions from demo mode (local store simulation) to production mode (real backend calls) while maintaining fallback behavior for development.

## System Overview

### High-Level Architecture

The system consists of three primary layers:

1. **Frontend Layer** (mallchain-os-v14): React application running on port 5173
   - API Service Layer for backend communication
   - Configuration module for environment management
   - Socket.IO client for real-time updates
   - React components consuming data from API and WebSocket

2. **Backend Layer** (Port 4000): Node.js/Express server
   - REST API endpoints for all operations
   - Socket.IO server for real-time communication
   - Authentication and authorization middleware
   - CORS configuration for frontend cross-origin access
   - Rate limiting for security and performance

3. **Data Layer**: External services
   - MongoDB: Persistent storage
   - Redis: Caching and rate limiting
   - Blockchain RPC/REST: Cosmos SDK chain interaction

### Component Diagram

```
┌─────────────────────────────────┐
│   mallchain-os-v14 Frontend     │
│   (React on Port 5173)          │
├─────────────────────────────────┤
│ • React Components              │
│ • API Service Layer             │
│ • Configuration Module          │
│ • Socket.IO Client              │
│ • Local Store (Demo Mode)       │
└──────────────┬──────────────────┘
               │
               │ HTTP/REST & WebSocket
               │
┌──────────────▼──────────────────┐
│ Mallchain Backend               │
│ (Node.js/Express on Port 4000)  │
├─────────────────────────────────┤
│ • Express Server                │
│ • Route Handlers                │
│   - Authentication              │
│   - Blockchain Data             │
│   - Transactions                │
│   - Marketplace                 │
│   - Governance & Staking        │
│ • Socket.IO Server              │
│ • Middleware                    │
│   - CORS Handler                │
│   - Auth Middleware             │
│   - Rate Limiter                │
│   - Input Validation            │
└──────────────┬──────────────────┘
               │
        ┌──────┴────────┬───────────┐
        │               │           │
    ┌───▼───┐      ┌────▼───┐   ┌──▼────┐
    │MongoDB│      │ Redis  │   │Chain  │
    │       │      │ Cache  │   │RPC/REST
    └───────┘      └────────┘   └───────┘
```

## Communication Flows

### 1. HTTP REST Communication

REST communication follows a standard request-response pattern for synchronous operations.

#### Request Flow

```
Frontend Component
    ↓
API Service Layer
    ↓
    • Check config.apiBaseUrl
    • Add Authorization header (JWT token if available)
    • Add Content-Type: application/json header
    ↓
HTTP POST/GET to http://localhost:4000/api/endpoint
    ↓
Backend Express Server
    ↓
    • CORS Middleware validates origin
    • Auth Middleware validates JWT token
    • Rate Limiter checks request count
    • Route Handler processes request
    • Returns response
    ↓
API Service receives response
    ↓
    • On success (200): return {ok: true, data: T}
    • On HTTP error (400+): return {ok: false, code: N, error: string}
    • On network error: return {ok: false, error: string}
    ↓
Frontend receives ApiResult
    ↓
Component updates state/UI
```

#### Example: Authentication Request

The JWT itself is never present in the request or response body — it's set
as an httpOnly `auth_token` cookie by the server (invisible to frontend JS,
so an XSS payload can't exfiltrate it). The response body only carries a
non-secret `expiresAt` hint the frontend uses to drive UI state.

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}

Response (200 OK):
Set-Cookie: auth_token=<jwt>; HttpOnly; SameSite=Strict; Path=/
{
  "expiresAt": 1789279452,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com"
  }
}
```

#### Example: Protected Route Request

Every request carries `credentials: 'include'` so the browser attaches the
session cookie automatically — there is no Authorization header. Because
cookie auth is forgeable cross-site (unlike a manually-attached bearer
header), mutating requests (POST/PUT/PATCH/DELETE) also carry an
`X-CSRF-Token` header, fetched once from `GET /api/csrf-token`.

```
GET /api/wallets/mall1abc.../balances
Cookie: auth_token=<jwt>
Content-Type: application/json

Response (200 OK):
{
  "ok": true,
  "data": {
    "address": "mall1abc...",
    "balances": {
      "umalc": 1000000,
      "umall": 500000
    }
  }
}
```



### 2. WebSocket Real-Time Communication

WebSocket communication enables real-time updates from the blockchain to connected clients.

#### Connection Lifecycle

```
Frontend Socket Client
    ↓
Attempt WebSocket connection to ws://localhost:4000
    ↓
Backend Socket.IO Server
    ↓
    • CORS validation
    • Socket ID assignment
    • 'connection' event handler
    ↓
Frontend receives connection success
    ↓
Frontend can now emit subscription events
```

#### Room Subscription Pattern

```
Frontend emits: socket.emit('subscribe:wallet', address)
    ↓
Backend receives 'subscribe:wallet' event
    ↓
Backend joins socket to room: 'wallet:address'
    ↓
Backend emits cached wallet data immediately
    ↓
Frontend receives 'wallet:update' event
    ↓
Frontend updates wallet state
    ↓
(Later) Blockchain event occurs
    ↓
Backend detects wallet change
    ↓
Backend broadcasts: io.to('wallet:address').emit('wallet:update', data)
    ↓
All sockets in 'wallet:address' room receive update
```

#### Broadcast Events

The backend broadcasts events to specific rooms:

1. **Wallet Updates** (`wallet:update` → `wallet:address` room)
   - Triggered when: Balance changes, transaction confirmed
   - Payload: {address, balances, timestamp}

2. **Block Events** (`block:new` → `blocks:live` room)
   - Triggered when: New block added to blockchain
   - Payload: {height, hash, timestamp, txCount}

3. **Market Activity** (`market:feed` → `market:feed` room)
   - Triggered when: New trade, listing, or sale
   - Payload: {type, timestamp, data}

4. **Price Updates** (`price:current` → `price:updates` room)
   - Triggered when: Price data changes
   - Payload: {prices, volumes, changes}

#### Room Isolation

Each wallet address has its own room (`wallet:address`). Sockets subscribed only to `wallet:address_A` do NOT receive events broadcast to `wallet:address_B`. This ensures privacy and prevents data leakage between users.



## Data Flow Architecture

### Frontend Data Flow: API Service Mode

```
┌─────────────────────────────────────────────────┐
│ Frontend Component                              │
├─────────────────────────────────────────────────┤
│ const {data} = api.get('/api/balances')        │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────▼──────────────┐
        │ API Service Layer       │
        ├────────────────────────┤
        │ Check config.apiBaseUrl│
        └───────────┬────────────┘
                    │
        ┌───────────┴──────────────┐
        │                          │
    ┌───▼──────┐          ┌───────▼──────┐
    │Real Mode │          │Demo Mode     │
    │(non-empty│          │(empty URL)   │
    │URL)      │          │              │
    └───┬──────┘          └───────┬──────┘
        │                         │
    ┌───▼───────────┐       ┌────▼────────┐
    │HTTP GET to    │       │Resolve from │
    │Backend API    │       │Local Store  │
    └───┬───────────┘       └────┬────────┘
        │                         │
    ┌───▼──────────────────┐      │
    │Backend processes     │      │
    │& returns data        │      │
    └───┬──────────────────┘      │
        │                         │
    ┌───▴─────────────────────────┴───┐
    │ Return ApiResult<T>             │
    │ {ok: true, data: {...}}        │
    └───┬─────────────────────────────┘
        │
    ┌───▼──────────────────────┐
    │ Frontend receives result │
    │ and updates state        │
    └────────────────────────┘
```

### Real Backend Mode Flow

When `config.apiBaseUrl` is set to the backend URL:

1. **Request Formation**
   - Method: GET/POST/PATCH/DELETE as needed
   - URL: `{apiBaseUrl}{path}` (e.g., `http://localhost:4000/api/wallets/mall1abc.../balances`)
   - Headers: 
     - `Content-Type: application/json`
     - `Authorization: Bearer {token}` (if token exists in localStorage)
   - Body: JSON payload for POST/PATCH requests

2. **Backend Processing**
   - CORS middleware validates origin
   - Auth middleware validates JWT token (if required for route)
   - Rate limiter checks request budget
   - Route handler queries MongoDB/Redis/Blockchain
   - Response formatted as `{ok: true, data: T}` or `{ok: false, error: string}`

3. **Frontend Response Handling**
   - Success: Data available immediately
   - Network error: `{ok: false, error: "Failed to fetch"}`
   - HTTP error: `{ok: false, code: 404, error: "Not found"}`
   - 401 response: Token cleared, user redirected to login

### Demo Mode Flow

When `config.apiBaseUrl` is empty:

1. **Request Interception**
   - API service detects empty apiBaseUrl
   - Request is NOT sent over network
   - Simulated delay is added (optional, for realistic UX)

2. **Local Store Resolution**
   - Data is resolved from local store (Redux/Context/etc.)
   - Simulated data format matches backend responses
   - Changes are applied to local store only

3. **Limitations**
   - No real blockchain interaction
   - No persistence across page reloads (unless store is persisted)
   - Useful for UI development without backend running



## Key Architectural Decisions and Patterns

### 1. Dual-Mode API Service

**Decision**: Frontend API service supports both real backend mode and demo mode operation.

**Rationale**: 
- Enables frontend development to proceed without backend running
- Simplifies testing (can switch modes via environment variable)
- Provides fallback behavior for better UX

**Implementation**:
- `config.apiBaseUrl` is non-empty → use real backend
- `config.apiBaseUrl` is empty → use local store simulation
- Decision is made once at startup and remains constant during session

**Trade-offs**:
- Adds complexity to API service
- Requires maintaining parallel data models
- Ensures frontend can work independently of backend

### 2. Authentication via JWT Tokens

**Decision**: Backend issues JWT tokens upon successful login, frontend stores in localStorage and includes in Authorization header.

**Rationale**:
- Standard approach for REST API authentication
- Stateless server (no server-side session storage)
- Token expires after configurable TTL (sessionTtlMin)

**Implementation**:
- Login POST `/api/auth/login` → receives JWT
- Frontend stores token: `localStorage.setItem('token', jwt)`
- For each protected request: `Authorization: Bearer {jwt}`
- On 401 response: clear token and redirect to login

**Security Considerations**:
- localStorage is vulnerable to XSS attacks
- Mitigation: Content Security Policy headers
- Token expiration provides time-bound access
- Server validates signature on every request

### 3. Room-Based WebSocket Subscriptions

**Decision**: Use Socket.IO rooms for filtering which clients receive which events.

**Rationale**:
- Efficient broadcasting (only relevant clients receive events)
- Prevents data leakage (wallet:A events don't reach wallet:B subscribers)
- Scalable with Redis adapter for multi-server setup

**Implementation**:
- Room names follow convention: `wallet:{address}`, `market:feed`, etc.
- Frontend emits `subscribe:wallet` → backend joins socket to `wallet:{address}`
- Backend emits only to specific room: `io.to('wallet:{address}').emit(...)`

**Isolation Example**:
```
User A: socket.join('wallet:mall1aaa...')
User B: socket.join('wallet:mall1bbb...')

Event: io.to('wallet:mall1aaa...').emit('wallet:update', data)
Result: Only User A receives update, User B does not
```

### 4. CORS for Cross-Origin Frontend Access

**Decision**: Backend CORS middleware allows frontend origin with credentials support.

**Rationale**:
- Frontend (port 5173) and backend (port 4000) are different origins
- Credentials (cookies, Authorization headers) must work cross-origin
- Production deployments require explicit origin allowlisting

**Implementation**:
- `FRONTEND_URL` environment variable specifies allowed origin
- `CORS_ORIGINS` supports additional origins (comma-separated)
- Middleware returns `Access-Control-Allow-Origin` header
- `credentials: true` allows Authorization headers

**Headers Example**:
```
Request from: http://localhost:5173
Response headers:
  Access-Control-Allow-Origin: http://localhost:5173
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
```

### 5. Error Response Standardization

**Decision**: All API responses follow `ApiResult<T>` format.

**Rationale**:
- Consistent error handling across all endpoints
- Frontend can handle success/failure uniformly
- Error codes enable specific error recovery strategies

**Format**:
```typescript
interface ApiResult<T> {
  ok: boolean;           // true = success, false = error
  data?: T;              // response payload (if ok=true)
  error?: string;        // error message (if ok=false)
  code?: number;         // HTTP status code (if ok=false)
}
```

**Usage**:
```javascript
const result = await api.get('/api/data');
if (result.ok) {
  // Use result.data
} else if (result.code === 401) {
  // Handle authentication failure
} else if (result.code === 429) {
  // Handle rate limit
} else {
  // Handle other errors
}
```



## Component Interactions

### Component: API Service Layer

**Purpose**: Unified interface for backend communication with dual-mode support.

**Location**: `mallchain-os-v14/src/services/api.ts`

**Responsibilities**:
1. Detect operation mode (real backend vs demo)
2. Construct HTTP requests with proper headers
3. Include JWT token from localStorage when available
4. Handle network and HTTP errors
5. Return consistent ApiResult format
6. Support request deduplication

**Key Methods**:
- `api.get<T>(path: string, params?: Object): Promise<ApiResult<T>>`
- `api.post<T>(path: string, body?: Object): Promise<ApiResult<T>>`
- `api.mutate<T>(tx: TransactionRequest): Promise<ApiResult<T>>`

**Usage Example**:
```javascript
// Get wallet balances
const result = await api.get('/api/wallets/mall1abc.../balances');
if (result.ok) {
  console.log('Balances:', result.data.balances);
} else {
  console.error('Error:', result.error);
}

// Send transaction
const txResult = await api.mutate({
  type: 'transfer',
  amount: 100,
  asset: 'umalc',
  kind: 'debit'
});
```

### Component: Configuration Module

**Purpose**: Centralized environment configuration with sensible defaults.

**Location**: `mallchain-os-v14/src/config/index.ts`

**Responsibilities**:
1. Load environment variables at build time
2. Provide default values for missing variables
3. Control simulation timers based on mode
4. Validate configuration on startup

**Configuration Properties**:
```typescript
{
  apiBaseUrl: string;        // Backend URL or empty for demo
  demoMode: boolean;         // Simulation enabled
  network: 'mainnet' | 'testnet';
  sessionTtlMin: number;     // JWT expiration in minutes
}
```

**Precedence**: If `apiBaseUrl` is non-empty, backend mode takes precedence (demoMode is ignored).

### Component: Socket.IO Client Manager

**Purpose**: Manages WebSocket connection and real-time subscriptions.

**Location**: `mallchain-os-v14/src/services/socket.ts`

**Responsibilities**:
1. Establish WebSocket connection
2. Handle subscribe/unsubscribe events
3. Listen for incoming real-time updates
4. Implement automatic reconnection
5. Re-subscribe on reconnection
6. Provide cleanup on unmount

**Key Methods**:
```javascript
socketManager.connect(url);
socketManager.subscribeWallet(address);
socketManager.onWalletUpdate((data) => {...});
socketManager.disconnect();
```

**Reconnection Strategy**:
- Automatic reconnection with exponential backoff
- Max backoff: 10 seconds
- Re-subscription on successful reconnection
- Connection status available for UI indicators

### Component: CORS Middleware (Backend)

**Purpose**: Validate cross-origin requests and inject CORS headers.

**Location**: `backend/src/middleware/cors.ts`

**Responsibilities**:
1. Read FRONTEND_URL from environment
2. Parse additional allowed origins from CORS_ORIGINS
3. Validate request origin
4. Inject CORS headers if origin is allowed
5. Return 403 Forbidden if origin not allowed

**Allowed Origins**:
- Development: http://localhost:5173
- Production: URLs from FRONTEND_URL and CORS_ORIGINS env vars

**Example Configuration**:
```bash
FRONTEND_URL=https://app.example.com
CORS_ORIGINS=https://staging.example.com,https://dev.example.com
```

### Component: Authentication Middleware (Backend)

**Purpose**: Validate JWT tokens and protect routes.

**Location**: `backend/src/middleware/auth.ts`

**Responsibilities**:
1. Extract Bearer token from Authorization header
2. Verify token signature using JWT_SECRET
3. Attach user info to request
4. Return 401 for missing/invalid tokens
5. Return 403 for expired tokens
6. Skip auth for public routes

**Public Routes** (no auth required):
- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`

**Protected Routes** (auth required):
- `GET /api/wallets/:address/balances`
- `POST /api/tx`
- `POST /api/market/:id/buy`
- All other protected endpoints

**Token Extraction**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                └─ prefix ─┘ └──────────── token ─────────────┘

Extracted token verified against JWT_SECRET
```



### Component: Socket.IO Server (Backend)

**Purpose**: Manage WebSocket connections and broadcast real-time events.

**Location**: `backend/src/socket/index.ts`

**Responsibilities**:
1. Create Socket.IO server on HTTP server
2. Configure CORS for WebSocket
3. Handle client connections/disconnections
4. Manage room subscriptions
5. Broadcast events to rooms
6. Cache and serve recent data on subscription

**Event Handlers**:

1. **Client Events** (received from frontend):
   - `subscribe:wallet` → Join `wallet:{address}` room
   - `subscribe:market` → Join `market:feed` room
   - `subscribe:price` → Join `price:updates` room
   - `subscribe:blocks` → Join `blocks:live` room
   - `unsubscribe:wallet` → Leave `wallet:{address}` room

2. **Server Emit Events** (sent to frontend):
   - `system` → Connection status messages
   - `wallet:update` → Wallet balance changes
   - `block:new` → New blockchain blocks
   - `market:feed` → Marketplace activity
   - `price:current` → Price updates

**Example: Wallet Subscription**:
```javascript
// Backend
io.on('connection', (socket) => {
  socket.on('subscribe:wallet', (address) => {
    socket.join(`wallet:${address}`);
    
    // Send cached data immediately
    const cachedWallet = getWalletFromCache(address);
    socket.emit('wallet:update', cachedWallet);
  });
});

// Broadcast wallet update when balance changes
io.to(`wallet:${address}`).emit('wallet:update', updatedWallet);
```

## Endpoint Mapping

### Authentication Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | No | User login, returns JWT token |
| `/api/auth/register` | POST | No | User registration |
| `/api/auth/logout` | POST | Yes | User logout (clear token) |

### Blockchain Data Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/wallets/:address/balances` | GET | Optional | Get wallet balances |
| `/api/transactions/:address` | GET | Yes | Get transaction history |
| `/api/validators` | GET | No | Get validator list |
| `/api/explorer/blocks` | GET | No | Get block explorer data |
| `/api/staking/:address` | GET | Yes | Get staking info |

### Transaction Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/tx` | POST | Yes | Submit transaction |
| `/api/tx/:txHash` | GET | No | Get transaction status |
| `/api/blockchain/tx` | POST | Yes | Broadcast transaction |

### Marketplace Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/market` | GET | No | List marketplace items |
| `/api/market` | POST | Yes | Create listing |
| `/api/market/:id/buy` | POST | Yes | Purchase item |
| `/api/market/user/:address` | GET | Yes | Get user's listings |

### Health & Monitoring Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | No | Backend health status |
| `/api/ready` | GET | No | Service readiness check |
| `/api/live` | GET | No | Process liveness check |
| `/metrics` | GET | Optional | Prometheus metrics |



## Authentication & Security

### JWT Token Flow

```
1. User Login
   POST /api/auth/login
   {username, password}
        ↓
   Backend verifies credentials against MongoDB
        ↓
2. Token Generation
   Backend creates JWT payload:
   {userId, username, exp: now + sessionTtlMin}
        ↓
   Signed with JWT_SECRET
        ↓
   Response: {ok: true, data: {token, user}}
        ↓
3. Frontend Storage
   localStorage.setItem('token', token)
        ↓
4. Subsequent Requests
   Authorization: Bearer {token}
        ↓
   Backend extracts & verifies token
        ↓
5. Token Expiration
   When exp < current time, token is invalid
   Backend returns 403 Forbidden
        ↓
   Frontend clears localStorage['token']
   Frontend redirects to login page
```

### CORS Security

**Development (localhost)**:
- FRONTEND_URL=http://localhost:5173
- Allows requests from http://localhost:5173
- Credentials enabled for testing

**Production**:
- FRONTEND_URL=https://app.example.com
- CORS_ORIGINS=https://staging.example.com
- Only these origins can make requests
- HTTPS enforced

**Security Properties**:
1. Browser enforces CORS pre-flight checks (OPTIONS)
2. Requests from disallowed origins are blocked by browser
3. Credentials require explicit `Access-Control-Allow-Credentials: true`
4. Never use wildcard `*` in production with credentials

### Rate Limiting

**Purpose**: Prevent brute force attacks and DoS

**Configuration**:
- General endpoints: 120 requests/minute per IP
- Transaction endpoints: 40 requests/minute per IP
- Mines endpoints: 100 requests/minute per IP

**Implementation**:
- Redis-backed for distributed accuracy
- Per-IP tracking across multiple servers
- Response: 429 Too Many Requests when limit exceeded

**User Experience**:
```
1. User makes rapid requests
2. Rate limiter triggered
3. Response: {ok: false, code: 429, error: "Rate limit exceeded"}
4. Frontend displays: "Too many requests. Please wait a moment."
5. User can retry after window resets
```

### WebSocket Security

**Room Management**:
- Rooms are server-managed (frontend cannot create arbitrary rooms)
- Only valid room names accepted: `wallet:{address}`, `market:feed`, etc.
- Backend validates wallet address format before subscription

**Event Validation**:
- All incoming events validated for required fields
- Malformed events are silently dropped
- Event rate limited per socket to prevent spam



## Error Handling

### Network Error Handling

**Scenario**: Frontend cannot reach backend (backend down or network failure)

**Flow**:
```
Frontend: api.get('/api/data')
    ↓
fetch() throws error (connection refused)
    ↓
API service catches error
    ↓
Returns: {ok: false, error: "Failed to fetch"}
    ↓
Frontend displays: "Unable to connect to server"
    ↓
No automatic retry (user can manually refresh)
```

**User Actions**:
1. Check if backend is running
2. Manually retry operation
3. Optional: Check network connectivity

### Authentication Error Handling

**401 Unauthorized** (invalid/missing token)

```
Backend: Returns 401 with {error: "Invalid token"}
    ↓
Frontend API interceptor detects 401
    ↓
localStorage.removeItem('token')
    ↓
Redirect to login page
    ↓
User must re-authenticate
```

**403 Forbidden** (expired token)

```
Backend: Returns 403 with {error: "Token expired"}
    ↓
Frontend clears token
    ↓
Redirects to login with message: "Your session expired"
    ↓
User logs in again to get new token
```

### Rate Limit Error Handling

**429 Too Many Requests**

```
Backend: Returns 429 with {error: "Rate limit exceeded"}
    ↓
Frontend receives: {ok: false, code: 429, error: "..."}
    ↓
Display: "Too many requests. Please wait a moment."
    ↓
Wait for rate limit window to reset (typically 60 seconds)
    ↓
Retry operation
```

### WebSocket Connection Errors

**Connection Failure**:
```
Socket.IO client: connection fails
    ↓
Emits: 'connect_error' event
    ↓
Frontend displays: "Real-time updates unavailable"
    ↓
Automatic reconnection with exponential backoff
    ↓
On successful reconnection: "Real-time updates restored"
    ↓
Frontend re-subscribes to previously subscribed rooms
```

### HTTP Status Code Handling

| Code | Meaning | Frontend Action |
|------|---------|-----------------|
| 200 | Success | Use data |
| 400 | Bad Request | Display validation error |
| 401 | Unauthorized | Clear token, redirect to login |
| 403 | Forbidden (token expired) | Clear token, redirect to login |
| 404 | Not Found | Display error message |
| 429 | Rate Limited | Display wait message |
| 500 | Server Error | Display error, suggest retry |
| 503 | Service Unavailable | Display error, check health |



## Performance Optimization

### Backend Performance

**API Response Time Targets**:
- Cached queries (Redis): < 200ms
- Database queries (MongoDB with indexes): < 500ms
- Blockchain RPC calls: < 1000ms

**Optimization Strategies**:
1. Redis caching for frequent queries (wallet balances, validator list)
2. Database indexing on commonly filtered fields
3. Connection pooling for MongoDB
4. Rate limiting to prevent server overload

**Monitoring**:
- Track response times per endpoint
- Alert on slowdowns > target
- Use Prometheus metrics for analysis

### Frontend Performance

**Request Deduplication**:
- When multiple components request same data simultaneously
- API service caches requests for 5 seconds
- Prevents redundant network calls

**Socket Event Throttling**:
- High-frequency events (blocks every 3 seconds)
- Debounce/throttle UI updates to once per second
- Prevents excessive re-renders

**Memory Management**:
- Cleanup socket listeners on component unmount
- Remove timers on component unmount
- Prevents memory leaks with long-running app

**Bundle Size**:
- Target: < 500KB gzipped
- Code splitting for heavy features
- Lazy loading of routes

### Concurrent Connection Handling

**Socket.IO Capacity**:
- Single server: 100-500 concurrent connections
- Horizontal scaling: Add Redis adapter
- Redis adapter enables connections across multiple servers

**Load Distribution**:
- Frontend clients connect to any backend instance
- Socket.IO with Redis adapter: events reach all servers
- Browsers implement automatic reconnection on instance failure



## Environment Configuration

### Frontend Environment Variables

**Location**: `.env` file in `mallchain-os-v14/` directory

**Variables**:
```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:4000    # Leave empty for demo mode

# Mode
VITE_DEMO_MODE=false                       # Set to false when using real backend

# Network
VITE_NETWORK=testnet                       # 'mainnet' or 'testnet'

# Session
VITE_SESSION_TTL=120                       # JWT expiration in minutes
```

**Defaults** (when environment variable not set):
- `VITE_API_BASE_URL`: empty string (demo mode)
- `VITE_DEMO_MODE`: true (use local store)
- `VITE_NETWORK`: 'testnet'
- `VITE_SESSION_TTL`: 120 minutes

**Configuration Loading**:
- Variables loaded at build time by Vite
- Immutable during runtime
- Use `import.meta.env.VITE_*` to access

### Backend Environment Variables

**Location**: `.env` file in `backend/` directory

**Required Variables**:
```bash
# Server
NODE_ENV=development                # 'development' or 'production'
PORT=4000                           # Server port

# Database
MONGO_URI=mongodb://localhost:27017/mallchain

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379

# Secrets
JWT_SECRET=your-secret-key-min-32-characters-long
SESSION_SECRET=your-session-secret-min-32-characters-long

# Frontend
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:3000,https://staging.example.com

# Backend Public URL
BACKEND_PUBLIC_URL=http://localhost:4000

# Blockchain
CHAIN_ID=mall-1
CHAIN_RPC=http://localhost:26657
CHAIN_REST=http://localhost:1317
```

**Validation**:
- `JWT_SECRET` must be >= 32 characters
- `SESSION_SECRET` must be >= 32 characters
- `MONGO_URI` must be valid MongoDB connection string
- `FRONTEND_URL` must be valid HTTP(S) URL
- `PORT` must be valid port number (1-65535)

**Startup Validation**:
- Backend validates all required variables at startup
- Exits with code 1 if validation fails
- Server does not start without valid configuration



## Development & Testing Setup

### Starting the Integration Locally

**Prerequisites**:
1. Node.js 16+ installed
2. MongoDB running on localhost:27017
3. Redis running on localhost:6379
4. Blockchain node running (RPC on 26657, REST on 1317)

**Step 1: Configure Backend**
```bash
cd backend
cp .env.example .env
# Edit .env with local configuration
npm install
npm start
# Verify: curl http://localhost:4000/api/health
```

**Step 2: Configure Frontend**
```bash
cd mallchain-os-v14
cp .env.example .env
# Set VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev
# Frontend available at http://localhost:5173
```

**Step 3: Verify Connection**
1. Open browser to http://localhost:5173
2. Open DevTools console
3. Should see: "Socket connected" message
4. Try logging in - should work

### Testing Scenarios

**Test 1: Real Backend Mode**
- Set `VITE_API_BASE_URL=http://localhost:4000`
- Set `VITE_DEMO_MODE=false`
- Frontend makes real HTTP requests
- Expected: Data from backend

**Test 2: Demo Mode**
- Set `VITE_API_BASE_URL=` (empty)
- Set `VITE_DEMO_MODE=true`
- Frontend uses local store
- Expected: Simulated data

**Test 3: Authentication Flow**
1. Click login
2. Enter credentials
3. Verify token in localStorage: `localStorage.getItem('token')`
4. Make API request
5. Verify Authorization header: `Authorization: Bearer {token}`

**Test 4: Real-time Updates**
1. Login successfully
2. Subscribe to wallet updates
3. Open browser console: should see socket events
4. Make transaction
5. Verify real-time wallet update

**Test 5: CORS Validation**
1. Make request from allowed origin (localhost:5173)
2. Verify: Response includes `Access-Control-Allow-Origin` header
3. Make request from disallowed origin
4. Verify: Browser blocks request (check console)

**Test 6: Rate Limiting**
1. Make rapid requests (> 120/minute) to general endpoint
2. Verify: Response code 429 after limit exceeded
3. Wait 60 seconds
4. Verify: Can make requests again



## Troubleshooting Guide

### Frontend Cannot Connect to Backend

**Symptoms**:
- Error: "Failed to fetch"
- API calls always fail
- Console: "Error: Backend unreachable"

**Diagnosis**:
1. Check backend is running: `curl http://localhost:4000/api/health`
2. Check `VITE_API_BASE_URL` is set correctly
3. Check network connectivity
4. Check firewall allowing port 4000

**Solution**:
1. Start backend service
2. Verify backend logs show "Server listening"
3. Test health endpoint
4. Refresh frontend

### CORS Error in Browser Console

**Error**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Causes**:
1. FRONTEND_URL not set correctly in backend .env
2. Frontend origin not in CORS_ORIGINS list
3. Credentials flag issue

**Solution**:
1. Check FRONTEND_URL matches frontend URL
2. Add frontend URL to CORS_ORIGINS if needed
3. Verify both http and https variants if needed
4. Restart backend

### JWT Token Errors

**Error**: "Invalid or expired token" (401 response)

**Causes**:
1. Token missing from localStorage
2. Token corrupted
3. Token expired
4. JWT_SECRET changed (invalidates all tokens)

**Solution**:
1. Clear localStorage: `localStorage.clear()`
2. Log out and log back in
3. Check token not too old: `localStorage.getItem('token')`
4. Verify JWT_SECRET not changed in backend

### WebSocket Connection Failed

**Symptoms**:
- Console: "WebSocket failed"
- Real-time updates not working
- No "Socket connected" message

**Causes**:
1. Backend Socket.IO server not running
2. CORS not configured for WebSocket
3. Firewall blocking WebSocket

**Solution**:
1. Verify backend running
2. Check Socket.IO CORS config includes frontend URL
3. Try different port if 4000 blocked
4. Check browser console for specific error

### Database Connection Issues

**Error**: "MongoDB connection failed" or "Redis connection failed"

**Symptoms**:
- Backend won't start
- API requests fail randomly
- Cached data not available

**Solution**:
1. Verify MongoDB running: `mongo localhost:27017`
2. Verify Redis running: `redis-cli ping`
3. Check MONGO_URI and REDIS_* env vars
4. Restart database services

### Rate Limiting False Positives

**Issue**: Getting 429 (Rate Limited) when not making many requests

**Causes**:
1. Rate limit window very small
2. Multiple components making same request
3. Automatic retries triggering limit

**Solution**:
1. Implement request deduplication in API service
2. Batch requests when possible
3. Increase rate limit in configuration if appropriate



## Architecture Correctness Properties

These properties should hold true at all times during operation:

### Property 1: Mode Consistency
**Statement**: Within a single session, if `config.apiBaseUrl` is non-empty, ALL API requests use the real backend. If `config.apiBaseUrl` is empty, ALL API requests use local store simulation.

**Verification**: 
- Check API service implementation
- Verify decision made once at startup
- Confirm no mid-session mode switching

### Property 2: CORS Origin Validation  
**Statement**: For any HTTP request to backend, if the request origin is in the allowed origins list, the response includes `Access-Control-Allow-Origin` header. If not, request is blocked by browser.

**Verification**:
- Make request from localhost:5173 (allowed) → should succeed
- Make request from localhost:3000 (not allowed) → should get CORS error
- Check CORS headers in response

### Property 3: Authentication Isolation
**Statement**: For protected endpoints, requests without valid JWT token receive 401 response. Requests with valid token proceed normally.

**Verification**:
- Make request without Authorization header → 401
- Make request with valid token → 200
- Make request with invalid token → 401
- Make request with expired token → 403

### Property 4: WebSocket Room Isolation
**Statement**: Events emitted to room `wallet:address_A` are received only by sockets subscribed to `wallet:address_A`, NOT by sockets subscribed to `wallet:address_B` (even if same backend).

**Verification**:
- User A subscribes to wallet A
- User B subscribes to wallet B
- Event emitted for wallet A
- User A receives event, User B does not

### Property 5: Error Response Format
**Statement**: All error responses follow format `{ok: false, error: string}` or `{ok: false, code: number, error: string}`. All success responses follow `{ok: true, data: T}`.

**Verification**:
- Check all endpoint responses follow format
- Verify error responses always include `ok: false`
- Verify success responses always include `ok: true`

### Property 6: Token Expiration
**Statement**: JWT tokens expire after `sessionTtlMin` minutes from issuance. Expired tokens cause backend to return 403.

**Verification**:
- Decode token: check `exp` field
- Wait past expiration
- Make request with expired token → 403 response
- Frontend clears token and redirects to login

### Property 7: Configuration Immutability
**Statement**: Environment configuration loaded at startup remains constant throughout process lifetime. No runtime configuration changes.

**Verification**:
- Config loaded from env vars at startup
- Restarting process picks up new env vars
- Changing env vars without restart has no effect

### Property 8: Simulation Pause on Real API
**Statement**: When `config.apiBaseUrl` is set (non-empty), all simulation timers (in `sim` controller) must be paused/cancelled.

**Verification**:
- Check sim controller state when apiBaseUrl empty vs non-empty
- Verify no simulations fire when using real backend
- Check simulation timers cleaned up



## Deployment Architecture

### Development Environment

**Configuration**:
- NODE_ENV=development
- Backend: localhost:4000 (HTTP)
- Frontend: localhost:5173 (HTTP)
- Relaxed CORS (localhost only)
- Detailed logging with Morgan 'dev' format

**Database**:
- MongoDB on localhost:27017 (development instance)
- Redis on localhost:6379 (development instance)

**Blockchain**:
- Local testnet node
- RPC: http://localhost:26657
- REST: http://localhost:1317

### Production Environment

**Configuration**:
- NODE_ENV=production
- Backend: HTTPS (port 443 or 8443)
- Frontend: HTTPS (CDN or reverse proxy)
- Strict CORS (explicit origins only)
- Production logging with Morgan 'combined' format
- All secrets validated at startup

**Database**:
- MongoDB on managed service or self-hosted
- Redis on managed service or self-hosted
- Connection pooling configured

**Blockchain**:
- Production mainnet node
- RPC endpoint from blockchain provider
- REST endpoint from blockchain provider

**Security**:
- HTTPS enforced (HSTS headers)
- Secure cookies (secure: true flag)
- Content Security Policy headers
- Input validation on all endpoints
- Rate limiting enabled

### Multi-Instance Architecture

For high-availability production deployments:

```
┌─────────────────────────────────────────┐
│ CDN / Load Balancer                     │
│ (HTTPS, routes traffic to backends)     │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┬─────────────┐
    │                 │             │
┌───▼───┐         ┌───▼───┐    ┌───▼───┐
│Backend│         │Backend│    │Backend│
│ Inst1 │         │ Inst2 │    │ Inst3 │
└───┬───┘         └───┬───┘    └───┬───┘
    │                 │             │
    └─────────────────┼─────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼──┐  ┌─────▼──┐  ┌─────▼──┐
    │MongoDB│  │ Redis  │  │Blockchain
    │Cluster│  │ Cluster│  │ Mainnet
    └────────┘  └────────┘  └──────────
```

**Key Components**:
1. Load Balancer: Routes requests to backend instances
2. Multiple Backend Instances: Running same code, sharing data layer
3. Shared Data Layer: MongoDB, Redis, Blockchain accessible by all instances
4. Socket.IO with Redis Adapter: Events broadcast across all backend instances

**Socket.IO Scaling**:
```javascript
// backend/src/socket/index.ts
import { createAdapter } from "@socket.io/redis-adapter";

const io = new Server(httpServer, {
  adapter: createAdapter(redisClient, redisSubscriberClient)
});

// Events emitted by any instance reach all instances
// Rooms are shared across instances
// Clients can connect to any instance
```



## Data Models and Schemas

### API Result Schema

**Success Response**:
```json
{
  "ok": true,
  "data": {
    // Endpoint-specific data
  }
}
```

**Error Response**:
```json
{
  "ok": false,
  "error": "Error description",
  "code": 400
}
```

### JWT Token Schema

**Payload (decoded)**:
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "username": "user@example.com",
  "exp": 1704067200,
  "iat": 1703980800
}
```

**As Sent**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6InVzZXJAZXhhbXBsZS5jb20iLCJleHAiOjE3MDQwNjcyMDAsImlhdCI6MTcwMzk4MDgwMH0.abcd1234...
```

### Wallet Update Event Schema

**Socket Event**:
```javascript
socket.on('wallet:update', (data) => {
  console.log(data);
  // {
  //   address: "mall1abc123...",
  //   balances: {
  //     umalc: 1000000,
  //     umall: 500000
  //   },
  //   timestamp: 1703980800000
  // }
});
```

### Block Event Schema

**Socket Event**:
```javascript
socket.on('block:new', (data) => {
  console.log(data);
  // {
  //   height: 12345,
  //   hash: "1A2B3C4D...",
  //   timestamp: "2024-01-01T12:00:00Z",
  //   txCount: 42
  // }
});
```

### Transaction Request Schema

**API Request**:
```javascript
POST /api/tx
Content-Type: application/json
Authorization: Bearer {token}

{
  "type": "transfer",
  "amount": 100,
  "asset": "umalc",
  "kind": "debit",
  "note": "Payment for item #123"
}

Response:
{
  "ok": true,
  "data": {
    "txHash": "1A2B3C4D...",
    "status": "pending"
  }
}
```



## API Client Usage Guide

### Basic API Calls

**GET Request**:
```javascript
import { api } from '@/services/api';

// Fetch data
const result = await api.get('/api/wallets/mall1abc.../balances');
if (result.ok) {
  console.log('Balances:', result.data.balances);
} else {
  console.error('Error:', result.error);
}
```

**POST Request**:
```javascript
// Create new item
const result = await api.post('/api/market', {
  name: 'Item Title',
  price: 100,
  description: 'Item description'
});
if (result.ok) {
  console.log('Created:', result.data.itemId);
}
```

**Mutate (Transaction)**:
```javascript
// Send transaction
const result = await api.mutate({
  type: 'transfer',
  amount: 100,
  asset: 'umalc',
  kind: 'debit',
  note: 'Payment'
});
if (result.ok) {
  console.log('Transaction sent:', result.data.txHash);
}
```

### Error Handling

```javascript
const result = await api.get('/api/data');

if (result.ok) {
  // Success
  useData(result.data);
} else if (result.code === 401) {
  // Authentication failed
  redirectToLogin();
} else if (result.code === 429) {
  // Rate limited
  showWaitMessage();
} else {
  // Other error
  showError(result.error);
}
```

### React Integration

**Using in Component**:
```javascript
import { useEffect, useState } from 'react';
import { api } from '@/services/api';

export function WalletComponent() {
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchBalances() {
      const result = await api.get('/api/wallets/mall1abc.../balances');
      if (result.ok) {
        setBalances(result.data.balances);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    fetchBalances();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h2>Wallet Balances</h2>
      {Object.entries(balances).map(([asset, amount]) => (
        <div key={asset}>{asset}: {amount}</div>
      ))}
    </div>
  );
}
```

### WebSocket Integration

**Subscribing to Real-Time Updates**:
```javascript
import { socketManager } from '@/services/socket';
import { useEffect, useState } from 'react';

export function RealTimeWallet() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    // Subscribe to wallet updates
    socketManager.subscribeWallet('mall1abc...');

    // Listen for updates
    const unsubscribe = socketManager.onWalletUpdate((data) => {
      setWallet(data);
    });

    return () => {
      // Cleanup: unsubscribe and remove listener
      unsubscribe();
      socketManager.unsubscribeWallet('mall1abc...');
    };
  }, []);

  if (!wallet) return <div>Waiting for updates...</div>;
  
  return (
    <div>
      <h2>Live Wallet: {wallet.address}</h2>
      {Object.entries(wallet.balances).map(([asset, amount]) => (
        <div key={asset}>{asset}: {amount}</div>
      ))}
      <p>Updated: {new Date(wallet.timestamp).toLocaleString()}</p>
    </div>
  );
}
```



## Next Steps and Future Enhancements

### Current Integration Status

The integration architecture establishes:
- ✅ Real-time WebSocket communication
- ✅ Secure JWT authentication
- ✅ CORS configuration for cross-origin requests
- ✅ Rate limiting for protection
- ✅ Dual-mode frontend (real backend or demo)
- ✅ Error handling and recovery
- ✅ Health checks and monitoring

### Recommended Future Enhancements

**1. Request Caching & SWR**
- Implement stale-while-revalidate pattern
- Cache API responses in localStorage or IndexedDB
- Reduce network requests and improve perceived performance

**2. Offline Mode**
- Queue requests while offline
- Sync when connection restored
- Service worker for offline support

**3. Optimistic Updates**
- Update UI immediately when user takes action
- Revert if server response indicates failure
- Improves perceived responsiveness

**4. Progressive Enhancement**
- GraphQL integration for flexible data queries
- Subscription support via WebSocket
- Reduce over-fetching of data

**5. Enhanced Security**
- Refresh token rotation
- HttpOnly cookie storage for tokens
- CSRF protection
- Content Security Policy refinement

**6. Monitoring & Analytics**
- Real user monitoring (RUM)
- Error tracking and reporting
- Performance metrics collection
- User behavior analytics

**7. API Versioning**
- Versioned endpoints (/api/v1/*, /api/v2/*)
- Gradual API evolution without breaking changes
- Backward compatibility support

**8. Documentation Generation**
- OpenAPI/Swagger specification
- Auto-generated API documentation
- Interactive API explorer
- Schema validation

## References

### Backend Architecture
- Location: `backend/src/`
- Main entry: `backend/src/index.ts`
- Socket.IO server: `backend/src/socket/index.ts`
- Middleware: `backend/src/middleware/`
- Routes: `backend/src/routes/`

### Frontend Architecture
- Location: `mallchain-os-v14/src/`
- API service: `mallchain-os-v14/src/services/api.ts`
- Socket manager: `mallchain-os-v14/src/services/socket.ts`
- Config: `mallchain-os-v14/src/config/index.ts`
- Components: `mallchain-os-v14/src/components/`

### Related Documentation
- [API Reference](./API_REFERENCE.md)
- [Environment Setup Guide](./INTEGRATION_SETUP.md)
- [Security Audit Report](./SECURITY_AUDIT_REPORT.md)
- [Production Engineering Guide](../MALLCHAIN_PRODUCTION_ENGINEERING_GUIDE.md)

### External Resources
- Socket.IO: https://socket.io/
- JWT: https://jwt.io/
- CORS: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- Express: https://expressjs.com/
- React: https://react.dev/

## Summary

This integration architecture provides a robust, secure foundation for real-time blockchain data synchronization between the frontend and backend. Key design principles include:

1. **Separation of Concerns**: Frontend, backend, and data layer are loosely coupled
2. **Security First**: Authentication, CORS, rate limiting, and input validation at every layer
3. **Resilience**: Error handling, automatic reconnection, and graceful degradation
4. **Performance**: Caching, request deduplication, and connection pooling
5. **Scalability**: Multi-instance support via Redis adapter and load balancing
6. **Developer Experience**: Dual-mode operation, clear API contracts, comprehensive error messages

The architecture supports both development (demo mode) and production (real backend) workflows, enabling efficient development without requiring all infrastructure running simultaneously.

