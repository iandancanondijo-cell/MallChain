# START HERE: Mallchain OS V14 Connection Verification

**Goal**: Verify the end-to-end pipeline from browser to blockchain using the official, version-controlled frontend.

**Status**: Ready to start  
**Estimated Time**: 30-45 minutes

---

## What Was Discovered

### Repository Investigation (Completed)
- ✅ **mallchain-os-v14** is the documented, version-controlled frontend
- ✅ **mallchain-app** is a separate, untracked application (source unknown)
- ✅ Project architecture is: Browser → Mission Control V14 → Backend → Blockchain

### Architecture Verified
```
Browser (port 5173)
    ↓
Mission Control V14 (Frontend)
    ↓
Backend API (port 4000)
    ↓
Mallchain Blockchain RPC/REST (ports 26657, 1317)
```

---

## What You Need to Do

### Phase 1: Infrastructure Check (5 minutes)

**Check 1: Is the blockchain running?**
```bash
curl -s http://127.0.0.1:26657/status | head -20
```
- ✅ If you see JSON with `latest_block_height` → blockchain is running
- ❌ If "Connection refused" or hangs → blockchain is NOT running

**Check 2: Is the backend running?**
```bash
curl -s http://localhost:4000/api/health
```
- ✅ If you see JSON response → backend is running
- ❌ If "Connection refused" → backend is NOT running
- ⚠️ If HTTP 400 "iconv-lite" error → dependency issue (fixable)

---

### Phase 2: Start Services If Needed (10-15 minutes)

If either service is not running, start them in separate terminals.

**Terminal 1: Start Blockchain**
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

**Terminal 2: Start Backend**
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend
npm start
```

If backend fails with iconv-lite error, report that (separate issue to fix).

**Terminal 3: Start Frontend**
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14
npm run dev
```

Wait for output:
```
  VITE v7.3.6  ready in 234 ms
  ➜  Local:   http://localhost:5173/
```

---

### Phase 3: Browser Testing (15-20 minutes)

**Step 1: Open Browser**
```
Firefox: http://localhost:5173
```

**Expected Result**: Mission Control V14 dashboard loads (may show login page)

**Step 2: DevTools Inspection** (Press F12)

Go to **Network tab**:
1. Navigate the app (click around)
2. Look for requests to `localhost:4000/api/...`
3. For each request, verify:
   - ✅ Status: 200 (success) or expected error code
   - ✅ Cookie includes `auth_token` (httpOnly)
   - ✅ Response contains real data (not empty/mock)

Go to **Console tab**:
1. Look for red error messages
2. Check for "Failed to fetch" or network errors
3. Note any errors for reporting

**Step 3: Verify Real Blockchain Data**

If dashboard displays ANY of these (not mock/hardcoded values):
- Block height (e.g., "Block 1234")
- Current timestamp that matches blockchain time
- Real account address starting with `mall1...`
- Real balance from blockchain

Then: ✅ **Complete pipeline is working**

---

## What to Report Back

### If It Works
Report:
```
✅ Frontend loaded: http://localhost:5173
✅ Backend responding: http://localhost:4000/api/health → HTTP 200
✅ Blockchain RPC responding: http://127.0.0.1:26657/status → has latest block
✅ Real data displayed: [describe what you see in the dashboard]
✅ DevTools Network: requests to :4000 showing status 200 with real data
✅ Console: no red errors
✅ Complete pipeline verified: Browser → Backend → Blockchain ✅
```

### If It Doesn't Work
Report what you see:
```
Frontend: [loads/blank/error?]
Backend: [responding/error/offline?]
Blockchain: [responding/error/offline?]
DevTools Network: [show any 4xx/5xx errors, or timeouts]
DevTools Console: [paste any red error messages]
Error details: [what exactly is not working]
```

---

## Important Notes

### Do NOT
- ❌ Touch `mallchain-app/` (it's a separate, untracked application)
- ❌ Create replacement files in mallchain-app
- ❌ Modify wallet signing code
- ❌ Broadcast any transactions
- ❌ Access private keys
- ❌ Modify blockchain source code

### Do
- ✅ Focus on `mallchain-os-v14/` only (the documented frontend)
- ✅ Use localhost:5173 for browser tests
- ✅ Use DevTools to inspect network calls
- ✅ Run services in separate terminals for easy observation
- ✅ Report exact error messages and HTTP status codes

---

## Files for Reference

**Complete Guide**: `MALLCHAIN_OS_V14_CONNECTION_PLAN.md`
- Full architecture diagram
- Expected HTTP calls
- Troubleshooting guide
- Interpretation of results

**Repository Analysis**: `FORENSIC_ANALYSIS_CRITICAL_FINDING.md`
- Why mallchain-app was not part of the repo
- Why we're using mallchain-os-v14 instead
- Complete git investigation results

---

## Quick Checklist

- [ ] Blockchain is running (port :26657)
- [ ] Backend is running (port :4000)
- [ ] Frontend is running (port :5173)
- [ ] Browser loads http://localhost:5173
- [ ] DevTools shows requests to http://localhost:4000/api/...
- [ ] Backend responds with HTTP 200 (not 4xx/5xx)
- [ ] Real blockchain data is displayed (not mock values)
- [ ] No red errors in DevTools Console
- [ ] Pipeline verified: Browser → Backend → Blockchain ✅

---

## Ready?

1. Start the three services (blockchain, backend, frontend) in separate terminals
2. Open Firefox to http://localhost:5173
3. Use DevTools (F12) to inspect the Network tab
4. Verify real blockchain data is being displayed
5. Report what you see

This is the point where we stop investigating repository structure and start proving the actual connection works.

