# How to Test Mallchain App Blockchain Connection

**Status**: App is ready. Blockchain node is running. Just need to verify the connection.

---

## Prerequisites (Verify These First)

```bash
# Terminal 1: Check if Mallchain node is running
curl http://127.0.0.1:26657/status | jq '.result.sync_info.latest_block_height'
# Should print a number like: "31600"

# Terminal 2: Check if REST API is running  
curl http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header.height'
# Should print the same block height
```

If either returns "Connection refused", start services:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
./START_ALL.sh
```

---

## Step-by-Step Testing

### Step 1: Open the App

Open in Firefox or Chrome:
```
http://localhost:3000
```

You should see:
- Mallchain logo and header
- Network selector dropdown
- "Sandbox" indicator (purple)

---

### Step 2: Select Mainnet

1. **Click the Network Selector** (top left area, shows current network)
2. See dropdown with options
3. **Click "Mallchain Mainnet"** (or "Mallchain Local Node" — they point to the same local instance)

Expected: Network badge changes from "Sandbox" to "Live" (green)

---

### Step 3: Open Developer Tools

Press **F12** in your browser

Go to **Network** tab

---

### Step 4: Trigger a Network Request

Click the **Network Status Badge** (green indicator, top center-right of header)

A modal appears showing:
- Consensus Mode
- Current Height
- Chain ID
- Endpoint URL

**In the modal, click "Refresh Node"**

---

### Step 5: Verify Network Traffic

In DevTools Network tab, you should see requests like:
```
GET  http://127.0.0.1:26657/status
```

Click on it and check:
- **Status**: 200 (green)
- **Response** contains:
  - `latest_block_height`: (actual number)
  - `catching_up`: false
  - `network`: mallchain-1

---

### Step 6: Check Console for Errors

Click **Console** tab in DevTools

Should see **NO red error messages** about:
- Connection refused
- Failed to fetch
- Cannot reach

---

### Step 7: Verify REST Endpoint

In Console, run this:
```javascript
fetch('http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest')
  .then(r => r.json())
  .then(d => console.log('Block Height:', d.block.header.height))
  .catch(e => console.error('Error:', e))
```

Should print:
```
Block Height: 31600  (or similar number)
```

---

## What SUCCESS Looks Like

✅ Network badge shows **"Live"** (green)  
✅ Diagnostics modal shows **"Live CometBFT Node Connected"**  
✅ Block height is a **real number** (not 0)  
✅ Chain ID shows **"mallchain-1"**  
✅ DevTools Network tab shows **HTTP 200** for RPC requests  
✅ Console shows **no connection errors**  
✅ REST endpoint responds with **real block data**  

---

## What FAILURE Looks Like

❌ Network badge shows **"Offline"** (red)  
❌ Diagnostics shows **"Node Offline / Unreachable"**  
❌ Block height is **0**  
❌ DevTools Network shows **failed requests** (red X)  
❌ Console shows **ERR_FAILED_FETCH** or **Connection refused**  

If you see failure: **Node is not running**  
→ Run `./START_ALL.sh` again

---

## Optional: Test Account Queries

After verifying node is connected:

1. Click **"Access Wallet"** button
2. Create a test account (name: `test`, use default settings)
3. Go to **Dashboard** tab
4. In DevTools Network tab, filter for `127.0.0.1`
5. Should see request to:
   ```
   http://127.0.0.1:1317/cosmos/auth/v1beta1/accounts/mall1...
   ```
6. Should return **HTTP 200** with account info

---

## Summary

The app is designed to make **real HTTP requests** to your local blockchain node. Once you:
1. Select "Mainnet" from network dropdown
2. Open DevTools Network tab
3. Click network status badge to trigger a probe

You'll see the app **making actual requests** to http://127.0.0.1:26657 and receiving real blockchain data.

---

## Commands Reference

Start everything:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
./START_ALL.sh
```

Stop everything:
```bash
./STOP_ALL.sh
```

Check node status:
```bash
curl http://127.0.0.1:26657/status | jq '.result.sync_info'
```

Open app:
```
http://localhost:3000
```

---

**Ready to test!**
