# Browser End-to-End Test Procedure

**Status**: Infrastructure ready, awaiting browser verification

**Services Running**:
- ✅ Blockchain RPC (:26657) — block height 32110
- ✅ Blockchain REST (:1317) — responding
- ✅ Backend API (:4000) — healthy, connected to blockchain
- ✅ Frontend (:5173) — serving React app

---

## Open Firefox Browser

```
firefox http://localhost:5173
```

**Expected Result**: Mission Control V14 dashboard loads (may show login page or dashboard depending on session state)

---

## Open Browser DevTools

Press: `F12`

This opens Firefox Developer Tools. We'll use two tabs:
1. **Network tab** — to inspect HTTP requests
2. **Console tab** — to check for errors

---

## Network Tab: Configure for This Test

In DevTools → Network tab:

1. **Clear any existing requests**: 
   - Click the trash icon (Clear log)

2. **Set Filter** (optional but helpful):
   - Type in the filter box: `localhost:4000`
   - This shows only requests to the backend

3. **Keep it open** while you use the app

---

## Console Tab: Check Initial State

In DevTools → Console tab:

1. Look for any red error messages
2. Look for any "Failed to fetch" messages
3. Note any warnings that appear

**What you should NOT see**:
- ❌ `Cannot find module`
- ❌ `Failed to connect to blockchain`
- ❌ `Connection refused`

---

## Trigger API Calls

Now use the application to trigger network requests:

### Option 1: Navigation
- Click around the app (e.g., "Dashboard", "Wallets", "Transactions")
- Each page typically fetches data from the backend

### Option 2: Login (if required)
- If a login page appears, try to login
- This will trigger multiple API calls

### Option 3: Load a specific page
- Navigate to `/dashboard` or `/wallets`
- These pages load account/blockchain data

---

## Inspect Network Requests

For each request you see in the Network tab:

### 1. Check the URL
Look for requests to:
```
http://localhost:4000/api/...
```

**Example requests you might see**:
- `GET /api/auth/me` — get current user
- `GET /api/blockchain/stats` — get blockchain stats
- `GET /api/wallets` — get wallets
- `POST /api/auth/login` — login

### 2. Click the Request
Click on a request in the Network tab to inspect it.

### 3. Check Response Tab
Look at the Response:
- Should contain **real data** (not empty)
- Should NOT be mock/hardcoded values
- Should contain real blockchain information

**Example of real response**:
```json
{
  "chain": {
    "chainId": "mallchain-1",
    "latestHeight": 32110,
    "blockTime": "2026-09-18T07:01:14Z"
  }
}
```

### 4. Check Headers Tab
Look at Request Headers:
- Should include: `Cookie: auth_token=...` (httpOnly cookie)
- Should include: `Content-Type: application/json`

Look at Response Headers:
- Should include: `Content-Type: application/json`
- Should NOT include error codes

### 5. Check Status
- ✅ `200` = Success
- ⚠️ `301`/`302` = Redirect (check Location header)
- ⚠️ `401` = Unauthorized (need to login)
- ❌ `400` = Bad Request (check response for error message)
- ❌ `500` = Server Error (backend issue)

---

## Verify Real Blockchain Data

Look for at least ONE of these real values displayed or returned:

1. **Chain ID**: `mallchain-1` (exact match)
2. **Block Height**: `32110+` (current height from blockchain)
3. **Latest Block Time**: Recent timestamp (Sep 18, 2026, ~07:01 UTC)
4. **Validator**: `validator1` (from blockchain)
5. **Account Balance**: Real balance (not zero or mock)

If you see these values in:
- ✅ DevTools Network Response body
- ✅ Page display (Dashboard, Wallets)
- ✅ Browser Console output

Then: **Real blockchain data is flowing through the pipeline** ✅

---

## Document Your Findings

Take screenshots of:

### Screenshot 1: Browser Homepage
- What page loads
- Is it blank, loading, or showing content?

### Screenshot 2: DevTools Network Tab
- Show at least one request to `localhost:4000/api/...`
- Show the request status and response

### Screenshot 3: Real Data Example
- Show one example of real blockchain data in:
  - Response body (DevTools)
  - Or displayed on page (Dashboard)

### Report Format

```
BROWSER TEST RESULTS
====================

Frontend Loads: [YES/NO]
Dashboard Shows: [describe what you see]

Network Requests:
- First request: [URL] → Status [200/4xx/5xx]
- Response contains: [brief description]

Real Blockchain Data Detected:
- Chain ID: [yes/no]
- Block Height: [yes/no]
- Latest Time: [yes/no]

Errors in Console:
[list any red errors, or "none"]

Errors in Network:
[list any 4xx/5xx, or "none"]

Complete End-to-End Path Verified:
Browser → Backend (:4000) → Blockchain (:26657/:1317): [YES/NO]
```

---

## Troubleshooting Guide

### Frontend Won't Load (Blank Page / Loading Forever)

**Possible Cause**: Backend not responding

**Check**:
1. DevTools Console: Look for "Failed to fetch" errors
2. DevTools Network: Look for failed requests to `:4000`
3. Terminal: Check backend process running

**Fix**:
```bash
curl -s http://localhost:4000/api/health | jq .
# Should return 200 with health data
```

---

### Network Requests Show 401 (Unauthorized)

**Possible Cause**: Session expired or not logged in

**Fix**:
1. Refresh the page
2. Login if a login page appears
3. Try again

---

### Network Requests Show 400 or 500 (Error)

**Check the Response**:
1. DevTools Network tab → click request → Response tab
2. Look for error message (e.g., "invalid request", "database error")
3. Note the exact error

**Report**:
- URL that failed
- HTTP status
- Error message from response

---

### Console Shows Red Errors

**Common Issues**:

1. **"Cannot find module"**
   - Indicates frontend dependency issue
   - Not expected if `npm ci` completed

2. **"Failed to fetch"**
   - Backend not responding
   - Check if :4000 is running

3. **"Invalid token"**
   - Session/auth issue
   - Try logout and login again

---

## Success Criteria

✅ **Complete Success**:
1. Frontend loads without blank page
2. At least one API request to `:4000` returns 200
3. Response contains real blockchain data (chain ID, block height, etc.)
4. No red console errors
5. DevTools Network shows successful HTTP calls

❌ **Failure Indicators**:
1. Frontend is blank or shows "Loading" forever
2. All requests to `:4000` timeout or fail
3. 401/403 errors (auth issue)
4. 500 errors (backend issue)
5. Red console errors

---

## What This Test Proves

If successful, you will have demonstrated:

✅ **Browser connects to frontend** (loads :5173)  
✅ **Frontend connects to backend** (requests to :4000)  
✅ **Backend connects to blockchain** (returns real chain data)  
✅ **Real data flows end-to-end** (browser displays blockchain values)  
✅ **All three services working together** (pipeline verified)  

This is the definitive proof that the Mallchain project is working end-to-end.

---

## Next: Report Your Results

After testing, run this command to verify all services are still running:

```bash
curl -s http://localhost:4000/api/health | jq .chain
```

Expected output (should show current block height):
```json
{
  "status": "ok",
  "chainId": "mallchain-1",
  "latestHeight": "32110+",
  "blockTime": "2026-09-18T07:0X:XX.XXXZ"
}
```

Then provide:
1. Screenshots from DevTools (Network and Console tabs)
2. Describe what you see in the browser
3. List any errors encountered
4. Confirm whether real blockchain data is displayed

