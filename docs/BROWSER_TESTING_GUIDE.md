# Mallchain App — Browser Testing Guide

## Current Status

✅ **All services are running:**
- Blockchain RPC: http://127.0.0.1:26657
- Blockchain REST: http://127.0.0.1:1317
- Backend API: http://127.0.0.1:4000
- Mallchain App: http://localhost:3000
- Mission Control V14: http://localhost:5173

---

## Quick Test (5 minutes)

### Step 1: Open the app in your browser

```
http://localhost:3000
```

You should see the Mallchain App load with an interface.

### Step 2: Open Developer Tools

Press **F12** or right-click → **Inspect Element**

In DevTools, click the **Network** tab.

### Step 3: Switch to Mainnet

Look for a network selector (usually at the top or in settings). Select **Mainnet** or **Mallchain Mainnet**.

### Step 4: Check Network Requests

In the DevTools **Network** tab, you should see requests to:
- `127.0.0.1:26657` (RPC endpoint)
- `127.0.0.1:1317` (REST endpoint)

These requests should have a **green status** (200 OK).

### Step 5: Check Console for Errors

Click the **Console** tab.

You should see **no red error messages** related to:
- Connection refused
- Network failure
- Failed to fetch

### Step 6: Verify Blockchain Data

If the app has:
- A status dashboard → You should see **block height** (currently ~31512+), **chain ID** (mallchain-1), etc.
- A block explorer → You should see real blockchain data loading
- Account balance → Should load without errors

---

## What to Look For

### ✅ Success Indicators

1. **Network requests show 200 status** (not red, not Connection refused)
2. **Console has no connection errors**
3. **Blockchain data displays** (block height, chain status, etc.)
4. **No "ERR_CONNECTION_REFUSED"** in Network tab
5. **No "CORS" errors** in Console

### ❌ Failure Indicators

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` in Network | Blockchain not running | Run `./START_ALL.sh` again |
| `Failed to fetch` in Console | Network request failed | Check endpoints with curl |
| `CORS error` in Console | Blockchain CORS not configured | Check blockchain logs |
| No requests to 127.0.0.1:26657 | App using wrong endpoints | Restart dev server with `.env.local` |
| 0 block height / empty explorer | Blockchain not synced | Wait 30 seconds, refresh |

---

## Detailed Endpoint Testing

Open your browser console and run these commands to test directly:

### Test RPC Endpoint

```javascript
fetch('http://127.0.0.1:26657/status')
  .then(r => r.json())
  .then(d => {
    console.log('Block Height:', d.result.sync_info.latest_block_height);
    console.log('Chain ID:', d.result.node_info.network);
    console.log('Catching Up:', d.result.sync_info.catching_up);
  })
  .catch(e => console.error('RPC Error:', e.message));
```

Expected output:
```
Block Height: 31512
Chain ID: mallchain-1
Catching Up: false
```

### Test REST Endpoint

```javascript
fetch('http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest')
  .then(r => r.json())
  .then(d => console.log('Latest Block:', d.block.header.height))
  .catch(e => console.error('REST Error:', e.message));
```

Expected output:
```
Latest Block: 31512
```

---

## If Connection Still Fails

### 1. Verify Services Are Running

Open a terminal and run:

```bash
# Check blockchain
curl http://127.0.0.1:26657/status | grep catching_up

# Check backend
curl http://127.0.0.1:4000/api/health | jq '.status'

# Check if dev server is running
ps aux | grep "vite" | grep 3000
```

All should show success/running status.

### 2. Restart Everything

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Stop all services
./STOP_ALL.sh

# Wait
sleep 5

# Start all services again
./START_ALL.sh

# In separate terminal, start app
cd mallchain-app
npm run dev
```

### 3. Check Environment Variables

The app loads `.env.local` at startup. Verify it exists:

```bash
cat mallchain-app/.env.local
```

Should show:
```
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
```

If you changed `.env.local`, **restart the dev server** (Ctrl+C, then `npm run dev`).

### 4. Check for CORS Issues

If you see `CORS error` in Console:

The blockchain RPC endpoint may need CORS headers. Check if blockchain started correctly:

```bash
tail -30 /tmp/blockchain.log | grep -i cors
```

If CORS is the issue, check with Kiro for blockchain CORS configuration.

---

## What Happens During Connection

```
Browser (localhost:3000)
    ↓
App loads from Vite dev server
    ↓
App reads environment variables from .env.local
    ↓
App initializes network configuration (RPC: 127.0.0.1:26657, REST: 127.0.0.1:1317)
    ↓
User selects "Mainnet" in network dropdown
    ↓
App makes first request to RPC endpoint
    ↓
Browser Network tab shows: GET http://127.0.0.1:26657/status → 200 OK
    ↓
App parses response and displays blockchain data
```

---

## Files to Reference

- **App Configuration**: `mallchain-app/.env.local`
- **Network Settings**: `mallchain-app/src/config/networks.ts`
- **Blockchain Logs**: `/tmp/blockchain.log`
- **Backend Logs**: `/tmp/backend.log`
- **Full Verification Report**: `MALLCHAIN_APP_CONNECTION_VERIFICATION.md` (this directory)

---

## Summary

1. **Open** http://localhost:3000
2. **Switch to Mainnet**
3. **Open DevTools** (F12) → Network tab
4. **Look for** requests to 127.0.0.1:26657 with status 200
5. **Check Console** for no errors
6. **Verify** blockchain data displays correctly

Report any errors you see in the Console or Network tab, and we can debug further.

---

**All services are running. Ready for browser testing!**
