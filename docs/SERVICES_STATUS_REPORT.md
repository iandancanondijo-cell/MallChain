# SERVICES STATUS REPORT — September 21, 2026, 18:50 UTC

## STATUS SUMMARY

| Service | Status | Notes |
|---------|--------|-------|
| **Frontend (Vite)** | ✅ RUNNING | Port 3000, term ID 1 |
| **Backend** | ✅ RUNNING | Port 4000, term ID 4, Node.js dev server |
| **MongoDB** | ⚠️ RUNNING (misconfigured) | Port 27018, not in replica-set mode, backend cannot connect |
| **Redis** | ⏸️ NOT STARTED | Backend reports error |
| **Blockchain (marketplaced)** | ❌ FAILED | Binary/genesis incompatibility, panics on init |
| **Overall** | 🔴 DEGRADED | Blockchain unavailable, DB not in HA mode |

---

## DETAILED FINDINGS

### Frontend (✅ Operational)
- **Process**: `npm run dev` (Vite dev server)
- **Port**: http://localhost:3000
- **Status**: Running, serving dashboard pages
- **Verification**: Process running in terminal

### Backend (✅ Operational)
- **Process**: `npm run dev` (Node.js development server)
- **Port**: http://localhost:4000
- **Health Endpoint**: `/api/health` returning status `degraded`
- **Status**: Running but reporting downstream failures
- **Health Details**:
  - Backend service: "ok"
  - Blockchain: "down" (ECONNREFUSED :1317)
  - Database: "disconnected"
  - Redis: "error"
- **Verification**: HTTP endpoint responding, services not available

### MongoDB (⚠️ Misconfigured)
- **Process**: System daemon `/usr/bin/mongod --config /etc/mongod.conf`
- **Port**: 27017 (default)
- **PID**: 1369
- **Issue**: NOT running with `--replSet rs0` flag
- **Cause**: /etc/mongod.conf has replication section commented out
- **Impact**: 
  - Backend cannot connect (expects replica set)
  - Docker compose config requires `replSet rs0` with keyfile auth
  - `mongosh` commands fail: "not running with --replSet"
- **Fix Required**: Enable replication in config or restart with `--replSet` flag
- **Verification**: `mongosh --eval "rs.status()"` → Error

### Redis (⏸️ Not Started)
- **Status**: Not running (or not accessible)
- **Backend Health**: Reports "error"
- **Port**: 6379 (expected)
- **Issue**: Process not found in `ps aux | grep redis`
- **Fix Required**: Start Redis service
- **Verification**: `ps aux | grep redis` → no process found

### Blockchain (marketplaced) (❌ Critical Failure)
- **Binary**: `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/marketplaced` (168MB executable)
- **Home**: `blockchain_working/` directory
- **Ports**: RPC 26657, REST 1317
- **Status**: **PANIC — Binary incompatible with genesis or config**
- **Error**: Multiple panics observed:
  1. **gRPC Server Panic**: `runtime error: invalid memory address or nil pointer dereference` at line 48 of `server/grpc/server.go`
  2. **GenUtil Panic**: Issues with InitGenesis when loading wasmbridge module
  3. **Store Version Mismatch**: After restoring state, "version of store wasmbridge mismatch"
- **Root Cause Analysis**:
  - Binary compiled for Cosmos SDK v0.53.4 with CometBFT 0.38.19
  - Genesis files from worktrees are incompatible with current binary version
  - Storing blockchain state in data/ directory causes version conflicts on restart
  - Fresh genesis creation triggers panics in genutil module
- **Attempted Solutions**:
  1. ✗ Rebuilt blockchain_working with fresh genesis → panic in wasmbridge module
  2. ✗ Restored working state from `.kilo/worktrees/` → store version mismatch
  3. ✗ Copied genesis + config from known-good worktree → still panics on init
  4. ✗ Removed gRPC API flags → still panics in gRPC startup code
- **Verification Attempts**:
  - `curl http://127.0.0.1:26657/status` → Connection refused
  - `curl http://127.0.0.1:1317/...` → Connection refused
  - All blockchain attempts failed with Go panic stack traces

---

## IMPACT ANALYSIS

### Blocked Tasks
- **Transaction Integration Testing**: Cannot test signing/broadcasting without blockchain RPC
- **E2E Transaction Verification**: Blocked (depends on blockchain)
- **Testnet Readiness**: Cannot validate against real chain
- **Backend Full Integration**: Backend cannot verify transaction responses

### Workarounds Available
- **Frontend**: Can test UI on simulator (default mode)
- **Wallet Operations**: Can verify wallet crypto locally without broadcasts
- **Database**: Can test with temporary single-node MongoDB (sacrifice HA guarantees)

---

## RECOMMENDED NEXT STEPS

### Priority 1: Restore Blockchain Service (BLOCKER)
1. **Investigate Binary Compatibility**:
   - Check if binary was compiled with correct SDK/CometBFT versions
   - Compare with worktree binaries that were working
   - Rebuild binary from source if necessary

2. **Alternative: Use Working Backup**:
   - Fully restore blockchain state from working worktree
   - Copy entire `blockchain_working/` directory including data/
   - Verify consensus engine starts without panics

3. **Last Resort: Use Docker**:
   - Use docker-compose to spin up containerized blockchain
   - Docker image may have different binary that works
   - See `docker-compose.yml` in worktrees

### Priority 2: Configure MongoDB for HA
1. Edit `/etc/mongod.conf` to uncomment `replication:` section and set `replSetName: rs0`
2. Restart MongoDB daemon
3. Run `mongosh` to initialize replica set: `rs.initiate()`

### Priority 3: Start Redis
1. Determine how Redis was previously started (system service, manual, Docker)
2. Restart Redis on port 6379

---

## RESOURCES FOR INVESTIGATION

### Working Blockchain States (from worktrees)
- `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/equal-frost/blockchain_working/` (config only)
- `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/zealous-element/blockchain_working/` (full state with data)

### Docker Compose Files
- `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/equal-frost/docker-compose.yml` (full stack)
- Same in `zealous-element` worktree

### Related Files
- `blockchain_working/config/genesis.json` (validator configuration)
- `blockchain_working/config/app.toml` (API settings)
- `blockchain_working/data/priv_validator_state.json` (validator state)

---

## CONCLUSION

**Current Status**: Infrastructure 40% operational
- **Degraded**: 3/5 services down or misconfigured
- **Critical Blocker**: Blockchain binary panic prevents any RPC/REST communication
- **Temporary Workaround**: Can use simulator mode on frontend for testing

**Recommendation**: Investigate blockchain binary compatibility or restore from Docker image before proceeding with E2E transaction testing.
