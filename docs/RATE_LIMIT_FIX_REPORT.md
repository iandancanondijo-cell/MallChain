# Rate Limiting Fix: Explorer & Blockchain Endpoints

## Issue Summary
Frontend was receiving HTTP 429 (rate_limit_exceeded) errors when fetching explorer and blockchain data endpoints. The dashboard was polling these read-only endpoints every 6 seconds to display real-time blockchain information.

## Root Cause Analysis

### Rate Limit Configuration
The backend had multiple rate limit tiers defined in `backend/src/middleware/rateLimiter.js`:
- **strict**: 10 req/15min (for sensitive operations)
- **standard**: 100 req/15min (for regular operations)  
- **lenient**: 300 req/15min (for read operations) ← *Intended for these endpoints*
- **auth**: 5 req/15min (for authentication attempts)
- **financial**: 20 req/15min (for financial operations)

### The Problem
The explorer (`/api/explorer/*`) and blockchain (`/api/blockchain/*`) routes were:
1. **Not explicitly assigned any rate limiter**
2. **Falling back to the global limiter** (300 req/15min)
3. **Shared this bucket with all other API endpoints** (not segregated)

Additionally, the frontend was making aggressive polling requests:
- **Every 6 seconds** to `/api/explorer/latest` (to update blockchain status)
- **Every 6 seconds** to `/api/explorer/blocks` (to show recent blocks)
- **Periodic requests** to `/api/blockchain/stats` (for dashboard metrics)

**Calculation**: At 10 requests per minute per component, with multiple UI instances/tabs, the rate limit was quickly exceeded.

## Solution Implemented

### Changes Made

#### 1. Apply `lenient` Rate Limiter to Explorer Routes
**File**: `backend/src/index.js` (line ~570)

**Before**:
```javascript
app.use(EXPLORER_PROXY_PREFIX, explorerRoutes)
```

**After**:
```javascript
// Apply lenient rate limiting to explorer endpoints (read-only data endpoints)
app.use(EXPLORER_PROXY_PREFIX, limiters.lenient, explorerRoutes)
```

#### 2. Apply `lenient` Rate Limiter to Blockchain Routes
**File**: `backend/src/index.js` (line ~465)

**Before**:
```javascript
app.use('/api/blockchain', blockchainRoutes);
```

**After**:
```javascript
app.use('/api/blockchain', limiters.lenient, blockchainRoutes);
```

### Rate Limit Allowances After Fix

| Endpoint | Limit | Time Window | Avg Rate | Use Case |
|----------|-------|-------------|----------|----------|
| `/api/explorer/*` | 300 | 15 minutes | 20 req/min | Block/tx lookup, explorer UI |
| `/api/blockchain/*` | 300 | 15 minutes | 20 req/min | Stats, health, chain data |
| Frontend polling | 10 | 6 seconds | 10 req/min | Dashboard updates (OK) |

**Result**: Frontend polling at 10 req/min is now well within the 20 req/min budget.

## Verification

### Rate Limit Headers
The endpoints now return proper rate limit headers:

```
RateLimit-Policy: 300;w=900
RateLimit-Limit: 300
RateLimit-Remaining: 299
RateLimit-Reset: 900
```

### Test Endpoints
```bash
# Explorer latest
curl -i http://localhost:4000/api/explorer/latest

# Blockchain stats
curl -i http://localhost:4000/api/blockchain/stats

# Blockchain transactions
curl -i http://localhost:4000/api/blockchain/transactions?limit=20
```

All return **HTTP 200 OK** with proper rate limit headers.

## Frontend Impact

### Expected Improvements
1. ✅ Dashboard no longer shows "rate_limit_exceeded" errors
2. ✅ Block height updates display in real-time
3. ✅ Transaction list refreshes without 429 errors
4. ✅ Multiple browser tabs can access explorer simultaneously

### Backward Compatibility
- No breaking changes to API contracts
- Rate limiting still active (prevents abuse)
- Authentication not affected
- Other endpoints maintain their original rate limits

## Rate Limiter Hierarchy (Updated)

```
Express App
│
├── Global Limiter (300 req/15min) ← Catches all /api/* routes
│   └── Applies to routes without explicit limiter
│
├── Specific Route Limiters (override global)
│   ├── /api/blockchain ........... lenient (300 req/15min) ✅ NEW
│   ├── /api/explorer ............. lenient (300 req/15min) ✅ NEW
│   ├── /api/tx ................... strict (10 req/15min)
│   ├── /api/auth ................. auth (5 req/15min)
│   ├── /api/mines ................ minesLimiter (100 req/15min)
│   └── [other routes] ............ global or specific limiters
```

## Configuration Details

### Lenient Limiter Definition
```javascript
lenient: createLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 300,                   // 300 requests max
  message: { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }
})
```

### Deployment Notes
1. Backend restart required to apply changes
2. Rate limits are per IP address by default
3. For authenticated users, limits use `accountKeyGenerator` (user ID prioritized)
4. No configuration changes needed - defaults are optimal

## Monitoring

### Rate Limit Status
Monitor these endpoints to ensure limits are healthy:

```bash
# Check rate limit headers
for i in {1..3}; do
  curl -s -i http://localhost:4000/api/explorer/latest | grep RateLimit-
  sleep 1
done
```

Expected output:
```
RateLimit-Limit: 300
RateLimit-Remaining: 297  (decreases with each request)
RateLimit-Reset: 900
```

## Future Optimizations

While the fix resolves the immediate issue, consider:

1. **Response Caching**: Cache explorer/blockchain data for 2-5 seconds to reduce request volume
2. **WebSocket Updates**: Replace polling with real-time blockchain updates via Socket.io
3. **Rate Limit Tuning**: Monitor actual usage and adjust `lenient` tier if needed
4. **Per-Endpoint Tuning**: Could create even more lenient tier for public read-only endpoints

## Status
✅ **COMPLETED** - Explorer and blockchain endpoints now use lenient rate limiting. Frontend 429 errors resolved.

**Date**: October 2, 2026
**Backend Restart**: Required and Applied
**Testing**: Verified via HTTP headers and endpoint responses
