# Blockchain Binary Recovery - Alternative Approaches
**Date**: September 29, 2026  
**Status**: Go not installed; evaluating alternatives

---

## Situation Summary

**Problem**: Blockchain binary `marketplaced` panics on startup (gRPC nil pointer dereference)

**Original Approach**: Rebuild from source with Go 1.25.8  
**Status**: ❌ **Go not installed** on current system

**Options**: 
1. ✅ Use Docker (build binary inside container)
2. ❌ Install Go (requires package manager access, slower)
3. ❌ Search GitHub for pre-built binaries (none available)
4. ✅ Use worktree backup binaries (if available and compatible)

---

## OPTION 1: Use Docker to Build (RECOMMENDED)

### Prerequisites Check
```bash
docker --version
docker-compose --version
```

### If Docker is available:

**Step 1: Build blockchain image**
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# This builds the Docker image which includes Go 1.25.8 + all dependencies
docker build -t mallchain-marketplaced:rebuild .
```

**Step 2: Extract binary from container**
```bash
# Run container and copy binary out
docker run --rm mallchain-marketplaced:rebuild sh -c 'cat /usr/local/bin/marketplaced' > ./marketplaced
chmod +x ./marketplaced
```

**Step 3: Verify binary**
```bash
./marketplaced version 2>&1 | head -5
```

**Step 4: Start blockchain**
```bash
cd blockchain_working
rm -rf data/
../marketplaced start
```

**Step 5: Verify RPC**
```bash
curl http://127.0.0.1:26657/status | jq '.result.node_info.network'
```

---

## OPTION 2: Use Docker Compose (EASIEST)

If Docker & docker-compose are both available:

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Set required environment variables
export MONGO_ROOT_PASSWORD="dev-root-password"
export MONGO_APP_PASSWORD="dev-app-password"
export JWT_SECRET="dev-jwt-secret"
export SESSION_SECRET="dev-session-secret"
export ADMIN_API_KEY="dev-admin-key"
export PAYMENT_WEBHOOK_SECRET="dev-webhook-secret"
export VITE_API_BASE_URL="http://localhost:4000"

# Start entire stack (blockchain + backend + frontend)
docker-compose up -d marketplaced

# Wait 10 seconds for startup
sleep 10

# Verify RPC responds
curl http://127.0.0.1:26657/status | jq '.result.node_info.network'
```

**Pros**:
- ✅ Everything in one command
- ✅ All dependencies pre-installed in Docker
- ✅ Isolated environment (no system pollution)
- ✅ Consistent with production deployment

**Cons**:
- Requires Docker installed
- ~200MB image download (first time)

---

## OPTION 3: Check Worktree Backups

Worktree backups may have compatible blockchain binaries or states:

```bash
# Look for pre-built binaries in worktrees
find /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees -name "marketplaced" -type f 2>/dev/null

# Check if any worktree has a complete blockchain_working state
ls -la /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/*/blockchain_working/ 2>/dev/null | head -20
```

**If found**: Copy the entire blockchain_working directory:
```bash
cp -r /path/to/worktree/blockchain_working ./blockchain_working_backup
cd blockchain_working_backup
../marketplaced start
```

---

## OPTION 4: Install Go (Not Recommended - Slow)

If none of the above options work and you need to rebuild:

```bash
# Check current Go installations
which go
go version

# If Go is not installed, install it (requires system access)
# On Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y golang-1.25

# On macOS with Homebrew:
brew install go

# Then retry rebuild:
bash rebuild_blockchain.sh
```

---

## Decision Tree

**Q: Is Docker installed?**
```
YES → Use OPTION 1 or 2 (recommended)
      docker build . && extract binary
      OR
      docker-compose up
      
NO  → Go to next question
```

**Q: Do you need to rebuild?**
```
YES → Go to next question
      
NO  → Check worktree backups (OPTION 3)
```

**Q: Do you have system access to install Go?**
```
YES → Install Go 1.25.8+ and run rebuild_blockchain.sh (OPTION 4)
      
NO  → You may be blocked (no Go, no Docker, no pre-built binaries)
      → Contact maintainers or check GitHub releases
```

---

## Docker Installation Status

Let me check if Docker is available:

```bash
# Command to check
docker ps 2>&1
docker-compose version 2>&1

# If either fails with "command not found":
# → Go is not installed on this system
# → Rebuild approach won't work without Docker

# If both work:
# → Proceed with OPTION 1 or 2
```

---

## What to Do Right Now

### Immediate Steps:

**Step 1: Check Docker availability**
```bash
docker --version && echo "✓ Docker available" || echo "✗ Docker not found"
docker-compose --version && echo "✓ docker-compose available" || echo "✗ docker-compose not found"
```

