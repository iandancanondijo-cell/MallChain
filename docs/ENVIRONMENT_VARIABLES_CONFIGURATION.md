# Environment Variables Configuration Guide

Complete reference for configuring the Mallchain backend-frontend integration through environment variables.

## Backend Environment Variables

### Database Configuration

**MONGO_URI** (Required)
- **Description**: MongoDB connection string
- **Format**: `mongodb://[username:password@]host[:port]/database[?options]`
- **Example**: `mongodb://localhost:27017/mallchain`
- **Production**: Use MongoDB Atlas connection string with authentication
- **Validation**: Format checked at startup, connection tested on server init

**REDIS_HOST** (Optional, Default: localhost)
- **Description**: Redis server hostname
- **Format**: Valid hostname or IP address
- **Example**: `localhost` or `redis.example.com`
- **Validation**: Optional for local development, required for production caching

**REDIS_PORT** (Optional, Default: 6379)
- **Description**: Redis server port
- **Format**: Integer 1-65535
- **Example**: `6379`
- **Validation**: Must be valid port number

### Authentication & Security

**JWT_SECRET** (Required)
- **Description**: Secret key for signing JWT tokens
- **Format**: String of minimum 32 characters
- **Example**: `your-secure-random-string-minimum-32-characters-long`
- **Validation**: Length checked at startup (>= 32 chars), fails if too short
- **Production**: Must be strong random string, stored in secrets manager

**JWT_EXPIRY** (Optional, Default: 7d)
- **Description**: JWT token expiration time
- **Format**: Duration string (e.g., `7d`, `24h`, `1800s`)
- **Example**: `7d`
- **Validation**: Parsed by jsonwebtoken library

**PASSWORD_SALT_ROUNDS** (Optional, Default: 10)
- **Description**: Bcrypt salt rounds for password hashing
- **Format**: Integer 8-15
- **Example**: `10`
- **Validation**: Must be in valid range (too low = insecure, too high = slow)

### API Configuration

**FRONTEND_URL** (Required)
- **Description**: Frontend application URL for CORS configuration
- **Format**: Valid URL with protocol
- **Example**: `http://localhost:5173` (dev) or `https://mallchain.example.com` (prod)
- **Validation**: Must be valid URL format
- **Note**: Allows frontend to access backend APIs

**CORS_ORIGINS** (Optional)
- **Description**: Additional comma-separated list of allowed CORS origins
- **Format**: Comma-separated URLs
- **Example**: `https://app.example.com,https://admin.example.com`
- **Validation**: Each URL parsed and validated
- **Default**: Uses FRONTEND_URL if not specified

**API_PORT** (Optional, Default: 4000)
- **Description**: Port for backend API server
- **Format**: Integer 1-65535
- **Example**: `4000`
- **Validation**: Must be available port

**API_HOST** (Optional, Default: 0.0.0.0)
- **Description**: Host to bind API server to
- **Format**: Valid IP address or hostname
- **Example**: `localhost` or `0.0.0.0`

### Blockchain Configuration

**BLOCKCHAIN_RPC_URL** (Required)
- **Description**: Blockchain RPC endpoint URL
- **Format**: Valid URL to blockchain RPC
- **Example**: `http://localhost:26657` or `https://rpc.example.com`
- **Validation**: URL format checked, RPC connectivity tested
- **Note**: Used for querying blockchain state, submitting transactions

**BLOCKCHAIN_REST_URL** (Optional)
- **Description**: Blockchain REST API endpoint URL
- **Format**: Valid URL to blockchain REST API
- **Example**: `http://localhost:1317` or `https://api.example.com`
- **Validation**: URL format checked

**BLOCKCHAIN_CHAIN_ID** (Required)
- **Description**: Blockchain network chain ID
- **Format**: String identifier
- **Example**: `mall-testnet-1` or `mall-mainnet-1`
- **Validation**: Validated against blockchain connection

### Rate Limiting

**RATE_LIMIT_REQUESTS** (Optional, Default: 100)
- **Description**: Maximum requests allowed per rate limit window
- **Format**: Integer
- **Example**: `100`
- **Validation**: Must be positive integer

**RATE_LIMIT_WINDOW_MS** (Optional, Default: 60000)
- **Description**: Rate limit window in milliseconds
- **Format**: Integer milliseconds
- **Example**: `60000` (1 minute)
- **Validation**: Must be positive integer

### Logging & Monitoring

**LOG_LEVEL** (Optional, Default: info)
- **Description**: Logging level
- **Format**: `error`, `warn`, `info`, `debug`, `trace`
- **Example**: `debug` (development) or `info` (production)
- **Validation**: Must be valid log level

**PROMETHEUS_ENABLED** (Optional, Default: true)
- **Description**: Enable Prometheus metrics collection
- **Format**: Boolean (`true` or `false`)
- **Example**: `true`
- **Validation**: Parsed as boolean

**PROMETHEUS_PORT** (Optional, Default: 9090)
- **Description**: Prometheus metrics endpoint port
- **Format**: Integer 1-65535
- **Example**: `9090`
- **Validation**: Must be available port

### Node Environment

**NODE_ENV** (Optional, Default: development)
- **Description**: Node.js environment
- **Format**: `development`, `production`, `test`
- **Example**: `production` (enables HTTPS, strict CSP)
- **Validation**: Must be valid environment
- **Note**: Controls security headers, logging verbosity

---

## Frontend Environment Variables

### API Configuration

