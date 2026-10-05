# Mallchain App — Browser Connection Test

**Date**: September 18, 2026  
**Goal**: Verify that the running browser application is actually communicating with the local Mallchain blockchain

---

## Current Status

✅ Blockchain node running on port 26657 (RPC) and 1317 (REST)  
✅ Mallchain App dev server running on port 3000  
✅ Source code verified: real RPC/REST integration exists  

---

## Test Procedure

### Step 1: Open the Mallchain App in Firefox

```
http://localhost:3000
```

### Step 2: Check Current Network Selection

Look at the top header bar. You should see a small badge that shows:
- **"Sandbox"** (purple) = Development Simulator (NOT CONNECTED TO LOCAL NODE)
- **"Live"** (green) = Connected to actual blockchain
- **"Offline"** (red) = Node unreachable

**Expected**: You will likely see **"Sandbox"** because the app defaults to the simulator.

### Step 3: Switch to Local Node

Click the network selector badge (top header, shows "Sandbox" or similar).

In the dropdown that appears, select one of:
- **"Mallchain Local Node (127.0.0.1)"** (preferred for this test)
- **"Mallchain Mainnet"** (if .env.local is working, this should also use 127.0.0.1)

### Step 4: Open Firefox DevTools

Press **F12** or right-click → **Inspect**.

Go to the **Network** tab.

### Step 5: Trigger Network Status Check

The NetworkStatusBadge automatically polls every 4 seconds. To force a refresh:

1. Click the network status badge again (top header)
2. In the modal that opens, click **"Refresh Node"** button

Watch the Network tab.

### Step 6: Look for the Status Request

In the DevTools Network tab, look for a request like:

```
http://127.0.0.1:26657/status
```

If you don't see it, check these variations:
- `127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest`
- `localhost:26657/status`
- `/status` (if it shows relative path, hover to see full URL)

### Step 7: Record the Evidence

Click on the request in the Network tab and record:

**Request Details:**
- URL: ___________________
- Method: (should be GET)
- Status: ___ (should be 200)

**Response Preview:**
Look at the **Response** tab and find:
- `chainId`: ___________________
- `latest_block_height`: ___________________

### Step 8: Check Console for Errors

Go to the **Console** tab.

Look for any red error messages. Common errors:
- ❌ `"Cannot find module '../encodings'"` — Backend dependency issue (not relevant here)
- ❌ `"Failed to fetch"` — Network request failed
- ❌ `"CORS error"` — Blockchain needs CORS headers
- ✅ No errors — Good!

### Step 9: Check UI Display

Look at the network status badge in the header. It should now show:
- Green dot (connected)
- "Live" label
- Block height (e.g., `#31731`)
- Ping time (e.g., `42ms`)

Click the badge to see the modal with full diagnostics.

---

## Expected Results (Success)

**All of the following should be true:**

1. ✅ Network status badge shows **"Live"** (green) after switching to Local Node
2. ✅ DevTools Network tab shows request to `http://127.0.0.1:26657/status` or `http://127.0.0.1:1317/...`
3. ✅ HTTP response status is **200 OK**
4. ✅ Response contains:
   - `chainId`: `"mallchain-1"`
   - `latest_block_height`: non-zero number (e.g., 31731)
5. ✅ UI displays:
   - Current block height
   - "Connected" or "Live" status
   - Latency in milliseconds
6. ✅ Console shows **no connection errors**

---

## Expected Results (Failure)

**Any of the following means NOT CONNECTED:**

- ❌ Network status badge stays **"Sandbox"** or **"Offline"** after switching networks
- ❌ No HTTP request appears in DevTools Network tab to localhost:26657
- ❌ HTTP response status is **404, 500, or Connection refused**
- ❌ Console shows `"Failed to fetch"` or `"ERR_CONNECTION_REFUSED"`
- ❌ UI displays block height as **0** or **---**
- ❌ UI displays "Offline" message

---

## What to Report

After completing the test, report:

1. **Network Status Badge**: What color and text does it show?
2. **DevTools Request URL**: What exact URL was requested?
3. **HTTP Status**: What status code (200, 404, etc.)?
4. **Response Data**: What chainId and block height?
5. **Console Errors**: Any errors? (paste exact message)
6. **UI Display**: What does the badge show?
7. **Conclusion**: CONNECTED or NOT CONNECTED?

---

## Troubleshooting

**If you see "Sandbox" with purple dot:**
- The app defaulted to the simulator
- You need to click the network selector and explicitly choose "Local Node" or "Mainnet"
- It's not "broken," just needs manual network selection

**If you see "Offline" with red dot:**
- The local node might not be running
- Check: `lsof -i :26657` should show `marketplaced` listening
- If not: `./START_ALL.sh`

**If no Network tab requests appear:**
- DevTools might be closed or not recording
- Ensure the Network tab is active BEFORE you click "Refresh Node"
- Try refreshing the page (F5) and look for the initial status check

**If you see CORS errors:**
- The blockchain RPC endpoint might not have CORS headers
- This is a configuration issue, not a connection issue
- Node should be running in compatible mode

---

## Timeline

The test should take **5-10 minutes**. You're just:
1. Opening a browser window
2. Selecting a network
3. Opening DevTools
4. Clicking refresh
5. Looking at the Network tab

That's it. No code changes needed. Just observation.

---

**Goal**: Collect enough evidence to definitively answer:

**"Is the browser application making actual HTTP requests to the local Mallchain RPC/REST endpoint?"**

Answer: YES or NO (with evidence)
