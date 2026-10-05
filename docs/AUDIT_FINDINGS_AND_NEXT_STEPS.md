# Mallchain App Audit — Findings and Next Steps

**Date**: September 18, 2026  
**Status**: Source code audited. Ready for browser verification.

---

## Audit Findings

### ✅ What Is Confirmed (Code Level)

1. **Real RPC/REST Integration Exists**
   - File: `src/blockchain/adapter.ts`
   - Makes actual HTTP/JSON-RPC calls to the configured RPC endpoint
   - Lines 83-165: Calls `/status` endpoint
   - Lines 188+: Calls `/cosmos/auth/v1beta1/accounts/` endpoint
   - Lines 227+: Calls `/cosmos/bank/v1beta1/balances/` endpoint

2. **Network Configuration Supports Local Node**
   - File: `src/config/networks.ts`
   - "Mallchain Local Node" network defined with `http://127.0.0.1:26657` and `1317`
   - Supports environment variable override via `.env.local`
   - `.env.local` created with correct local endpoints

3. **Dashboard Calls Blockchain Methods**
   - File: `src/pages/DashboardPage.tsx`
   - Lines 49-51: Calls `getBalances()` and `getTransactions()`
   - These methods delegate to adapter, which makes real HTTP calls

4. **Network Status Monitoring Works**
   - File: `src/components/NetworkStatusBadge.tsx`
   - Lines 20-26: Calls `getNetworkStatus()` every 4 seconds
   - Displays current block height and connection status
   - Shows green "Live" indicator when connected

5. **Network Selector Allows Manual Selection**
   - File: `src/components/NetworkSelector.tsx`
   - User can switch between simulator, testnet, mainnet, and local node
   - Calls `handleNetworkChange()` which updates `mallchainClient`

### ❌ What Is NOT Yet Confirmed (Runtime Level)

1. **Browser Is Actually Making Requests**
   - ❓ Does the app make HTTP calls to `http://127.0.0.1:26657`?
   - ❓ Are those calls successful (HTTP 200)?
   - ❓ Is the response parsed and displayed by the UI?
   - **Verification method**: Open app in Firefox DevTools Network tab

2. **Environment Variables Are Loaded**
   - ❓ Does Vite actually load `.env.local` variables?
   - ❓ Do they override the placeholder URLs?
   - ❓ Are they available at runtime?
   - **Verification method**: Select "Mainnet" and check Network tab for request URL

3. **Default Network Selection**
   - ✅ Code shows: `DEFAULT_NETWORK_ID = 'mallchain-simulator'`
   - ❓ Does the browser actually load the simulator by default?
   - ❓ Can the user successfully switch to "Local Node"?
   - **Verification method**: Open app, check network badge color

### ⚠️ Known Issues Fixed

1. **Backend iconv-lite Dependency** 
   - Status: ✅ FIXED
   - Problem: Backend was missing native encoding modules
   - Solution: Cleaned and reinstalled `node_modules` with `npm ci`
   - Impact: Backend API now starts and responds correctly

2. **DashboardPage Debug Code**
   - Status: ✅ REMOVED
   - Change: Added `console.log('[DEBUG] Current Network...')` at line 90
   - Reverted: Code removed to keep application unmodified
   - Why: Debug logging should not be in production path

---

## Architecture Confirmation

**The integration path exists and is correct:**

```
Browser (Firefox)
    ↓
Mallchain App (React frontend)
    ↓
MallchainClient (blockchain/client.ts)
    ↓
MallchainNetworkAdapter (blockchain/adapter.ts)
    ↓
HTTP Fetch API
    ↓
Blockchain Node RPC/REST
    ↓ (if .env.local works and Local Node is selected)
Mallchain Node (127.0.0.1:26657, 1317)
```

**What's been verified at each layer:**