**VITE_API_BASE_URL** (Optional, Default: empty)
- **Description**: Backend API base URL for real backend mode
- **Format**: Valid URL with protocol or empty string for demo mode
- **Example**: `http://localhost:4000` (dev) or `https://api.example.com` (prod)
- **Validation**: URL format checked at startup
- **Note**: Empty string enables demo mode with local store simulation

**VITE_DEMO_MODE** (Optional, Default: false)
- **Description**: Enable demo mode with local store simulation
- **Format**: Boolean string (`true` or `false`)
- **Example**: `true` (demo) or `false` (real API)
- **Validation**: Parsed as boolean
- **Note**: Automatically set based on VITE_API_BASE_URL if not specified

### Network Configuration

**VITE_NETWORK** (Optional, Default: testnet)
- **Description**: Blockchain network to connect to
- **Format**: `mainnet` or `testnet`
- **Example**: `testnet` (development) or `mainnet` (production)
- **Validation**: Must be valid network name

**VITE_SESSION_TTL** (Optional, Default: 120)
- **Description**: Session time-to-live in minutes
- **Format**: Integer minutes
- **Example**: `120` (2 hours)
- **Validation**: Must be positive integer

### Build Configuration

**VITE_HTTPS** (Optional, Default: false)
- **Description**: Enable HTTPS for development server
- **Format**: Boolean string (`true` or `false`)
- **Example**: `false` (dev) or `true` (if testing HTTPS)

**VITE_PORT** (Optional, Default: 5173)
- **Description**: Frontend development server port
- **Format**: Integer 1-65535
- **Example**: `5173` or `3000`

---

## Configuration Examples

### Development Setup

**Backend .env**:
```env
# Database
MONGO_URI=mongodb://localhost:27017/mallchain-dev
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
JWT_SECRET=dev-secret-key-minimum-32-characters-required
PASSWORD_SALT_ROUNDS=10

# API
FRONTEND_URL=http://localhost:5173
API_PORT=4000

# Blockchain
BLOCKCHAIN_RPC_URL=http://localhost:26657
BLOCKCHAIN_CHAIN_ID=mall-testnet-1

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

**Frontend .env.local**:
```env
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_MODE=false
VITE_NETWORK=testnet
VITE_SESSION_TTL=120
```

### Production Setup

**Backend .env**:
```env
# Database
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/mallchain-prod?retryWrites=true&w=majority
REDIS_HOST=redis.example.com
REDIS_PORT=6379

# Security
JWT_SECRET=<use-strong-random-32+-char-string-from-secrets-manager>
PASSWORD_SALT_ROUNDS=12

# API
FRONTEND_URL=https://mallchain.example.com
CORS_ORIGINS=https://mallchain.example.com,https://admin.example.com
API_PORT=4000

# Blockchain
BLOCKCHAIN_RPC_URL=https://rpc.mainnet.example.com
BLOCKCHAIN_CHAIN_ID=mall-mainnet-1

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

**Frontend .env.production**:
```env
VITE_API_BASE_URL=https://api.mallchain.example.com
VITE_DEMO_MODE=false
VITE_NETWORK=mainnet
VITE_SESSION_TTL=120
```

---

## Validation & Error Messages

### Backend Validation

Configuration validation occurs at server startup. If validation fails, server will not start:

- **JWT_SECRET too short**: "JWT_SECRET must be at least 32 characters"
- **MONGO_URI invalid format**: "Invalid MONGO_URI format"
- **BLOCKCHAIN_RPC_URL unreachable**: "Cannot connect to blockchain RPC endpoint"
- **CORS_ORIGINS invalid**: "Invalid CORS origin URL format"

### Frontend Validation

Configuration validation occurs at module load time:

- **VITE_API_BASE_URL invalid format**: Uses demo mode as fallback
- **Invalid VITE_NETWORK**: Falls back to testnet

---

## Security Best Practices

1. **Never commit .env files**: Use `.env.example` as template
2. **Store secrets securely**: Use environment management service (AWS Secrets Manager, Vault, etc.)
3. **Rotate JWT_SECRET regularly**: Update secret and rotate tokens
4. **Use strong passwords**: For database and service accounts
5. **HTTPS in production**: Set NODE_ENV=production for security headers
6. **Restrict CORS origins**: Only allow trusted frontend domains
7. **Monitor sensitive operations**: Log authentication and authorization events

---

## Troubleshooting

### "JWT_SECRET not configured"
- Add JWT_SECRET to backend .env
- Minimum 32 characters required
- Generate with: `openssl rand -base64 32`

### "Cannot connect to MongoDB"
- Verify MONGO_URI format
- Check MongoDB service is running
- For MongoDB Atlas, add IP to whitelist

### "CORS policy error in browser"
- Verify FRONTEND_URL in backend .env
- Ensure URL includes protocol (http:// or https://)
- Check browser console for actual rejected origin

### "API requests failing in frontend"
- Verify VITE_API_BASE_URL matches backend FRONTEND_URL
- Check backend is running on correct port
- Verify CORS configuration on backend

### "Real-time updates not working"
- Verify Socket.IO is enabled in backend
- Check VITE_API_BASE_URL includes WebSocket protocol support
- Verify firewall allows WebSocket connections

---

## Related Documentation

- **INTEGRATION_ARCHITECTURE.md** - System architecture overview
- **INTEGRATION_QUICKSTART.md** - Quick setup guide
- **SOCKET_IO_EVENTS.md** - Real-time event documentation
- **Deployment Guide** - Production deployment procedures
