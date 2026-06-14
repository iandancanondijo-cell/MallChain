# Blockchain Services Enhancement Guide

## Overview

This guide documents the new enhancements to the blockchain API services. These improvements focus on:
- **Reliability**: Circuit breaker pattern prevents cascading failures
- **Resilience**: Exponential backoff prevents node flooding
- **Observability**: Structured logging for debugging and auditing
- **Validation**: Input schema validation prevents garbage data
- **Error Handling**: Standardized error codes and messages

---

## New Utilities

### 1. Logger (`backend/src/utils/logger.js`)

**Purpose**: Structured logging across the application

**Usage in Controllers/Services:**
```javascript
const logger = require('../utils/logger')

// Log API request
logger.info('auth', 'User logged in', { userId: '123', email: 'user@example.com' })

// Log blockchain operation
logger.logBlockchainOp('delegated-tokens', { 
  validatorAddress: 'mall...',
  amount: '1000',
  gasUsed: 45000
})

// Log transaction status
logger.logTransaction('TXHASH123...', 'confirmed', { 
  block: 12345,
  fee: '5000umlcn'
})

// Log error with context
logger.error('blockchain', 'RPC call failed', error, { 
  endpoint: '/status',
  retryCount: 2
})
```

**Log Files Created:**
- `logs/info.log` - Normal operations
- `logs/warn.log` - Potential issues (slow queries, retries)
- `logs/error.log` - Failures requiring investigation
- `logs/debug.log` - Development details (dev mode only)

---

### 2. Error Handler (`backend/src/utils/errorHandler.js`)

**Purpose**: Standardized error responses with specific error codes

**Predefined Error Codes:**
```
Validation Errors (400):
  INVALID_ADDRESS, INVALID_AMOUNT, INVALID_SIGNATURE
  MISSING_REQUIRED_FIELD, INVALID_REQUEST_FORMAT

Auth Errors (401/403):
  UNAUTHORIZED, INSUFFICIENT_PERMISSIONS, INVALID_TOKEN

Not Found (404):
  NOT_FOUND, ADDRESS_NOT_FOUND, TRANSACTION_NOT_FOUND

Business Logic Errors (422):
  INSUFFICIENT_BALANCE, INSUFFICIENT_GAS, INVALID_TRANSACTION
  NONCE_MISMATCH

Rate Limit (429):
  RATE_LIMIT_EXCEEDED

Blockchain Errors (503/504):
  BLOCKCHAIN_UNAVAILABLE, RPC_TIMEOUT, RPC_ERROR
  CHAIN_UNAVAILABLE

Server Errors (500):
  DATABASE_ERROR, QUERY_ERROR, INTERNAL_ERROR
  UNKNOWN_ERROR, SERVICE_UNAVAILABLE
```

**Usage in Controllers:**
```javascript
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler')

// Throw specific error
if (!address.match(/^mall[a-z0-9]{38,}$/)) {
  throw new AppError(ErrorCodes.INVALID_ADDRESS)
}

if (balance < amount) {
  throw new AppError(
    ErrorCodes.INSUFFICIENT_BALANCE,
    'Your balance is too low',
    422,
    { required: amount, available: balance }
  )
}

// Wrap async route handlers
router.post('/send', asyncHandler(async (req, res) => {
  // If error is thrown, asyncHandler will catch and pass to errorHandler
}))
```

**Integration in app.js:**
```javascript
const { errorHandler } = require('./src/utils/errorHandler')

// Mount after all routes
app.use(errorHandler())
```

**Error Response Format:**
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Your balance is too low",
    "statusCode": 422,
    "timestamp": "2026-05-30T10:30:45.123Z",
    "details": {
      "required": 1000000,
      "available": 500000
    }
  }
}
```

---

### 3. Validation Schemas (`backend/src/utils/validationSchemas.js`)

**Purpose**: Joi-based input validation for all API endpoints

**Available Schemas:**
```javascript
const schemas = require('../utils/validationSchemas')

