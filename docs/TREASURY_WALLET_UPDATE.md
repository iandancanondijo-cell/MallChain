# Treasury Wallet Address Update

## Summary
Updated the treasury wallet addresses from placeholder `marketplace1` format to the correct `mall1` bech32 format across the backend and genesis configuration.

## Correct Wallet Addresses

| Wallet | Address | Balance (MLCNS) |
|--------|---------|-----------------|
| Founder | `mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg` | 160,000,000 |
| AFA | `mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6` | 1,500,000 |
| Orthopharm | `mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f` | 3,000,000 |
| Team | `mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5` | 90,000,000 |

## Files Modified

### 1. Backend - `/backend/src/routes/economy.js`
Updated `WALLET_ADDRESSES` constant (lines 10-16):
```javascript
const WALLET_ADDRESSES = {
  founder: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
  afa: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
  orthopharm: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f',
  team: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5'
}
```

### 2. Genesis Configuration - `/blockchain_working/config/genesis.json`
Updated `app_state.mcoin.wallet_balance_map` (lines 309-334) with the correct `mall1` addresses.

### 3. Backup Genesis - `/.marketplace_test/config/genesis.json`
Also updated with the correct addresses for consistency.

## Current Status

✅ **Backend**: Updated and running with correct wallet addresses  
✅ **Genesis.json**: Updated with correct wallet addresses  
⚠️ **Blockchain**: Needs proper reinitialization to apply the new genesis

## Next Steps for Full Deployment

The local blockchain needs to be properly reinitialized with the updated genesis.json. This requires:

1. **Stop the blockchain** (if running):
   ```bash
   pkill -f marketplaced
   ```

2. **Backup existing data** (optional):
   ```bash
   mv blockchain_working/data blockchain_working/data.backup
   ```

3. **Reinitialize blockchain state**:
   The blockchain must be initialized fresh with the updated genesis.json. This typically requires:
   - Removing the existing `data/` directory
   - Running the blockchain initialization process
   - Ensuring validator keys match the genesis configuration

4. **Start blockchain**:
   ```bash
   ./scripts/start_blockchain.sh
   ```

5. **Verify wallet balances**:
   ```bash
   curl http://localhost:1317/tmp/marketplace/mlcoin/v1/wallet_balance | jq '.'
   ```

## Why This Matters

The Economics page (`/economy`) displays treasury wallet balances for transparency. With the correct addresses:
- Users can see the actual prefunded wallet balances
- The emission schedule and treasury data are accurate
- On-chain transparency is maintained

## Technical Notes

- The `marketplace1` addresses were placeholders in the original genesis
- The `mall1` addresses are the actual bech32-encoded Cosmos SDK addresses
- Both genesis.json and backend must use the same addresses for consistency
- The blockchain state is immutable once initialized - genesis changes require a full reset
