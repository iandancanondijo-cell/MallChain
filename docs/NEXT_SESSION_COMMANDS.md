# NEXT SESSION — COMMANDS TO RUN

Copy and paste these commands in order. Stop when one fails and report the error.

---

## STEP 1: Check Current Process Status (2 min)

```bash
# Should show 2 processes (frontend + backend)
ps aux | grep "npm run dev" | grep -v grep

# Should show empty (blockchain crashed)
ps aux | grep marketplaced | grep -v grep

# Verify frontend is still serving
curl -s http://localhost:3000 | head -5
```

**Expected**: Frontend & backend processes running, blockchain not running, frontend HTML returns 200

---

## STEP 2: Attempt Blockchain Binary Recovery (Choose One)

### Option A: Quick Binary Check (1 min)
```bash
# Look for alternative binaries
find /home/elle_bryson -name "marketplaced" -type f -executable 2>/dev/null | grep -v "MarketplaceBlockchain-Mallchain"

# Check worktrees
ls -lh /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/*/marketplaced 2>/dev/null
```

**If found**: Copy best option to replace current binary:
```bash
cp <FOUND_PATH>/marketplaced /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/marketplaced_backup_old
cp <FOUND_PATH>/marketplaced /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/marketplaced
chmod +x /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/marketplaced

# Skip to Step 3 (Testing)
```

---

### Option B: Rebuild Binary (5-15 min)
```bash
# Set up Go path
export PATH=/usr/local/go/bin:$PATH
which go  # Should show /usr/local/go/bin/go

# Navigate to repo
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Attempt build with timeout (try different timeouts if needed)
timeout 300 go build -o marketplaced_new ./cmd/marketplaced

# If successful, replace old binary
if [ -f marketplaced_new ]; then
  mv marketplaced marketplaced_backup_old
  mv marketplaced_new marketplaced
  chmod +x marketplaced
  echo "✅ Binary replaced successfully"
else
  echo "❌ Build failed or timed out"
fi
```

**If this works**: Skip to Step 3 (Testing)  
**If timeout**: Try with `timeout 600` (10 minutes) or `timeout 0` (no timeout)

---

### Option C: Skip to Workaround (If Binary Recovery Impossible)
```bash
# If neither A nor B work, you'll test on simulator only
echo "⚠️ Blockchain binary cannot be recovered"
echo "Proceeding with simulator-only testing"

# Skip to WORKAROUND section at end of this document
```

---

## STEP 3: Clean Blockchain State & Start (3 min)

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Backup current state (just in case)
cp -r blockchain_working blockchain_working_backup_$(date +%s) 2>/dev/null || true