// Atomic schemas for reuse
schemas.addressSchema  // Validates bech32 addresses
schemas.amountSchema   // Validates positive numbers
schemas.txHashSchema   // Validates 64-char hex transaction hashes
schemas.memoSchema     // Validates optional memo (max 256 chars)
schemas.signatureSchema // Validates hex signatures
schemas.gasPriceSchema  // Validates gas prices (0-10000)

// Composite schemas for common operations
schemas.sendSchema              // For /api/send
schemas.stakingActionSchema     // For /api/staking/broadcast
schemas.governanceVoteSchema    // For /api/governance/vote
schemas.liquiditySchema         // For /api/liquidity/add, /remove
schemas.buyQuoteSchema          // For /api/buy/quote
schemas.walletConnectionSchema  // For wallet connection
```

**Usage in Routes:**
```javascript
const { validateRequest } = require('../utils/validationSchemas')
const schemas = require('../utils/validationSchemas')

// Method 1: Using middleware
router.post('/send', 
  validateRequest(schemas.sendSchema),
  async (req, res) => {
    const body = req.validatedBody // Already validated and typed
    // Process...
  }
)

// Method 2: Manual validation in controller
const { validate } = require('../utils/validationSchemas')

function sendController(req, res) {
  const { error, value } = validate(req.body, schemas.sendSchema)
  if (error) {
    throw new AppError(
      ErrorCodes.INVALID_REQUEST_FORMAT,
      'Validation failed',
      400,
      { details: error.details }
    )
  }
  // Process value...
}
```

**Validation Error Response:**
```json
{
  "error": {
    "code": "INVALID_REQUEST_FORMAT",
    "message": "Request validation failed",
    "details": [
      {
        "field": "toAddress",
        "message": "Invalid blockchain address format. Expected bech32 format..."
      },
      {
        "field": "amount",
        "message": "Amount must be a positive number"
      }
    ]
  }
}
```

---

### 4. Circuit Breaker (`backend/src/utils/circuitBreaker.js`)

**Purpose**: Prevent cascading failures by failing fast when services are unavailable

**States:**
- `CLOSED` - Normal operation, all requests go through
- `OPEN` - Service unavailable, all requests rejected immediately
- `HALF_OPEN` - Testing recovery, allowing limited requests

**Usage in Controllers:**
```javascript
const { createBlockchainBreaker } = require('../utils/circuitBreaker')

// Create once (typically in service initialization)
const rpcBreaker = createBlockchainBreaker()

// Use in controller/service
async function getBlockchainStats() {
  return await rpcBreaker.execute(async () => {
    const response = await fetch(`${RPC_URL}/blocks/latest`)
    if (!response.ok) throw new Error('RPC failed')
    return response.json()
  })
}

// Check status (for monitoring)
const status = rpcBreaker.getStatus()
console.log(status) // { state: 'CLOSED', failureCount: 0, ... }

// Reset manually if needed
rpcBreaker.reset()
```

**Integration in blockchainController.js:**
```javascript
const { createBlockchainBreaker, AppError, ErrorCodes } = require('../utils/circuitBreaker')

const blockchainBreaker = createBlockchainBreaker()

async function getBlockchainStats(req, res) {
  try {
    const stats = await blockchainBreaker.execute(async () => {
      const response = await fetch(`${BLOCKCHAIN_REST_API}/status`)
      if (!response.ok) throw new Error('Blockchain unavailable')
      return response.json()
    })
    res.json(stats)
  } catch (error) {
    if (error.code === ErrorCodes.SERVICE_UNAVAILABLE) {
      return res.status(503).json(error.toJSON())
    }
    throw error
  }
}
```

---

### 5. Exponential Backoff (`backend/src/utils/circuitBreaker.js`)

**Purpose**: Retry failed operations with exponential delay increases

**Usage in Services:**
```javascript
const { createBlockchainBackoff } = require('../utils/circuitBreaker')

const backoff = createBlockchainBackoff()

