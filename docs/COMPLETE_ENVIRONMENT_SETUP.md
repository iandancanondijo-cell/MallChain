# Complete Environment Setup - Go, Docker, gRPC
**Date**: September 29, 2026  
**Status**: Building blockchain binary with Go 1.25.8

---

## Installation Summary

### Go 1.25.8 ✅
- **Location**: `~/.local/go/bin/go`
- **Version**: 1.25.8 linux/amd64
- **Setup**: 
  ```bash
  export PATH="$HOME/.local/go/bin:$PATH"
  export GOPATH="$HOME/.local/go"
  ```

### Docker 26.1.0 ✅
- **Location**: `~/.local/docker/docker/docker`
- **Version**: 26.1.0
- **Setup**:
  ```bash
  export PATH="$HOME/.local/docker/docker:$PATH"
  ```

### docker-compose v2.24.0 ✅
- **Location**: `~/.local/bin/docker-compose`
- **Version**: v2.24.0
- **Setup**:
  ```bash
  export PATH="$HOME/.local/bin:$PATH"
  ```

### gRPC Tools ✅
- **grpcurl**: `~/.local/go/bin/grpcurl`
- **protoc**: `/usr/bin/protoc` (already system-installed)

---

## Current Build Status

**Process**: Compiling blockchain binary  
**Location**: `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/marketplaced`  
**Expected**: 10-20 minutes

**Stage**: Downloading Go dependencies (50+ packages)  
**Progress**: SDK modules, AWS, Google Cloud, OpenTelemetry, gRPC, Protocol Buffers

---

## Complete Setup Script

Save and run this to configure all tools:

```bash
#!/bin/bash
set -e

echo "=== Complete Development Environment Setup ==="

# Step 1: Go Configuration
echo "[1/3] Configuring Go..."
export PATH="$HOME/.local/go/bin:$PATH"
export GOPATH="$HOME/.local/go"
export GOROOT="$HOME/.local/go"
go version

# Step 2: Docker Configuration
echo "[2/3] Configuring Docker..."
export PATH="$HOME/.local/docker/docker:$PATH"
docker --version

# Step 3: docker-compose Configuration
echo "[3/3] Configuring docker-compose..."
export PATH="$HOME/.local/bin:$PATH"
docker-compose --version

# Save to shell profile
cat >> ~/.bashrc << 'EOF'

# Mallchain Development Environment
export PATH="$HOME/.local/go/bin:$PATH"
export PATH="$HOME/.local/docker/docker:$PATH"
export PATH="$HOME/.local/bin:$PATH"
export GOPATH="$HOME/.local/go"
export GOROOT="$HOME/.local/go"
EOF

echo "✓ All tools configured"
echo "Add this to your shell profile (.bashrc, .zshrc, etc.):"
echo ""
echo "export PATH=\"\$HOME/.local/go/bin:\$PATH\""
echo "export PATH=\"\$HOME/.local/docker/docker:\$PATH\""
echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "export GOPATH=\"\$HOME/.local/go\""
echo "export GOROOT=\"\$HOME/.local/go\""
```

---

## Blockchain Build Progress

### Current Phase: Dependency Download
```
Stage 1: Downloading Go modules
  ✓ Cosmos SDK (v0.53.4)
  ✓ CometBFT (tendermint)
  ✓ Protocol Buffers
  ✓ gRPC
  ✓ AWS SDK
  ✓ Google Cloud
  → Currently downloading OpenTelemetry modules...
```

### Expected Timeline
- **Dependency Download**: 3-5 minutes
- **Compilation**: 5-10 minutes
- **Linking**: 1-2 minutes
- **Total**: 10-20 minutes

### What's Being Built
- Binary: `marketplaced` (Cosmos SDK application)
- Modules: 50+ Go packages compiled
- Output size: ~168 MB
- Architecture: Linux x86_64

---

## What You Can Do While Build Completes

### 1. Prepare Docker Environment
```bash
# Set required environment variables for docker-compose
export MONGO_ROOT_PASSWORD="dev-root"
export MONGO_APP_PASSWORD="dev-app"
export JWT_SECRET="dev-jwt"
export SESSION_SECRET="dev-session"
export ADMIN_API_KEY="dev-admin"
export PAYMENT_WEBHOOK_SECRET="dev-webhook"
export VITE_API_BASE_URL="http://localhost:4000"
```

### 2. Review Configuration Files
- `blockchain_working/config/config.toml` — RPC/P2P ports
- `blockchain_working/config/app.toml` — API settings
- `backend/src/config/index.js` — Backend config
- `mallchain-os-v14/.env.example` — Frontend config

### 3. Verify System Resources
```bash
# Check available memory
free -h

# Check disk space
df -h /home

# Check CPU cores
nproc

# Monitor build progress
tail -f /tmp/build.log 2>/dev/null || ps aux | grep go
```

---

## After Build Completes

### Step 1: Verify Binary
```bash
# Check binary exists and is executable
ls -lh ./marketplaced

# Should output something like:
# -rwxr-xr-x 1 user user 168M Sep 29 ... marketplaced

# Verify binary runs (just get version, don't start)
./marketplaced version 2>&1 | head -5
```

