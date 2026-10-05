# Backend Health Status Investigation

**Date**: September 19, 2026  
**Investigation**: Backend `/api/health` endpoint showing "degraded" status

---

## HEALTH ENDPOINT RESPONSE

```json
{
  "status": "degraded",
  "backend": "ok",
  "chain": {
    "status": "ok",
    "chainId": "mallchain-1",
    "moniker": "validator1",
    "latestHeight": "40029",
    "latestBlockTime": "2026-09-19T03:56:01.045920069Z",
    "blockAgeMs": 8030,
    "restEndpoint": "http://127.0.0.1:1317",
    "timestamp": "2026-09-19T03:56:09.075Z"
  },
  "database": {
    "status": "ok"
  },
  "redis": {
    "status": "error"
  }
}
```

---

## ROOT CAUSE IDENTIFIED

**Degraded Cause**: Redis connection error

**Redis Status**: ❌ NOT RUNNING
```bash
$ redis-cli -p 6379 ping
Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Configuration**:
- Host: `127.0.0.1` (default from `.env`)
- Port: `6379` (default)
- Status: Not responding

---

## IMPACT ASSESSMENT

### Development Mode (Current)
- **Severity**: LOW
- **Status**: GRACEFUL DEGRADATION
- **Backend continues to function**: YES ✓
- **Wallet API works**: YES ✓
- **Blockchain queries work**: YES ✓

### Production Mode
- **Severity**: HIGH
- **Status**: Would require Redis for full functionality
- **Key uses**:
  - Faucet cooldown tracking
  - Transaction queue (BullMQ)
  - Cache layer
  - Activity tracking

---

## WHAT REDIS IS USED FOR

1. **Faucet Cooldown** (`faucetService.js`):
   - Tracks when addresses last requested faucet funds
   - Enforces cooldown periods (60s default)
   - Fallback: In-memory tracking in development

2. **Transaction Queue** (`transactionQueue.js`):
   - BullMQ job queue backed by Redis
   - Fallback: Queue pauses in development if Redis unavailable

3. **Withdrawal/Conversion Liquidity Queues**:
   - Withdrawal processing queue
   - Conversion liquidity queue
   - Fallback: Reduced functionality

4. **Activity Tracking** (`activityTracker.js`):
   - Tracks consecutive active days per user
   - Used for gamification/streak tracking
   - Fallback: Fire-and-forget (data not tracked)

5. **Cache Layer**:
   - Caches frequently accessed data
   - Reduces database load
   - Fallback: Direct database queries (slower but functional)

---

## BACKEND BEHAVIOR WITHOUT REDIS (Development)

From `faucetService.js`:
```javascript
if (isProduction && !redisConnected) {
  logger.error('faucet', 'Redis unavailable in production - faucet service disabled');
  // Throw error
} else {
  logger.warn('faucet', 'Redis unavailable, faucet cooldown will be in-memory only');
  // Continue with in-memory tracking
}
```

From `index.js`:
```javascript
} catch (err) {
  logger.warn('Redis unavailable at startup', { error: err.message || err });
  // Backend continues to run
}
```

---

## CURRENT FUNCTIONAL STATUS

| Component | Status | Reason |
|-----------|--------|--------|
| Blockchain queries | ✅ OK | Direct RPC/REST connection |
| Database | ✅ OK | MongoDB replica set running |
| Wallet API | ✅ OK | Uses blockchain + database |
| Faucet | ⚠️ LIMITED | In-memory cooldown only |
| Transaction queue | ⚠️ LIMITED | Queue paused |
| Activity tracking | ⚠️ LIMITED | Data not persisted |
| Caching | ⚠️ LIMITED | Direct DB queries |

---

## WHY IT'S NOT CRITICAL FOR WALLET VERIFICATION

The wallet data verification test **does not require**:
- Faucet functionality (just reading balances)
- Transaction queue (no transactions being sent)
- Activity tracking (not part of wallet data)
- Caching (acceptable performance for testing)

**Required for verification**:
- ✅ Blockchain access (working)
- ✅ Database access (working)
- ✅ Wallet API endpoint (working)

---

## RECOMMENDATION

**For Current Wallet Verification**: 
- No action needed. Redis unavailability does not impact wallet data reading.

**For Production Deployment**:
- Redis MUST be running before going to production
- Configure Redis connection in production `.env`
- Verify Redis health check passes in prod environment

**For Development Continuation**:
- Current state is acceptable for testing
- Redis can be started if queue functionality needed

---

## CONCLUSION

**Health Status**: DEGRADED (Redis offline)  
**Impact on Wallet Verification**: NONE  
**Impact on Production**: SIGNIFICANT  
**Action Required**: None for current testing; Redis required before production deploy

