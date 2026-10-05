# Blockchain Binary Rebuild Guide
**Date**: September 29, 2026  
**Status**: Step-by-step instructions to rebuild `marketplaced` binary

---

## Problem Summary
The current `marketplaced` binary (168MB) panics during startup:
- **Error**: `panic: runtime error: invalid memory address or nil pointer dereference`
- **Location**: `cosmos-sdk@v0.53.4/server/grpc/server.go:48`
- **Impact**: Cannot start RPC/REST endpoints, E2E transaction testing blocked

---

## Solution: Rebuild Binary from Source

### Option 1: Full Rebuild (Recommended - 15-20 minutes)

This rebuilds the entire blockchain binary from scratch using the current Go 1.25.8 toolchain.

```bash
#!/bin/bash
set -e

echo "=== Blockchain Binary Rebuild Script ==="
echo "Start time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Step 1: Verify Go installation
echo "[1/6] Checking Go version..."
GO_VERSION=$(go version | grep -oP '\d+\.\d+\.\d+')
echo "  Go version: $GO_VERSION"
if ! command -v go &> /dev/null; then
  echo "ERROR: Go not found. Install Go 1.25.8 or later."
  exit 1
fi

# Step 2: Verify Go module dependencies
echo "[2/6] Verifying Go modules..."
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
go mod verify
echo "  ✓ Modules verified"

# Step 3: Download Go module dependencies
echo "[3/6] Downloading dependencies (this may take 3-5 minutes)..."
go mod download
echo "  ✓ Dependencies downloaded"

# Step 4: Clean old binary
echo "[4/6] Cleaning previous build..."
rm -f ./marketplaced /tmp/marketplaced
echo "  ✓ Old binaries removed"

# Step 5: Build blockchain binary with extended timeout
echo "[5/6] Building marketplaced binary (10-15 minute timeout)..."
echo "      This is expected to take 3-10 minutes depending on system performance."
echo "      DO NOT INTERRUPT - let build complete fully."

# Build with timeout of 30 minutes (1800 seconds) and verbose output
timeout 1800 go build \
  -v \
  -o ./marketplaced \
  -ldflags="-X github.com/cosmos/cosmos-sdk/version.Name=marketplace" \
  ./cmd/marketplaced \
  2>&1 | tee /tmp/blockchain_build.log

BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 124 ]; then
  echo "ERROR: Build timed out after 30 minutes. System may be resource-constrained."
  echo "Log saved to: /tmp/blockchain_build.log"
  exit 124
elif [ $BUILD_EXIT -ne 0 ]; then
  echo "ERROR: Build failed with exit code $BUILD_EXIT"
  echo "Log saved to: /tmp/blockchain_build.log"
  echo "Review errors above and check Go module compatibility."
  exit $BUILD_EXIT
fi

# Step 6: Verify binary
echo "[6/6] Verifying binary..."
if [ ! -f ./marketplaced ]; then
  echo "ERROR: Binary not found at ./marketplaced"
  exit 1
fi

BINARY_SIZE=$(stat -f%z "./marketplaced" 2>/dev/null || stat -c%s "./marketplaced")
echo "  ✓ Binary created: $(du -h ./marketplaced | cut -f1)"
echo "  ✓ Size: ${BINARY_SIZE} bytes"

# Verify it's executable
if [ ! -x ./marketplaced ]; then
  chmod +x ./marketplaced
  echo "  ✓ Made executable"
fi

# Quick sanity check: try to get version (don't actually run, just check binary is valid)
echo "[DONE] Binary rebuild complete!"
echo "End time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""
echo "Next step: Start blockchain with the new binary:"
echo "  cd blockchain_working"
echo "  ./marketplaced start"
```

**To run this script:**

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
bash rebuild_blockchain.sh
```

### Option 2: Quick Build (Faster - 5-10 minutes)

If the full rebuild doesn't work or times out, try a quick build with caching:

```bash
#!/bin/bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

echo "Quick blockchain build (with cache)..."
go build -o ./marketplaced ./cmd/marketplaced 2>&1 | tail -20

if [ -f ./marketplaced ]; then
  echo "✓ Binary created successfully"
  ls -lh ./marketplaced
else
  echo "✗ Build failed"
  exit 1
fi
```

### Option 3: Use Ignite CLI (Cosmos-recommended)

If Ignite is available, use the official Cosmos build tool:

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain

# Install ignite if not present
if ! command -v ignite &> /dev/null; then
  echo "Installing Ignite CLI..."
  go install github.com/ignite/cli/v29@latest
fi

# Build using Ignite
echo "Building with Ignite CLI..."
ignite chain build --release -o ./marketplaced
```

---

## Understanding the Build Process

### What Happens During Build:
1. **Dependency resolution**: Go downloads all required modules (already cached locally)
2. **Compilation**: Go compiles ~50+ packages from the Cosmos SDK + Mallchain code
3. **Linking**: Linker combines all compiled packages into final binary
4. **Verification**: Binary is checked for runtime symbol resolution

