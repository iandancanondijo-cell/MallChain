# MALLCHAIN SECOND-PASS VERIFICATION — PHASE 1: CURRENT STATE

**Date:** 2026-09-28  
**Git Commit:** 5984a61d1011e2426fa24bcc272d4542aee52d5c  
**Commit Message:** Fix vault module signer annotations and enable node startup

## SYSTEM IDENTITY

### Blockchain
- **Binary:** /tmp/marketplaced (172MB, built 2026-09-28 15:44)
- **Build Source:** Current repository (commit 5984a61)
- **Go Version:** go1.25.8 linux/amd64
- **Chain ID:** mallchain-1
- **Genesis Time:** 2026-05-28T04:06:10.181913343Z
- **Current Height:** 0 (NOT PRODUCING BLOCKS)
- **Block Time:** 1970-01-01T00:00:00Z (genesis only)
- **RPC Endpoint:** http://127.0.0.1:26657 (RESPONSIVE)
- **gRPC Endpoint:** localhost:9090 (LISTENING)
- **Process PID:** 134470

### Backend
- **Version:** 0.1.0
- **Port:** 4000 (NOT 3001 as documented)
- **Process PID:** 75727 (existing), 134858 (nodemon, failed to start - port conflict)
- **Status:** DEGRADED
  - Backend: OK
  - Database (MongoDB): OK
  - Redis: OK
  - Chain: DOWN (connect ECONNREFUSED 127.0.0.1:1317)

### Frontend
- **Version:** 0.0.0
- **Status:** NOT RUNNING (not started in this session)

### Database
- **MongoDB:** Running (PID 1381)
- **Redis:** Running (PID 9654, port 6379)

## CRITICAL ISSUES IDENTIFIED

### 1. BLOCKCHAIN NOT PRODUCING BLOCKS
- **Symptom:** Height stuck at 0, catching_up=true
- **Log Evidence:** "This node is not a validator"
- **Root Cause:** Node is not configured as a validator in genesis
- **Impact:** No transactions can be processed, no state changes possible

### 2. BACKEND CHAIN CONNECTION FAILED
- **Symptom:** Backend reports chain status "down"
- **Error:** connect ECONNREFUSED 127.0.0.1:1317
- **Root Cause:** gRPC-gateway not listening on port 1317
- **Impact:** Backend cannot query blockchain state

### 3. VALIDATOR NOT CONFIGURED
- **Validator Address:** 8FA11154FAE4ECFB34ACFA7CAD8B07841F5BD676
- **Validator Key:** Present (.marketplace_test/config/priv_validator_key.json)
- **Genesis Validators:** Need to check if this address is in genesis validators list

## CONFIGURATION STATUS

### Blockchain Configuration
- **Home Directory:** .marketplace_test
- **Config File:** .marketplace_test/config/config.toml
- **App Config:** .marketplace_test/config/app.toml
- **Minimum Gas Prices:** 0stake (configured)
- **gRPC:** Enabled on port 9090
- **API (gRPC-gateway):** Need to verify port 1317 configuration

### Backend Configuration
- **Environment:** .env (0 variables injected)
- **MongoDB:** Connected
- **Redis:** Connected
- **Blockchain RPC:** Configured for 127.0.0.1:1317 (WRONG - should be 26657 for RPC or needs gRPC-gateway on 1317)

## WORKING TREE STATUS

**Modified Files (committed):**
- app/app.go
- cmd/marketplaced/main.go
- marketplace/vault/v1/tx.pb.go
- proto/marketplace/vault/v1/tx.proto
- x/vault/types/zz_descriptor_register.go
- x/wasm/module/module.go
- .marketplace_test/config/app.toml

**Untracked Files:** 20+ files (test scripts, terraform plans, data backups)

## NEXT STEPS REQUIRED

1. **Fix blockchain block production:**
   - Check genesis.json for validator configuration
   - Verify validator address is in genesis validators
   - If missing, need to regenerate genesis with validator

2. **Fix backend chain connection:**
   - Check app.toml for API/gRPC-gateway configuration
   - Enable gRPC-gateway on port 1317 OR
   - Update backend to use RPC endpoint on 26657

3. **Start frontend:**
   - Launch mallchain-app dev server
   - Verify it connects to backend on port 4000

## VERIFICATION STATUS

| Component | Status | Evidence |
|-----------|--------|----------|
| Git Repository | VERIFIED | Commit 5984a61 |
| Blockchain Binary | BUILT | /tmp/marketplaced exists |
| Blockchain Node | RUNNING | PID 134470, RPC responsive |
| Block Production | FAILED | Height 0, not validator |
| Backend Process | RUNNING | PID 75727 on port 4000 |
| Backend Health | DEGRADED | Chain connection failed |
| MongoDB | RUNNING | PID 1381 |
| Redis | RUNNING | PID 9654 |
| Frontend | NOT RUNNING | Not started |

---

**PHASE 1 VERDICT:** Infrastructure is present but blockchain is not functional (no block production). Backend cannot connect to chain. Cannot proceed with transaction testing until block production is fixed.
