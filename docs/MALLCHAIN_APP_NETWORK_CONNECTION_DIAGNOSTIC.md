# MALLCHAIN APP — NETWORK CONNECTION DIAGNOSTIC

**Date**: 2026-09-17  
**Problem**: App starts successfully. Switching to Mainnet doesn't connect to running Mallchain node.  
**Status**: ✅ ROOT CAUSE IDENTIFIED

---

## DIAGNOSTIC RESULTS

### 1. Mallchain Node Status
✅ **RPC Endpoint (127.0.0.1:26657)**: RESPONDING
```
curl -i http://127.0.0.1:26657/status
HTTP/1.1 200 OK
Result: Network is mallchain-1, Block height: 31156, Sync: complete
```

✅ **REST Endpoint (127.0.0.1:1317)**: RESPONDING
```
curl -i http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/node_info
HTTP/1.1 200 OK
Block height: 31156, Node ID: bea149931373afe05ab9f725278e7b5d0466520c
```

**Conclusion**: Mallchain node is running correctly on localhost and responding to requests.

---

### 2. Frontend Network Configuration

**File**: `src/config/networks.ts`

**Mainnet Configuration**:
```typescript
'mallchain-mainnet': {
  id: 'mallchain-mainnet',
  name: 'Mallchain Mainnet',
  chainId: 'mallchain-1',  // ✅ Matches running node
  rpcUrl: (env.VITE_MALLCHAIN_MAINNET_RPC_URL) || 'https://rpc.mallchain.network',
  restUrl: (env.VITE_MALLCHAIN_MAINNET_REST_URL) || 'https://api.mallchain.network',
  ...
}
```

**The Problem**:
- Frontend looks for environment variable: `VITE_MALLCHAIN_MAINNET_RPC_URL`
- If NOT set, defaults to: `https://rpc.mallchain.network` (PLACEHOLDER, not your local node)
- The running Mallchain node is at: `http://127.0.0.1:26657`
- **Frontend is trying to reach a public domain that doesn't exist**

---

### 3. What Environment Variables Are Needed

To connect the frontend to your running local Mallchain node, set:

```bash
# For the frontend (Vite development server):
export VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
export VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
export VITE_MALLCHAIN_MAINNET_CHAIN_ID="mallchain-1"
```

Or for a production build:

```bash
# In .env.local or .env:
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
```

---

## ROOT CAUSE

| Component | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Mallchain Node | Running | ✅ Running on 127.0.0.1:26657 | OK |
| RPC Response | 200 OK | ✅ 200 OK | OK |
| REST Response | 200 OK | ✅ 200 OK | OK |
| Frontend Config | Points to local node | ❌ Points to https://rpc.mallchain.network | **MISMATCH** |
| Environment Variable | Set to local URL | ❌ Not set | **MISSING** |

**Root Cause**: Frontend is configured to connect to a public domain `https://rpc.mallchain.network` instead of your local node at `http://127.0.0.1:26657`.

---

## SOLUTION

### Step 1: Create or Update .env.local

In `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app/.env.local`:

```bash
# Mallchain Mainnet — Point to your running local node
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_MAINNET_CHAIN_ID="mallchain-1"

# Optional: Also set testnet/local for consistency
VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"
```

### Step 2: Restart Development Server

Stop the current development server (Ctrl+C) and restart:

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app
npm run dev
```

**Important**: Vite reads environment variables at startup. Changes to `.env.local` require restarting the dev server.

### Step 3: Test Connection

1. Open the app in browser
2. Open Developer Console (F12 → Console tab)
3. Switch to Mainnet
4. Check Console for errors (look for failed fetch/connection errors)
5. Check Network tab (F12 → Network) for requests to `127.0.0.1:26657` and `127.0.0.1:1317`

---

## WHAT EACH NETWORK IS FOR

| Network | Purpose | RPC URL | For What? |
|---------|---------|---------|-----------|
| Simulator | Local dev sandbox | internal:// | Testing UI without blockchain |
| Local | Your running node | http://127.0.0.1:26657 | **Use this for local testing** |
| Testnet | Public testnet | https://testnet-rpc... | When public testnet is deployed |
| Mainnet | Production | https://rpc... | When public mainnet is deployed |

---

## IMPORTANT DISTINCTION

**"Mainnet" doesn't automatically mean "public"**:
- If your Mallchain mainnet node is only running locally on 127.0.0.1, then "Mainnet" in the UI should connect to 127.0.0.1
- The UI label "Mainnet" just means the main chain (chain ID: mallchain-1)
- It doesn't mean the RPC must be publicly accessible

---

## CONFIGURATION OPTIONS

### For Local Development (Current Setup)
Use the `mallchain-local` network in the UI, or:

Set these in `.env.local`:
```bash
VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"
```

### To Test Mainnet Labeling with Local Node
Set these in `.env.local`:
```bash
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
```

Then switch to "Mainnet" in the UI (it will use your local node instead of the placeholder).

### For Eventual Public Deployment
When you have a publicly accessible RPC node, update:
```bash
VITE_MALLCHAIN_MAINNET_RPC_URL="https://your-public-rpc.example.com"
VITE_MALLCHAIN_MAINNET_REST_URL="https://your-public-rest.example.com"
```

---

## NEXT STEPS

1. Create `.env.local` with the local node URLs
2. Restart the dev server
3. Switch to Mainnet in the UI
4. Open Developer Console (F12)
5. Report:
   - Any errors in the Console
   - What URLs appear in the Network tab (F12 → Network)
   - Whether the app now shows network status (connected/synced)

---

## CORS/HTTPS CONSIDERATIONS

✅ Your local setup uses **HTTP**, which is allowed:
- Local development: HTTP on 127.0.0.1 is safe and standard
- HTTPS enforcement only applies to public/cross-origin requests

If you were hosting the frontend on a different server and trying to connect to 127.0.0.1, you might hit CORS issues. But since everything is local, this is not a problem.

---

## SUMMARY

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| App won't connect to Mainnet | Frontend configured for placeholder URLs | Set VITE_MALLCHAIN_MAINNET_RPC_URL env var |
| Node is running but unreachable | Environment variable not set | Create .env.local with local URLs |
| Need to restart dev server | Vite reads env vars at startup | npm run dev after updating .env.local |

**The infrastructure is working. The configuration just needs to point to your local node.**
