# Mallchain OS v14 End-to-End Connection Plan

**Objective**: Verify the complete pipeline from browser → Mission Control V14 → Backend API → Mallchain blockchain

**Date**: Sep 18, 2026  
**Status**: STARTUP PLAN PREPARED

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                 │
│                      Firefox/Chrome                              │
│                    http://localhost:5173                         │
│                                                                   │
│                   ┌──────────────────────┐                       │
│                   │  Mission Control V14  │                       │
│                   │   (React/Vite)       │                       │
│                   │                      │                       │
│                   │ src/services/api.ts  │ ← JSON fetch()        │
│                   │ (makes HTTP calls)   │                       │
│                   └──────────┬───────────┘                       │
│                              │                                   │
│                              │ HTTP + Cookie (httpOnly auth_token)
│                              │ X-CSRF-Token (for mutations)       │
│                              ▼                                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
      ┌────────────────┴─────────────────┐
      │                                   │
      │                                   │
      ▼                                   │
┌──────────────────────────────────┐     │
│      Backend API (Node/Express)   │     │
│      http://localhost:4000        │     │
│                                   │     │
│  - Session auth (JWT cookie)      │     │
│  - CSRF protection                │     │
│  - API routes (/api/*)            │     │
│  - Real HTTP/REST to blockchain   │     │
│                                   │     │
│      ┌─────────────────────┐      │     │
│      │  Transaction layer  │      │     │
│      │ (signs & broadcasts)│      │     │
│      └──────────┬──────────┘      │     │
│                 │                 │     │
└─────────────────┼─────────────────┘     │
                  │                       │
      ┌───────────┴──────────┐            │
      │ HTTP fetch() to RPC  │            │
      │                      │            │
      ▼                      ▼            │
┌──────────────────────────────────────┐  │
│   MALLCHAIN BLOCKCHAIN NODE          │  │
│   (marketplaced — Go/Cosmos)         │  │
│                                      │  │
│  ┌────────────────────────────────┐  │  │
│  │ RPC Server                     │  │  │
│  │ http://127.0.0.1:26657         │◄──┘
│  │                                │     
│  │ Handles: tx broadcasts,        │     
│  │          account queries,      │     
│  │          chain status          │     
│  └────────────────────────────────┘     
│                                      │  │
│  ┌────────────────────────────────┐  │  │
│  │ REST API                       │  │  │
│  │ http://127.0.0.1:1317          │◄──┘
│  │                                │     
│  │ Handles: /cosmos/bank/v1beta1  │     
│  │          /cosmos/auth/v1beta1  │     
│  │          (account info,        │     
│  │           balances)            │     
│  └────────────────────────────────┘     
│                                      │  │
│  ┌────────────────────────────────┐  │  │
│  │ In-Memory State                │  │  │
│  │ (balances, validators, etc.)   │  │  │
│  └────────────────────────────────┘  │  │
└──────────────────────────────────────┘  │
                                          │
              ┌──────────────────────────┘
              │
              │ Backend-only path (not V14 direct)
              │ (This is what Mission Control V14 uses)
              │
              ▼
         (Not shown: Direct RPC
          would bypass Backend,
          for mallchain-app only)
```

---

## Current Configuration

### Frontend (mallchain-os-v14)

**Location**: `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/`

**File**: `.env`
```
VITE_API_BASE_URL=http://localhost:4000
VITE_NETWORK=testnet
VITE_SESSION_TTL=120
```

**Key Code**:
- `src/services/config.ts` — Validates VITE_API_BASE_URL at module load time
- `src/services/api.ts` — Makes HTTP fetch() calls to backend with:
  - `credentials: 'include'` — sends httpOnly auth_token cookie
  - `X-CSRF-Token` header for mutating requests
  - JSON request/response handling
  - 401 interception → logout redirect
  - 403 CSRF token refresh + retry

**Startup**: `npm run dev` (Vite dev server on :5173)

---

### Backend (Node/Express)

**Location**: `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/`

**File**: `.env`
```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27018/marketplace?replicaSet=rs0
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=<...>
CHAIN_RPC=http://127.0.0.1:26657
CHAIN_REST=http://127.0.0.1:1317
```

**Dependencies**:
- MongoDB (replica set at :27018)
- Redis (at :6379)
- Blockchain RPC/REST (:26657, :1317)

**Startup**: `npm start` (Node.js on :4000)

**Issue**: iconv-lite encoding module missing (HTTP 400 on requests with body)

---

### Blockchain (Cosmos/Go)

**Binary**: `./marketplaced`

**Startup**:
```bash
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

**RPC**: http://127.0.0.1:26657 (CometBFT JSON-RPC)  
**REST**: http://127.0.0.1:1317 (Cosmos SDK REST)

---

## Verification Steps

### Step 1: Confirm Blockchain is Running

```bash
curl -s http://127.0.0.1:26657/status | jq .
```

**Expected Output**:
```json
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "node_info": { "version": "..." },
    "sync_info": {
      "latest_block_height": "123",
      "latest_block_time": "2026-09-18T09:38:00Z"
    },
    "validator_info": { ... }
  }
}
```

**Verify**: 
- `latest_block_height` > 0 (blockchain is producing blocks)
- `latest_block_time` is current (not stale)

### Step 2: Confirm Backend is Running

```bash
curl -s http://localhost:4000/api/health 2>&1
```

**Expected Output**: HTTP 200 with JSON response

**If 400**: Backend has iconv-lite issue  
**If connection refused**: Backend not running

### Step 3: Start Frontend Dev Server

```bash
cd mallchain-os-v14
npm run dev
```

**Output**:
```
  VITE v7.3.6  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

### Step 4: Open Browser

Open Firefox to http://localhost:5173

**Expected**: Mission Control V14 dashboard loads

### Step 5: Login (if required)

If login page appears, register or login with credentials.

### Step 6: DevTools Inspection

Open Firefox DevTools (F12):

**Network Tab**:
1. Navigate to a page that makes API calls (e.g., Dashboard, Wallets)
2. Look for requests to `http://localhost:4000/api/...`
3. Verify:
   - Status: 200 (success) or expected error code
   - Request includes `Cookie: auth_token=...` (httpOnly cookie)
   - Response includes real data (not mock/local)

**Console Tab**:
1. Look for errors (red messages)
2. Check for warnings about failed API calls
3. Verify no "Cannot find module" errors (would indicate missing dependencies)

### Step 7: Verify Real Data

If dashboard displays:
- ✅ Real block height from blockchain
- ✅ Real account balance from blockchain
- ✅ Real transaction history from backend
- ✅ Real validator list from blockchain

Then the complete pipeline is working:

```
Browser → Frontend API calls → Backend → Blockchain RPC/REST → Real data displayed
```

---

## Expected HTTP Calls

### Frontend → Backend

**All requests originate from**:
```
Origin: http://localhost:5173
```

**Example request**:
```http
GET /api/auth/me HTTP/1.1
Host: localhost:4000
Cookie: auth_token=eyJhbGciOiJIUzI1NiIs...
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: auth_token=...; HttpOnly; Secure; SameSite=Strict

{
  "user": {
    "id": "user_...",
    "email": "...",
    "address": "mall1...",
    ...
  }
}
```

### Backend → Blockchain

**GET /cosmos/auth/v1beta1/accounts/{address}** (REST)
```http
GET /cosmos/auth/v1beta1/accounts/mall1... HTTP/1.1
Host: 127.0.0.1:1317
```

**POST /broadcast** (RPC) — for transactions
```http
POST / HTTP/1.1
Host: 127.0.0.1:26657
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "broadcast_tx_sync",
  "params": ["signed_tx_bytes"],
  "id": 1
}
```

---

## How to Interpret Results

### Complete Success

```
Frontend loads (5173)
  ↓
Pages render
  ↓
DevTools → Network shows requests to :4000
  ↓
Backend responds with 200
  ↓
Real blockchain data displayed (block height, balance, etc.)
```

**Result**: ✅ Complete pipeline verified

---

### Frontend Won't Connect to Backend

```
Frontend loads but:
- Blank dashboard or "Loading..." forever
- DevTools → Network shows requests to :4000 getting 0 or timeout
- Console shows "Failed to fetch" or "Connection refused"
```

**Root Cause Options**:
- Backend not running (`npm start` in backend/)
- Backend crashed (check console for errors)
- Backend on wrong port (check `PORT` in `.env`)
- Firewall/network issue (unlikely on localhost)

**Solution**:
```bash
cd backend
npm start
# Check for errors; if any, address them (especially iconv-lite)
```

---

### Backend Returns Errors

```
Frontend loads but:
- Pages show error toasts
- DevTools → Network shows requests to :4000 getting 4xx or 5xx
- Backend console shows errors
```

**Common Issues**:
- 401: Token expired, session invalid → login required
- 400: iconv-lite missing → rebuild with `npm rebuild`
- 500: Backend error → check backend logs
- 403: CSRF token invalid → frontend auto-retries once

---

### Real Blockchain Data Not Displayed

```
Frontend loads
Backend responds (200)
BUT:
- Block height is "0" or "unknown"
- Balances show "0" or "N/A"
- Validators list is empty
- No transactions shown
```

**Root Cause Options**:
- Blockchain not running → start with `./marketplaced start`
- Blockchain at wrong RPC/REST port → verify .env `CHAIN_RPC`, `CHAIN_REST`
- Backend not querying blockchain → check backend logs for errors
- Blockchain data not indexed → may need time to sync

**Solution**:
```bash
# Verify blockchain RPC is responding
curl -s http://127.0.0.1:26657/status | jq .

# If empty/error, start blockchain:
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

---

## Quick Start Commands

**Terminal 1 — Start Blockchain**:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

**Terminal 2 — Start Backend**:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend
npm start
```

**Terminal 3 — Start Frontend**:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14
npm run dev
```

**Terminal 4 — Open Browser**:
```bash
firefox http://localhost:5173
```

---

## What NOT to Do

❌ **Do not** modify wallet signing code  
❌ **Do not** modify transaction broadcasting code  
❌ **Do not** access/print private keys  
❌ **Do not** test transaction signing/broadcasting  
❌ **Do not** modify blockchain source code  
❌ **Do not** delete or corrupt blockchain state  

---

## Next Steps

1. **Verify current state**: Check if blockchain, backend, and frontend are running
2. **Address iconv-lite if needed**: Backend dependency issue
3. **Start services** (see Quick Start Commands above)
4. **Browser test**: http://localhost:5173
5. **DevTools inspection**: Confirm HTTP calls and real data
6. **Document findings**: Report what you see in browser and DevTools

---

## Pipeline Verification Checklist

- [ ] Blockchain RPC responding (`curl http://127.0.0.1:26657/status`)
- [ ] Backend running (`curl http://localhost:4000/api/health`)
- [ ] Frontend loads (`http://localhost:5173`)
- [ ] DevTools shows requests to backend
- [ ] Backend responds with 200
- [ ] Real blockchain data displayed (block height visible)
- [ ] No console errors in DevTools
- [ ] No errors in backend/blockchain logs
- [ ] Session auth working (cookie sent and received)
- [ ] Complete pipeline verified: Browser → Backend → Blockchain ✅

