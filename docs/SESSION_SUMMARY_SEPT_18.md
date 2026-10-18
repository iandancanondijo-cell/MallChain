# Mallchain App Audit Session — September 18, 2026

**Session Focus**: Source code audit of mallchain-app blockchain integration  
**Status**: COMPLETE — Ready for browser verification

---

## What Was Accomplished

### 1. Complete Source Code Audit ✅

Inspected all critical files:
- `src/blockchain/client.ts` — Main blockchain client
- `src/blockchain/adapter.ts` — HTTP client adapter
- `src/config/networks.ts` — Network configuration
- `src/pages/DashboardPage.tsx` — Dashboard UI
- `src/components/NetworkStatusBadge.tsx` — Network monitoring

**Finding**: The application contains legitimate RPC/REST integration, not mock data.

### 2. Environment Configuration ✅

Created `.env.local` in `mallchain-app/`:
```
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"
```

**Verified**: File exists on disk with correct local node endpoints.

### 3. Backend Issue Resolution ✅

**Problem**: Backend returning "Cannot find module '../encodings'" errors  
**Root Cause**: iconv-lite native modules not compiled  
**Solution**: Cleaned and reinstalled `node_modules` with `npm ci`  
**Result**: Backend API now responds correctly on port 4000

### 4. Local Blockchain Verification ✅

Started full service stack:
- Blockchain node: Running on 26657 (RPC) and 1317 (REST)
- Backend API: Running on port 4000
- Mallchain App: Running on port 3000
- Mission Control V14: Running on port 5173

**Verified**:
- RPC responds: `curl http://127.0.0.1:26657/status` → 200 OK
- REST responds: `curl http://127.0.0.1:1317/cosmos/...` → 200 OK
- Block height: ~31776
- Chain ID: mallchain-1
- All services stable

### 5. Code-Level Architecture Analysis ✅

**Confirmed the integration path**:

```
Browser (Firefox)
    ↓ loads http://localhost:3000
Mallchain App (React)
    ↓ imports mallchainClient
MallchainClient (blockchain/client.ts)
    ↓ delegates to adapter
MallchainNetworkAdapter (blockchain/adapter.ts)
    ↓ fetch() calls
HTTP/JSON-RPC
    ↓ sent to
Blockchain Node (http://127.0.0.1:26657)
```

**Methods that make real RPC calls**:
- `getNetworkStatus()` — calls `/status`
- `getAccount()` — calls `/cosmos/auth/v1beta1/accounts/`
- `getBalances()` — calls `/cosmos/bank/v1beta1/balances/`
- `broadcastTx()` — calls `/broadcast_tx_sync`
- `getValidators()` — calls `/cosmos/staking/v1beta1/validators`

**All these methods are used by the UI** (verified in DashboardPage.tsx, NetworkStatusBadge.tsx)

### 6. Documentation Created ✅

Created 9 comprehensive reference documents:

1. **READY_FOR_BROWSER_TEST.txt**
   - Status summary
   - What's running
   - What to do next

2. **BROWSER_CONNECTION_TEST_INSTRUCTIONS.md**
   - Step-by-step user instructions
   - What to look for in DevTools
   - Expected results for success/failure

3. **AUDIT_FINDINGS_AND_NEXT_STEPS.md**
   - Detailed audit findings
   - Architecture confirmation
   - What still needs verification

4. **VERIFIED_vs_UNVERIFIED.txt**
   - What's proven by code inspection
   - What requires runtime verification
   - Definition of "CONNECTED"

5. **PRE_BROWSER_TEST_CHECKLIST.txt**
   - Pre-flight checklist
   - Verification commands
   - Test procedure

6. Plus 3 other supporting documents from earlier work

---

## Critical Distinction Made

### Code vs Runtime

**Code Inspection (What I Did)**:
- ✅ Read the source code
- ✅ Verified HTTP calls are made
- ✅ Verified configuration supports local node
- ✅ Verified .env.local exists
- ✅ Proved: The app **could** connect

**Runtime Verification (What YOU Must Do)**:
- ❓ Does the browser actually make HTTP requests?
- ❓ Are those requests successful (HTTP 200)?
- ❓ Does the UI display real blockchain data?
- ❓ Prove: The app **actually is** connecting

**These are different**. One doesn't prove the other.

---

## Key Findings

### ✅ Confirmed

1. Real blockchain integration code exists
2. Multiple networks can be selected (simulator, testnet, mainnet, local)
3. .env.local file created with correct local endpoints
4. Local Mallchain node running and responding to queries
5. Network status monitoring component calls getNetworkStatus() every 4 seconds
6. Dashboard calls getBalances() and getTransactions()
7. All dependencies installed and working
8. Backend API operational

### ⚠️ Needs Verification

1. Browser actually makes HTTP requests to local node (DevTools Network tab)
2. Vite loads .env.local environment variables (check request URL in Network tab)
3. HTTP responses have status 200 (check Network tab status column)
4. UI displays real blockchain data (visual inspection)
5. Network selector allows switching from simulator to local node

### ❌ Known Issue (Fixed)

Backend dependency issue with iconv-lite → RESOLVED

---

## What Happens Next

### Immediate (You)

1. Open Firefox
2. Navigate to http://localhost:3000
3. Open DevTools (F12)
4. Go to Network tab
5. Select "Mallchain Local Node" from network selector
6. Click "Refresh Node" button
7. Look for HTTP request to 127.0.0.1:26657
8. Record the evidence (status code, response data)
9. Report findings

### Result

**If Connected**:
- HTTP 200 OK from 127.0.0.1:26657
- Block height displayed
- Badge shows "Live" (green)
- → Move to: Wallet account connection

**If Not Connected**:
- No HTTP request or HTTP error
- Block height shows 0 or ---
- Badge shows "Offline" or "Sandbox"
- → Diagnose: Is .env.local loaded? Is network selector working? CORS issue?

---

## Two Independent Frontends

This project has separate frontends with different architectures:

### Mallchain App (`/mallchain-app`, port 3000)
- Direct RPC/REST connection to blockchain
- No backend required
- Wallet on browser
- Code: ✅ Audited, integration looks correct
- Runtime: ❓ Needs browser verification

### Mission Control V14 (`/mallchain-os-v14`, port 5173)
- Backend API required
- Backend connects to blockchain
- Sessions via backend
- Code: Not audited in this session
- Status: May be separate test

**These should be treated separately.**

---

## Architecture Is Sound

The code architecture is correct. Real blockchain integration exists.

Whether it's actually working end-to-end requires browser observation.

That's the next step.

---

## Files to Read

**Before browser test:**
- PRE_BROWSER_TEST_CHECKLIST.txt (verification steps)
- READY_FOR_BROWSER_TEST.txt (status summary)

**During browser test:**
- BROWSER_CONNECTION_TEST_INSTRUCTIONS.md (step-by-step)

**After browser test:**
- AUDIT_FINDINGS_AND_NEXT_STEPS.md (analysis)
- VERIFIED_vs_UNVERIFIED.txt (what we know)

---

## Summary

### Code Level
✅ Architecture confirmed correct  
✅ Real RPC/REST calls exist  
✅ Configuration ready  
✅ Services running  

### Runtime Level
❓ Browser verification pending  

### Next Action
Browser test (5-10 minutes, no code changes)

---

**Status**: AUDIT COMPLETE  
**Readiness**: READY FOR BROWSER TEST  
**Date**: September 18, 2026  
**Conclusion**: Source code is sound. Runtime verification in progress.
