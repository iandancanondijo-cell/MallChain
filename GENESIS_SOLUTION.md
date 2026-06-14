# Genesis File Permanent Solution

## Problem

The blockchain genesis.json file has a supply mismatch:

- **Declared Supply**: `257500000mlc + 100000000000000stake`
- **Account Balances**: `3000000mlc + 100000000000000stake`
- **Missing**: `254500000mlc` (missing from accounts)

## Solution Implemented

### 1. **Fix Genesis Supply Script** ✅

**Location**: `scripts/fix_genesis_supply.js`

This Node.js script automatically fixes supply mismatches by:

- Reading the declared supply from `app_state.bank.supply`
- Calculating current account balances
- Adding missing tokens to the first account

**Usage**:

```bash
node scripts/fix_genesis_supply.js /path/to/genesis.json
```

**Example**:

```bash
node scripts/fix_genesis_supply.js blockchain_working/config/genesis.json
```

### 2. **Blockchain Startup Script** ✅

**Location**: `scripts/start_blockchain.sh`

This bash script provides a permanent solution by:

- **Caching genesis** in `scripts/genesis_cache.json` (persistent copy)
- **Auto-initializing blockchain directory** at `blockchain_working/`
- **Validating supply** on each startup
- **Restoring required files** (validator state)
- **Starting the blockchain** with all required flags

**Usage**:

```bash
./scripts/start_blockchain.sh
```

**What it does**:

1. Caches genesis from `build/node1/config/genesis.json` on first run
2. Creates `blockchain_working/` directory structure
3. Copies cached genesis to blockchain directory
4. Runs supply fix script
5. Creates validator state file if missing
6. Starts blockchain on port 1317

### 3. **Genesis Cache Storage**

**Location**: `scripts/genesis_cache.json`

This is an automatic persistent copy of the genesis file that:

- Prevents data loss when directories are reset
- Can be versioned in git if needed
- Serves as backup for blockchain initialization
- Gets validated and fixed on each startup

## Setup Instructions

### First Time Setup

```bash
cd /home/avasta/Documents/TMPChain_MGP-20/marketplace

# Run the startup script (it will auto-initialize)
./scripts/start_blockchain.sh
```

### Subsequent Startups

```bash
# Just run the script - it uses cached genesis
./scripts/start_blockchain.sh
```

### Reset Blockchain (keep genesis)

```bash
# The script has this commented out, but you can uncomment:
# rm -rf blockchain_working/data/*

# Then restart:
./scripts/start_blockchain.sh
```

### Full Reset (including genesis cache)

```bash
rm ./scripts/genesis_cache.json
rm -rf blockchain_working/
./scripts/start_blockchain.sh
```

## Configuration Files

### Genesis Components

```
blockchain_working/
├── config/
│   ├── genesis.json          (from cache, validated)
│   ├── app.toml             (app configuration)
│   ├── config.toml          (tendermint config)
│   └── node_key.json        (validator key)
└── data/
    ├── priv_validator_state.json (validator state - recreated if missing)
    ├── application.db
    ├── blockstore.db
    └── state.db
```

### Cache Location

```
scripts/
└── genesis_cache.json    (persistent genesis copy)
```

## Key Values in Genesis

**Supply Declaration** (`app_state.bank.supply`):

```json
[
  {
    "denom": "mlc",
    "amount": "257500000"
  },
  {
    "denom": "stake",
    "amount": "100000000000000"
  }
]
```

**Account Balances** (must sum to declared supply):

```json
{
  "address": "mall19wzy4k7zj9cluyhtgv27wt68au8753d3tvacud",
  "coins": [
    {
      "denom": "mlc",
      "amount": "257500000"  // This gets fixed by the script
    },
    {
      "denom": "stake",
      "amount": "100000000000000"
    }
  ]
}
```

## Ports & Services

| Service | Port | Command |
|---------|------|---------|
| Blockchain (API) | `1317` | `./scripts/start_blockchain.sh` |
| Blockchain (RPC) | `26657` | (started by script) |
| Backend | `4000` | `npm start` (in backend/) |
| Frontend | `5173` | `npm run dev` (in frontend/) |

## Troubleshooting

### Error: "genesis supply is incorrect"

→  The script automatically fixes this. Just run:

```bash
./scripts/start_blockchain.sh
```

### Error: "validator set is empty"

→ The genesis needs validators. Use a pre-built genesis from `build/node1/`

### Error: "priv_validator_state.json not found"

→ The script recreates this automatically

### Port already in use

→ Kill existing process:

```bash
lsof -ti:1317 | xargs kill -9
```

## Implementation Details

### Script Priority

1. ✅ Use cached genesis if available
2. ⏳ Fall back to build/node1 if no cache
3. ✅ Fix supply mismatch on startup
4. ✅ Restore required files
5. ✅ Start blockchain

### Supply Fix Algorithm

1. Read declared supply from `app_state.bank.supply`
2. Sum current balances from `app_state.bank.balances`
3. Calculate difference
4. Add missing amount to first account
5. Write updated genesis

## Files Related to Genesis

- `scripts/fix_genesis_supply.js` - Supply validation tool
- `scripts/start_blockchain.sh` - Startup with auto-config
- `scripts/genesis_cache.json` - Persistent genesis copy
- `build/node1/config/genesis.json` - Template source
- `blockchain_working/config/genesis.json` - Working copy

## Next Steps

1. ✅ Genesis fix script created
2. ✅ Startup script with caching created
3. ⏳ Test end-to-end with validators configured
4. ⏳ Consider git-tracking `genesis_cache.json` for reproducibility

## For Developers

To use the genesis fix in other projects:

```javascript
// Import the fix in your Node script
const { exec } = require('child_process');
exec('node fix_genesis_supply.js /path/to/genesis.json', (err) => {
  if (!err) console.log('Genesis fixed');
});
```

---

**Created**: 2026-03-02
**Purpose**: Permanent solution for blockchain genesis initialization
**Status**: Implementation complete, testing ongoing
