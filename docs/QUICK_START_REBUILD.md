# Quick Start: Rebuild Blockchain Binary
**Date**: September 29, 2026  
**Goal**: Get blockchain RPC online in 5-20 minutes

---

## TL;DR - Run This Now

```bash
cd ~/Documents/MarketplaceBlockchain-Mallchain
bash rebuild_blockchain.sh
```

**Expected**: Binary rebuilt in 5-20 minutes, ready to start.

---

## What This Does

✅ Verifies Go 1.25.8 toolchain  
✅ Downloads all dependencies  
✅ Builds `marketplaced` binary from source  
✅ Verifies output binary is valid  
✅ Shows next steps  

**No manual intervention needed** — let it run to completion.

---

## If Build Times Out (>30 min)

**Reason**: System is resource-constrained (low RAM/disk/CPU)

**Solution**:
```bash
# Kill any competing processes
pkill -f "go build"

# Check resources
free -h
df -h .

# Retry with 10-minute timeout (faster)
timeout 600 go build -o ./marketplaced ./cmd/marketplaced
```

---

## After Rebuild Completes

```bash
# 1. Go to blockchain directory
cd blockchain_working

# 2. Clean corrupted state
rm -rf data/

# 3. Start blockchain
../marketplaced start

# 4. Wait 5-10 seconds, then verify RPC responds
curl http://127.0.0.1:26657/status | jq '.result.node_info.network'
# Should output: "mallchain-1"

# 5. Verify REST responds
curl http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header.height'
# Should output: "1"
```

---

## Success Indicators

**✅ All Green**:
```
[1/6] Checking Go version... ✓ go1.25.8
[2/6] Changing to repository... ✓ Working directory
[3/6] Verifying Go modules... ✓ Modules verified
[4/6] Downloading dependencies... ✓ Dependencies downloaded
[5/6] Cleaning previous build... ✓ Old binaries removed
[6/6] Building marketplaced binary...
      (5-15 minute wait)
[BUILD SUCCESSFUL]
  ✓ Binary created
  ✓ Size: 168M
  ✓ Executable: -rwxr-xr-x

=== REBUILD COMPLETE ===
```

**❌ Build Timed Out** (after 30 min):
```
[BUILD TIMEOUT]
Build timed out after 30 minutes.
System may be resource-constrained.
```

If this happens, skip to "If Build Times Out" section above.

---

## File References

- **Script**: `rebuild_blockchain.sh` (executable)
- **Detailed Guide**: `BLOCKCHAIN_REBUILD_GUIDE.md` (for troubleshooting)
- **Build Output**: `/tmp/blockchain_build.log` (if errors occur)

---

## Why This Works

The previous binary panicked due to:
- **Incompatible compilation state** (partially built or stale cache)
- **Go version issue** (1.24.x had known sonic library issues)
- **Missing protobuf fix** (prevents proto panics)

New build will:
- ✅ Use Go 1.25.8 (latest stable, with bug fixes)
- ✅ Apply protobuf v1.36.6 fix (prevents All panics on-chain)
- ✅ Fresh compilation (no stale cache)
- ✅ Properly link gRPC server (no nil pointer dereference)

---

## Once RPC is Online

**E2E Transaction Test Ready**:
- All parameters already validated (in `LOCAL_E2E_TRANSACTION_EXECUTION_REPORT.md`)
- Wallet code already reviewed (`src/wallet/MallchainWallet.ts`)
- Backend already running on port 4000
- Frontend already running on port 3000

**Next**: Run E2E transaction test (15 minutes)

---

## Support

**Script hangs after 5 minutes?**  
→ Normal, build takes 5-20 minutes. Don't interrupt.

**Script exits with "Build timed out"?**  
→ See "If Build Times Out" section above.

**Binary doesn't start?**  
→ Check `BLOCKCHAIN_REBUILD_GUIDE.md` troubleshooting section.

---

**Start rebuild now**:
```bash
cd ~/Documents/MarketplaceBlockchain-Mallchain && bash rebuild_blockchain.sh
```