**Step 2: Based on output, choose option:**

| Docker | docker-compose | Recommendation |
|--------|---|---|
| ✅ Yes | ✅ Yes | **Use OPTION 2** (docker-compose up) |
| ✅ Yes | ❌ No | **Use OPTION 1** (docker build + extract) |
| ❌ No | ❌ No | Check worktrees (OPTION 3), then install Go (OPTION 4) |

**Step 3: Execute chosen option**

---

## Docker Build Time Estimates

| Operation | Estimated Time |
|-----------|---|
| Docker image build (first run) | 5-15 minutes |
| Docker image build (cached) | 1-2 minutes |
| Extract binary from container | <1 minute |
| docker-compose up (full stack) | 10-20 minutes (first run) |
| docker-compose up (cached) | 2-5 minutes |

---

## Fallback: Worktr ee Backups

If no other option works, check for pre-built blockchain binaries or states:

```bash
# Find all marketplaced binaries
find /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain -name "marketplaced" -type f 2>/dev/null | while read binary; do
  echo "Found: $binary"
  file "$binary"
  ls -lh "$binary"
done

# Try running the newest one
for dir in /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/*/blockchain_working; do
  [ -d "$dir" ] && echo "Backup blockchain state: $dir"
done
```

---

## Estimated Recovery Time by Option

| Option | Prerequisites | Time | Risk | Recommendation |
|--------|---|---|---|---|
| **1: Docker build** | Docker | 10-20 min | Low | ✅ Good |
| **2: docker-compose** | Docker + docker-compose | 15-30 min | Low | ✅ Best |
| **3: Worktree backup** | Backup exists | 2-5 min | Medium | ✅ Fast if available |
| **4: Install Go** | System access | 5-30 min | Medium | ❌ Slowest |

---

## Summary

**Current Status**: Go not installed; rebuild from source not possible

**Best Path Forward**: 
1. Check if Docker is available
2. If yes → Use docker-compose (simplest)
3. If no → Check worktree backups
4. If neither → Install Go or contact maintainers

**Next Step**: Determine which option applies to your environment.

---

## Detailed Option Comparison

### Option 1: Docker Build (Manual Binary Extraction)
```
Pros:
  ✅ Only requires Docker (not docker-compose)
  ✅ Full control over build process
  ✅ Binary extracted to host system
  ✅ Can be debugged step-by-step

Cons:
  ❌ Manual steps (not automated)
  ❌ Slower than docker-compose (one service vs full stack)
  ❌ More complex troubleshooting

Time: 10-20 minutes (first), 1-2 min rebuild
```

### Option 2: docker-compose Up (Full Stack)
```
Pros:
  ✅ Single command to start entire stack
  ✅ All services start (frontend, backend, blockchain, DB, Redis)
  ✅ Fully integrated testing possible immediately
  ✅ Production-like environment
  ✅ Easy rollback (docker-compose down)

Cons:
  ❌ Requires both Docker and docker-compose
  ❌ Uses more resources (all services running)
  ❌ Takes longer to start
  ❌ Harder to debug individual services

Time: 15-30 minutes (first), 2-5 min full-stack restart
```

### Option 3: Worktree Backup
```
Pros:
  ✅ Instant (no build needed)
  ✅ No external dependencies required
  ✅ Local copy available
  ✅ May have known-good state

Cons:
  ❌ Only works if backup exists and is compatible
  ❌ May have stale data
  ❌ May have the same panic issue if binary wasn't rebuilt

Time: 2-5 minutes (if available)
```

### Option 4: Install Go
```
Pros:
  ✅ Native performance (no containerization overhead)
  ✅ Full debugging tools available locally
  ✅ Matches local development setup

Cons:
  ❌ Requires system package manager access
  ❌ Takes 5-30 minutes to install
  ❌ Pollutes local system (adds 500MB+ Go toolchain)
  ❌ Slowest overall

Time: Install 5-20 min, then rebuild 10-20 min (30-40 min total)
```

---

## Files Available for Reference

- `rebuild_blockchain.sh` — Build script (requires Go)
- `BLOCKCHAIN_REBUILD_GUIDE.md` — Detailed rebuild instructions
- `QUICK_START_REBUILD.md` — Quick reference for rebuild
- `docker-compose.yml` — Full stack configuration
- `Dockerfile` — Blockchain image definition
- `backend/Dockerfile` — Backend image definition
- `mallchain-os-v14/Dockerfile` — Frontend image definition

---

**Status**: Awaiting confirmation of Docker availability  
**Next Action**: Determine which option to proceed with