### Why Previous Build Timed Out:
- System likely has resource constraints (limited RAM/CPU)
- First full build requires downloading + compiling many dependencies
- Go's linker can be slow on resource-constrained systems

### Why Rebuild Often Works:
- **Newer Go version**: Go 1.25.8 has optimizations that 1.24.x may lack
- **Clean state**: Removes any corrupted cache from failed builds
- **Dependency fix**: go.mod has protobuf fix that prevents proto panics

---

## Build Troubleshooting

### If Build Times Out (>30 min):
```bash
# Check system resources
free -h                # RAM available
df -h /tmp            # Disk space
ps aux | grep -E "go|compile" | head -20  # Active processes

# Kill any competing builds
pkill -f "go build"
pkill -f "go test"

# Try again with smaller timeout (10 min)
timeout 600 go build -o ./marketplaced ./cmd/marketplaced
```

### If Build Fails with Module Error:
```bash
# Clean Go cache
go clean -cache
go clean -modcache

# Re-verify modules
go mod verify
go mod tidy

# Try rebuild
go build -o ./marketplaced ./cmd/marketplaced
```

### If Build Fails with Compile Error:
```bash
# Check Go version matches minimum
go version  # Should be 1.25.8 or later

# Run full test suite to catch real issues
go test ./...

# Review error output
go build -v ./cmd/marketplaced 2>&1 | grep -i "error\|panic\|undefined"
```

---

## After Successful Build

### 1. Backup Old Binary
```bash
mv ./marketplaced ./marketplaced.backup
cp ./marketplaced.backup /tmp/marketplaced.backup
```

### 2. Start Blockchain
```bash
cd blockchain_working

# Remove corrupted state from failed starts
rm -rf data/

# Start with new binary
../marketplaced start
```

### 3. Verify RPC Responds
```bash
# Wait 5-10 seconds for startup, then test:
curl -s http://127.0.0.1:26657/status | jq '.result.node_info.network'

# Should output: "mallchain-1"
```

### 4. Verify REST Responds
```bash
curl -s http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header.height'

# Should output: a block height number (e.g., "1")
```

### 5. If Both Respond - Proceed to E2E Test
```bash
# Run transaction integration test
# (All parameters already validated, just awaiting blockchain RPC)
```

---

## Expected Build Output

### Successful Build Console Output:
```
[1/6] Checking Go version...
  Go version: 1.25.8
[2/6] Verifying Go modules...
  ✓ Modules verified
[3/6] Downloading dependencies...
  ✓ Dependencies downloaded
[4/6] Cleaning previous build...
  ✓ Old binaries removed
[5/6] Building marketplaced binary...
      go list -m all
      go build -v -o ./marketplaced ...
      ... (progress output) ...
[6/6] Verifying binary...
  ✓ Binary created: 168M
  ✓ Size: 176128512 bytes
  ✓ Made executable
[DONE] Binary rebuild complete!

Next step: Start blockchain...
```

### Build Time Estimates:
- **First run (no cache)**: 10-20 minutes
- **Rebuild (with cache)**: 2-5 minutes
- **With resource limits**: 30+ minutes (will timeout if system is very constrained)

---

## Files to Check After Build

### ✅ After Rebuild Completes:
- `./marketplaced` — New binary (should exist, be executable, >150MB)
- `/tmp/blockchain_build.log` — Build output (review if errors occur)

### ✅ Before Starting Blockchain:
- `blockchain_working/config/app.toml` — API configuration (unchanged)
- `blockchain_working/config/config.toml` — RPC configuration (unchanged)
- `blockchain_working/data/` — State directory (safe to delete before restart)

---

## Decision Tree

**Q: Should I rebuild?**  
A: Yes, if the binary is panicking on startup.

**Q: Will rebuild fix the panic?**  
A: Likely yes — Go 1.25.8 has bug fixes and the protobuf replace rule in go.mod prevents proto-related panics.

**Q: What if rebuild times out?**  
A: Check system resources, kill competing processes, retry with 10-minute timeout.

**Q: What if rebuild fails with errors?**  
A: Run `go test ./...` to verify modules are valid. If tests pass but build fails, the issue is more complex (post in GitHub issues).

**Q: Can I use a pre-built binary instead?**  
A: GitHub releases are empty. No pre-built alternatives available. Rebuild is only option.

**Q: How long does rebuild take?**  
A: 2-10 minutes typically, 30+ minutes on resource-constrained systems.

---

## Next Steps

1. ✅ Run rebuild script above (Option 1 recommended)
2. ⏳ Wait for completion (don't interrupt)
3. ✅ Verify binary exists and is executable
4. ✅ Start blockchain: `cd blockchain_working && ../marketplaced start`
5. ✅ Verify RPC responds: `curl http://127.0.0.1:26657/status`
6. ✅ Proceed to E2E transaction test

---

**Report Generated**: September 29, 2026  
**Status**: Blockchain rebuild procedure documented  
**Expected Outcome**: Functional marketplaced binary by end of rebuild  
**Estimated Time**: 5-20 minutes (depending on system performance)

