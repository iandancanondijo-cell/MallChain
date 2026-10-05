# Mallchain App — Browser Connection Verification

**Status**: Ready for manual browser testing

**Current State**:
- ✅ Dev server running on http://localhost:3000
- ✅ DashboardPage.tsx restored (minimal implementation, no diagnostic changes)
- ✅ NetworkStatusBadge component present and ready to make RPC calls
- ✅ Blockchain adapter configured to make real HTTP requests

---

## Browser Verification Steps

### 1. Open Firefox and Navigate to App

```
URL: http://localhost:3000
Expected: Mallchain App loads with header and network selector
```

### 2. Identify Current Network

Look for the network status badge (small colored dot + text) in the top header.

**Possible states**:
- **Purple "Sandbox"** → Currently using Development Simulator (NOT the blockchain)
- **Green "Live"** → Connected to a real node
- **Red "Offline"** → No connection

**Finding**: If showing "Sandbox", the app is using the simulator, not your local node.

### 3. Check Network Selector

Look for the dropdown in the top header that says the network name. Click it to see available networks:
- Development Sandbox Simulator
- Mallchain Testnet
- Mallchain Mainnet  
- Mallchain Local Node (127.0.0.1)

### 4. Select Local Node or Mainnet

**Recommended**: Select "**Mallchain Local Node (127.0.0.1)**"

This should switch the app to use:
- RPC: http://127.0.0.1:26657
- REST: http://127.0.0.1:1317

### 5. Open Firefox DevTools

Press **F12** to open Developer Tools

Go to the **Network** tab

Filter for requests to **127.0.0.1** or **localhost**

### 6. Trigger a Network Check

Click on the status badge (small dot in top header) to open the diagnostics modal.

Click the "**Refresh Node**" button.

### 7. Capture the Network Request

In DevTools Network tab, look for a request like:

```
http://127.0.0.1:26657/status
```

or

```
http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/...
```

### 8. Record These Details

**In the Network tab**, click on the request and note:

- **URL**: The exact endpoint
- **Method**: GET or POST
- **Status**: Should be 200 OK
- **Response** (click "Response" tab):
  - Look for `"chainId": "mallchain-1"`
  - Look for `"latest_block_height"` or similar
  - This proves a real blockchain response

### 9. Expected Success Response

If connected to the local blockchain node, the response should contain something like:

```json
{
  "result": {
    "sync_info": {
      "latest_block_height": "31600",
      "catching_up": false
    },
    "node_info": {
      "network": "mallchain-1"
    }
  }
}
```

Or from REST:

```json
{
  "block_id": {...},
  "header": {
    "height": "31600",
    "chain_id": "mallchain-1"
  }
}
```

### 10. Check Browser Console

Press **F12** → **Console** tab

Look for errors. Should see:
- ✅ No red error messages about connection refused
- ✅ No "Cannot find module" errors
- ✅ Possibly some React/Vite dev messages (normal)

### 11. Verify UI Display

If the connection is working:
- Status badge should show **"Live"** with a green dot
- Diagnostics modal should display:
  - Current Height: #31600 (or current block number)
  - Chain ID: mallchain-1
  - Endpoint URL: http://127.0.0.1:26657

---

## Possible Outcomes

### ✅ SUCCESS: "Browser Confirmed Connected"

Evidence:
- DevTools shows HTTP 200 request to 127.0.0.1:26657 or 127.0.0.1:1317
- Response contains real blockchain data (chainId, block height)
- Status badge shows "Live" with green dot
- UI displays real block height

### ❌ FAILURE: "Browser Not Confirmed Connected"

Evidence:
- No requests appear to 127.0.0.1:26657 or :1317
- Requests go to placeholder URLs (testnet-rpc.mallchain.network, etc.)
- Status shows "Sandbox" (simulator)
- Status shows "Offline"
- Console shows "Connection refused"

---

## What Was Changed (Report Back)

After verification, please report:

1. **Current network shown in UI**: [Sandbox / Live / Offline]
2. **Network selector options available**: [List what you see]
3. **Selected network**: [What you switched to]
4. **DevTools Network request URL**: [Exact URL from request]
5. **HTTP Status**: [e.g., 200, 404, Connection refused]
6. **Response contains**: [e.g., chainId: mallchain-1, block height: 31600]
7. **Status badge after refresh**: [Live/Sandbox/Offline]
8. **Console errors**: [None / List any red errors]

---

## Key Point

Do NOT rely on:
- The fact that `curl http://127.0.0.1:26657/status` works
- The existence of .env.local file
- The code inspection showing RPC calls

Instead, rely ONLY on:
- **Browser DevTools showing actual HTTP request** to local endpoint
- **Response body containing real blockchain data**
- **UI displaying chain ID and block height from that response**

This proves the application **in the running browser** can reach **your actual local blockchain node**.

---

**Ready for testing**: App is running at http://localhost:3000