// In blockchainListener.js
async function pollBlockchainStatus() {
  return await backoff.execute(async () => {
    const response = await fetch(`${RPC_URL}/status`)
    if (!response.ok) throw new Error('RPC failed')
    return response.json()
  }, 'poll-blockchain')
}
```

**Behavior:**
```
Attempt 1: Immediate
Attempt 2: ~3 seconds + jitter
Attempt 3: ~6 seconds + jitter
Attempt 4: ~12 seconds + jitter
Attempt 5: ~24 seconds + jitter
...
Max: 60 seconds

Total time for all 10 attempts: ~180 seconds (3 minutes)
```

---

## Integration Checklist

### Phase 1: Core Setup (Week 1)
- [ ] Add `errorHandler()` middleware to `backend/src/app.js`
- [ ] Update `backend/src/routes/send.js` to use `asyncHandler` and validation
- [ ] Update `backend/src/routes/staking.js` to use validation
- [ ] Update `backend/src/controllers/blockchainController.js` to use circuit breaker
- [ ] Update `backend/src/services/blockchainListener.js` to use exponential backoff

### Phase 2: Expand Coverage (Week 2)
- [ ] Update all routes in `backend/src/routes/` to wrap with `asyncHandler`
- [ ] Add validation schemas to governance, liquidity, buy routes
- [ ] Update all controllers to use logger for transactions
- [ ] Add circuit breaker to database operations

### Phase 3: Observability (Week 3)
- [ ] Add Prometheus metrics (metrics.js)
- [ ] Add health check endpoints (`/health/ready`, `/health/live`)
- [ ] Monitor circuit breaker states in health endpoint
- [ ] Set up log rotation for large deployments

---

## Example Integration

### Before (Old Code)
```javascript
// routes/send.js
router.post('/send', async (req, res) => {
  try {
    const { toAddress, amount } = req.body
    
    // No validation - could be anything
    const tx = await buildAndBroadcast(toAddress, amount)
    res.json({ txHash: tx })
  } catch (err) {
    res.status(500).json({ error: err.message }) // Generic error
  }
})
```

### After (New Code)
```javascript
// routes/send.js
const { asyncHandler, validateRequest } = require('../utils/validationSchemas')
const schemas = require('../utils/validationSchemas')

router.post('/send',
  validateRequest(schemas.sendSchema),  // Validates before controller
  asyncHandler(async (req, res) => {
    const { toAddress, amount, denom } = req.validatedBody
    
    logger.info('send', 'Sending tokens', { toAddress, amount, denom })
    
    try {
      const tx = await blockchainBreaker.execute(async () => {
        return await buildAndBroadcast(toAddress, amount, denom)
      })
      
      logger.logTransaction(tx.txHash, 'broadcast', { amount, denom })
      res.json({ txHash: tx.txHash })
    } catch (error) {
      if (error.code === ErrorCodes.INSUFFICIENT_BALANCE) {
        logger.warn('send', 'Insufficient balance', { toAddress, amount })
      } else {
        logger.error('send', 'Transaction failed', error, { toAddress, amount })
      }
      throw error // Let asyncHandler catch and errorHandler format
    }
  })
)
```

---

## Monitoring & Debugging

### View Logs
```bash
# Watch info logs
tail -f logs/info.log

# Watch errors
tail -f logs/error.log

# Filter by context
grep "blockchain" logs/info.log | head -20

# Filter by transaction
grep "TXHASH123" logs/*.log
```

### Check Circuit Breaker Status
```javascript
// In a health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    blockchain: blockchainBreaker.getStatus(),
    database: databaseBreaker.getStatus(),
  })
})
```

### Common Error Codes to Handle in Frontend
```javascript
// 400 - Invalid input (show form error)
// 401 - Auth expired (redirect to login)
// 422 - Business logic failure (show specific error)
// 429 - Rate limited (wait and retry)
// 503 - Service down (show banner)
// 504 - Timeout (retry after delay)
```

---

## Next Steps

1. **Install Joi dependency** (if not already installed):
   ```bash
   npm install joi
   ```

2. **Update app.js** to register the error handler middleware

3. **Start with send.js route** - simplest route to refactor as example

4. **Expand to other routes** - use send.js as template

5. **Add Prometheus metrics** (Phase 3) for production monitoring

---

**Questions?** Review the utility files directly for more detailed docstrings.