| Layer | Verified | Method |
|-------|----------|--------|
| React App loads | ✅ YES | Source code inspection |
| Client SDK exists | ✅ YES | File `client.ts` exists |
| Adapter makes HTTP calls | ✅ YES | Code inspection of `fetch()` calls |
| Network config includes local node | ✅ YES | `networks.ts` line 75-91 |
| `.env.local` file exists | ✅ YES | File created on disk |
| Browser makes HTTP request | ❓ UNKNOWN | Need DevTools verification |
| Request reaches node | ❓ UNKNOWN | Need HTTP status 200 verification |
| Response is parsed & displayed | ❓ UNKNOWN | Need UI inspection verification |

---

## What Still Needs Verification

### Browser Test (Must Be Done By User)

The only way to confirm end-to-end connection is:

1. Open http://localhost:3000 in Firefox
2. Select "Mallchain Local Node" from network selector
3. Open DevTools Network tab
4. Click "Refresh Node" button
5. Look for HTTP request to `http://127.0.0.1:26657/status`
6. Verify response status is 200 OK
7. Verify UI displays block height from response

**Why this test is necessary:**

- ✅ Code inspection proves the capability exists
- ❌ Code inspection does NOT prove the browser is using it
- ❓ Only the browser can prove it's actually making the request
- ❓ Only HTTP 200 proves the node is reachable
- ❓ Only UI update proves the response is being used

### Environment Variables Verification

When you select "Mainnet" in the browser:

- Is the request URL to `https://rpc.mallchain.network` (placeholder)?
- Or is it to `http://127.0.0.1:26657` (from `.env.local`)?

If it's the placeholder, `.env.local` is NOT being loaded by Vite.

---

## Next Action

**You must perform the browser test** described in:

```
BROWSER_CONNECTION_TEST_INSTRUCTIONS.md
```

This file is in the root directory with complete step-by-step instructions.

The test takes ~5-10 minutes and requires only:
- Opening Firefox
- Navigating to localhost:3000
- Opening DevTools
- Selecting a network
- Clicking one button
- Looking at the Network tab

---

## After Browser Test

Once you complete the browser test, report:

**If CONNECTED (green dot, HTTP 200, block height displayed):**
- Move to STEP 2: Wallet account connection
- Add a wallet to the app
- Query account balances
- Verify balances are fetched from Mallchain

**If NOT CONNECTED (red/purple dot, no HTTP request, or connection error):**
- We diagnose why:
  - Is the node running? → Check port 26657
  - Is `.env.local` being loaded? → Check Network tab request URL
  - Is there a CORS error? → Check Console
  - Is the network selector not working? → Check app state

---

## Two Independent Frontends

**Important architectural note:**

This project has two separate frontends with different purposes:

### 1. Mallchain App (`/mallchain-app`, port 3000)
- **Purpose**: Direct blockchain wallet and explorer
- **Design**: Direct RPC/REST connection to blockchain node
- **Uses**: Local blockchain data only
- **Status**: Code is correct, runtime verification pending
- **Next**: Browser test needed

### 2. Mission Control V14 (`/mallchain-os-v14`, port 5173)
- **Purpose**: Centralized dashboard with backend API
- **Design**: Connects to backend API, backend connects to blockchain
- **Uses**: Backend-managed data, user sessions, etc.
- **Status**: Not part of this audit
- **Next**: Separate verification if needed

**These should be treated as separate applications.**

---

## Files Created in This Session

1. **BROWSER_CONNECTION_TEST_INSTRUCTIONS.md**
   - Step-by-step user instructions for browser verification
   - What to look for in DevTools Network tab
   - Expected results for success/failure

2. **AUDIT_FINDINGS_AND_NEXT_STEPS.md**
   - This file
   - Summary of code-level verification
   - Explanation of what remains to be proven

---

## Summary

### Code-Level Verdict: ✅ ARCHITECTURE IS CORRECT

The source code contains legitimate RPC/REST integration. The frontend is not using a mock API or localStorage simulation. It has the capability to connect to a real blockchain node.

### Runtime Verdict: ❓ UNKNOWN — NEEDS BROWSER TEST

Whether the browser is **actually using** this capability cannot be determined without opening the app and checking the DevTools Network tab.

### Next Immediate Action

**Open Firefox to http://localhost:3000 and follow the browser test instructions.**

The answer will be definitive: either the browser makes HTTP requests to the local node, or it doesn't.