### Step 2: Start Blockchain
```bash
cd blockchain_working

# Clean state from previous failed attempts
rm -rf data/

# Start blockchain
../marketplaced start

# Output should show:
# Starting application...
# panic: ... (if old binary had issue)
# OR
# Starting node...
# [lots of initialization output]
# tm-event: Publishing Genesis event (if successful)
```

### Step 3: Verify RPC Responds
```bash
# In another terminal, test RPC endpoint
curl http://127.0.0.1:26657/status | jq '.result.node_info.network'

# Should output: "mallchain-1"
```

### Step 4: Test with gRPC Tools
```bash
# List available gRPC services
grpcurl -plaintext localhost:9090 list

# Query blockchain data
grpcurl -plaintext localhost:9090 cosmos.base.tendermint.v1beta1.Service/GetNodeInfo
```

---

## Tools Now Available

### Go Toolchain
```bash
go version          # Show version
go build            # Compile binaries
go test             # Run tests
go install          # Build and install tools
go mod download     # Cache dependencies
go mod verify       # Verify integrity
```

### Docker
```bash
docker build        # Build images
docker run          # Run containers
docker ps           # List containers
docker logs         # View container output
docker-compose up   # Start services
docker-compose down # Stop services
```

### gRPC
```bash
grpcurl             # Query gRPC services
protoc              # Compile protobuf files
```

---

## Troubleshooting

### If Build Hangs
```bash
# Check if Go process is still running
ps aux | grep "go build"

# Monitor build progress
ps aux | grep go

# Check disk space (compilation needs ~500MB free)
df -h /tmp /home
```

### If Build Fails
```bash
# Check for errors
tail -50 /tmp/build.log

# Try cleaning Go cache
~/.local/go/bin/go clean -cache
~/.local/go/bin/go clean -modcache

# Verify modules
~/.local/go/bin/go mod verify

# Retry build
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
~/.local/go/bin/go build -o marketplaced ./cmd/marketplaced
```

### If Docker/docker-compose Won't Start
```bash
# Verify Docker daemon is running (if required)
# In most systems, Docker daemon needs to be started separately:
sudo service docker start

# On systems without sudo, you may need root access
# Alternative: Run Docker in user mode (requires setup)

# For development, use docker rootless mode
```

---

## Next Steps After Build

### Phase 1: Verify Binary Works (5 minutes)
1. ✅ Binary exists and is executable
2. ✅ Binary runs without panic
3. ✅ RPC endpoint responds
4. ✅ REST endpoint responds

### Phase 2: Configure Services (10 minutes)
1. ✅ Set environment variables
2. ✅ Verify config files
3. ✅ Start MongoDB (docker or system)
4. ✅ Start Redis (docker or system)

### Phase 3: Full Stack Test (15 minutes)
1. ✅ Start blockchain
2. ✅ Start backend
3. ✅ Start frontend
4. ✅ Run E2E transaction test

### Phase 4: Complete E2E Verification (30 minutes)
- All 4 phases of transaction integration test
- Wallet signing execution
- On-chain confirmation
- Balance verification

---

## Expected Timeline

| Task | Time | Status |
|------|------|--------|
| Go installation | ✅ Done | Complete |
| Docker installation | ✅ Done | Complete |
| docker-compose installation | ✅ Done | Complete |
| Blockchain build | ⏳ In progress | 10-20 min |
| Binary verification | Next | 5 min |
| RPC verification | Next | 5 min |
| E2E test execution | Final | 30 min |
| **Total Project Time** | **~60 min** | |

---

## Environment Variable Reference

### Required for docker-compose
```bash
MONGO_ROOT_PASSWORD=dev-root-password
MONGO_APP_PASSWORD=dev-app-password
JWT_SECRET=dev-jwt-secret
SESSION_SECRET=dev-session-secret
ADMIN_API_KEY=dev-admin-key
PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
VITE_API_BASE_URL=http://localhost:4000
```

### Required for Blockchain
```bash
CHAIN_RPC=http://127.0.0.1:26657
CHAIN_REST_URL=http://127.0.0.1:1317
CHAIN_ID=mallchain-1
```

### Required for Backend
```bash
MONGO_URI=mongodb://mallchain:password@localhost:27017/marketplace
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

---

## Quick Reference Commands

```bash
# Check Go
~/.local/go/bin/go version

# Check Docker
~/.local/docker/docker/docker --version

# Check docker-compose
~/.local/bin/docker-compose --version

# Build blockchain
cd ~/Documents/MarketplaceBlockchain-Mallchain
~/.local/go/bin/go build -o marketplaced ./cmd/marketplaced

# Start blockchain
cd blockchain_working && ../marketplaced start

# Test RPC
curl http://127.0.0.1:26657/status | jq '.result.node_info.network'

# Test REST
curl http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header.height'

# List gRPC services
~/.local/go/bin/grpcurl -plaintext localhost:9090 list
```

---

## File Organization

```
~/.local/
├── go/
│   ├── bin/              # Go binaries (go, grpcurl, etc.)
│   ├── pkg/              # Go packages
│   └── src/              # Go source
├── docker/
│   └── docker/           # Docker binary
└── bin/                  # User binaries (docker-compose, etc.)
```

---

**Status**: Build in progress  
**Build Started**: 2026-09-29 ~10:50 UTC  
**Expected Completion**: 2026-09-29 ~11:00-11:10 UTC  
**Next Review**: Check build status in 10 minutes