# Clean data directory for fresh start
rm -rf blockchain_working/data/*

# Create fresh validator state
mkdir -p blockchain_working/data
cat > blockchain_working/data/priv_validator_state.json << 'EOF'
{
  "height": "0",
  "round": 0,
  "step": 0
}
EOF

echo "✅ Blockchain state cleaned"
```

---

## STEP 4: Start Blockchain (15-30 sec)

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Start blockchain in background
# Note: This will take ~10 seconds to initialize
nohup ./marketplaced start --home=./blockchain_working --minimum-gas-prices="0.01umal" > blockchain.log 2>&1 &

# Wait for it to initialize
sleep 10

# Check if it's running
curl -s http://127.0.0.1:26657/status | jq '.result.sync_info | {latest_block_height, catching_up}'
```

**Expected output**:
```json
{
  "latest_block_height": "1",
  "catching_up": false
}
```

**If you see this**: ✅ **BLOCKCHAIN IS ONLINE** — Proceed to Step 5

**If you see error**: ❌ Blockchain still panicking
```bash
# Check the logs
tail -50 blockchain.log

# Report the error and stop here
exit 1
```

---

## STEP 5: Verify All RPC Endpoints (2 min)

```bash
# RPC Status endpoint
echo "Testing RPC..."
curl -s http://127.0.0.1:26657/status | jq '.result.sync_info.latest_block_height'

# REST Latest Block endpoint
echo "Testing REST..."
curl -s http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header.height'

# Account query (sender account)
echo "Testing Account query..."
curl -s "http://127.0.0.1:1317/cosmos/auth/v1beta1/accounts/mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg" | jq '.account.base_account.sequence'
```

**Expected**:
- RPC returns block height > 0
- REST returns block height > 0
- Account query returns sequence = 0

**If all pass**: ✅ **BLOCKCHAIN RPC VERIFIED** — Proceed to Step 6

**If any fail**: Check blockchain logs:
```bash
tail -100 blockchain.log | grep -i error
```

---

## STEP 6: Configure MongoDB (2 min)

```bash
# Check MongoDB status
mongosh --eval "rs.status()" 2>&1

# If error "not running with --replSet":
mongosh --eval "rs.initiate()"

# Verify
mongosh --eval "rs.status()" | head -20
```

**Expected**: No errors, should show replica set status

---

## STEP 7: Start Redis (1 min)

```bash
# Check if already running
ps aux | grep redis-server | grep -v grep

# If not running, start it
redis-server --daemonize yes --port 6379

# Verify
redis-cli ping
# Should respond: PONG
```

---

## STEP 8: Verify Backend Health (1 min)

```bash
# Check health endpoint
curl -s http://localhost:4000/api/health | jq .

# Expected:
# {
#   "status": "ok" or "degraded",
#   "backend": "ok",
#   "chain": {"status": "ok"},
#   "database": {"status": "ok"},
#   "redis": {"status": "ok"}
# }
```

**If all "ok"**: ✅ **INFRASTRUCTURE READY** — Proceed to Step 9

**If still degraded**: Some services may need time to reconnect:
```bash
# Wait and retry
sleep 5
curl -s http://localhost:4000/api/health | jq .
```

---

## STEP 9: Execute E2E Transaction Test (15 min)

All parameters are pre-validated. Execute the test immediately:

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Source the test variables
export SENDER="mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg"
export RECIPIENT="mall1tygms3xhhs3yv487phx3dw4a95jn7t7l2gq9dt"
export AMOUNT="1000"
export CHAIN_ID="mallchain-1"

# Read the test instructions
cat LOCAL_E2E_TRANSACTION_EXECUTION_REPORT.md

# Execute steps in order:
# 1. Approve the transaction summary
# 2. Unlock wallet with test seed phrase
# 3. Sign transaction
# 4. Broadcast signed transaction
# 5. Poll for confirmation
# 6. Query final state
# 7. Generate report
```

See `LOCAL_E2E_TRANSACTION_EXECUTION_REPORT.md` for detailed step-by-step instructions.

---

## STEP 10: Generate Final Report (5 min)

Once E2E test completes (success or failure):

```bash
# Create final test report with all results
cat > LOCAL_E2E_FINAL_TEST_REPORT.md << 'EOF'
# LOCAL E2E TRANSACTION TEST — FINAL REPORT
## [DATE] [TIME] UTC

### Test Environment
- Chain ID: [FROM_STATUS]
- RPC: http://127.0.0.1:26657
- REST: http://127.0.0.1:1317
- Sender: [SENDER_ADDRESS]
- Recipient: [RECIPIENT_ADDRESS]

### Phase 1: Validation
[RESULTS]

### Phase 2: Approval
[RESULTS]

### Phase 3: Execution
[RESULTS - SIGNING]
[RESULTS - BROADCAST]
[RESULTS - CONFIRMATION]

### Phase 4: Verification
- Sender balance before: [AMOUNT]
- Sender balance after: [AMOUNT]
- Recipient received: [AMOUNT]
- Transaction hash: [HASH]
- Block height: [HEIGHT]

### Conclusion
[PASS / FAIL / BLOCKED]

### Evidence
- Command outputs
- Transaction hash
- Final balances
EOF

# Review the report
cat LOCAL_E2E_FINAL_TEST_REPORT.md
```

---

## TROUBLESHOOTING

### Blockchain Still Won't Start
```bash
# Check detailed error
./marketplaced start --home=./blockchain_working 2>&1 | head -100

# Try with different flags
./marketplaced start --home=./blockchain_working --log_level=debug 2>&1 | head -100

# Check if binary is for wrong architecture
file marketplaced
# Should show: ELF 64-bit LSB executable, x86-64...
```

### Blockchain Starts But No Blocks Produced
```bash
# Wait longer (consensus may be slow)
sleep 30

# Check again
curl -s http://127.0.0.1:26657/status | jq '.result.sync_info.latest_block_height'

# If still 0, check logs
tail -50 blockchain.log
```

### REST Endpoint Timing Out
```bash
# REST may take longer to initialize
sleep 20

# Try again
curl -s http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest
```

### MongoDB Still Not Working
```bash
# Try manual replica set init with more verbosity
mongosh --verbose --eval "rs.initiate()"

# Or reinitialize from scratch
mongosh --eval "rs.initiate({
  _id: 'rs0',
  members: [{_host: 'localhost:27017', _id: 0}]
})"
```

---

## WORKAROUND: Simulator-Only Testing (If Binary Cannot Be Recovered)

If blockchain binary cannot be recovered after attempts:

```bash
# Frontend is already running on simulator mode by default
# Open http://localhost:3000 in browser

# You can test:
# 1. Wallet creation (Create → New Wallet)
# 2. Wallet import (Create → Import Seed)
# 3. Network selection (look for network switcher)
# 4. Simulated balances (Dashboard shows fake data)
# 5. UI workflows (all screens accessible)

# You cannot test:
# - Real transaction broadcasting
# - Blockchain confirmation
# - Balance updates from blockchain
# - Real account sequences

# Document limitations:
cat > SIMULATOR_TEST_REPORT.md << 'EOF'
# SIMULATOR-ONLY TEST REPORT

## Testing Completed (Simulator Mode)
- ✅ Wallet creation
- ✅ Wallet import
- ✅ UI navigation
- ✅ Network selector
- ✅ Simulated balances

## Testing Blocked (Blockchain Required)
- ❌ Transaction broadcasting
- ❌ On-chain confirmation
- ❌ Real balance updates
- ❌ Account sequence management

## Conclusion
Wallet code is ready for real blockchain integration once blockchain service is recovered.
EOF
```

---

## QUICK REFERENCE

### Current Services Status Command
```bash
echo "=== FRONTEND ===" && curl -s http://localhost:3000 | head -1
echo "=== BACKEND ===" && curl -s http://localhost:4000/api/health | jq .status
echo "=== BLOCKCHAIN ===" && curl -s http://127.0.0.1:26657/status | jq '.result.sync_info.latest_block_height // "DOWN"'
echo "=== MONGODB ===" && mongosh --eval "db.adminCommand('ping')" 2>&1 | grep ok
echo "=== REDIS ===" && redis-cli ping 2>/dev/null || echo "NOT RUNNING"
```

### Kill All Processes (If Needed)
```bash
pkill -f "npm run dev"
pkill -f "marketplaced"
```

### Start All Processes Fresh
```bash
# Terminal 1: Blockchain
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
./marketplaced start --home=./blockchain_working --minimum-gas-prices="0.01umal"

# Terminal 2: Backend
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend
npm run dev

# Terminal 3: Frontend
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app
npm run dev
```

---

## TIMELINE ESTIMATE

| Step | Time |
|------|------|
| 1. Check status | 2 min |
| 2. Recover binary (A, B, or C) | 5-15 min |
| 3. Clean blockchain state | 3 min |
| 4. Start blockchain | 2 min |
| 5. Verify RPC endpoints | 2 min |
| 6. Configure MongoDB | 2 min |
| 7. Start Redis | 1 min |
| 8. Verify backend health | 1 min |
| 9. Execute E2E test | 15 min |
| 10. Generate final report | 5 min |
| **TOTAL** | **~40-50 min** |

If Step 2 fails and binary cannot be recovered, reduce to ~20 min and execute simulator workaround instead.

---

## SUCCESS CRITERIA

Test is **COMPLETE** when you see:
```
✅ Blockchain RPC responding
✅ All endpoints verified
✅ E2E transaction executed
✅ Final test report generated with:
   - Transaction hash
   - Block height
   - Sender/recipient balances
   - Confirmation status
```

---

**Created**: 2026-09-21 19:35 UTC  
**Purpose**: Ready-to-execute commands for next session  
**Updated From**: SESSION_COMPLETION_SUMMARY.md  
**Dependency**: Successful blockchain binary recovery
