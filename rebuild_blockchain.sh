#!/bin/bash
# Blockchain Binary Rebuild Script
# Purpose: Rebuild marketplaced binary from source with extended timeout
# Usage: bash rebuild_blockchain.sh

set -e

echo "=== Blockchain Binary Rebuild Script ==="
echo "Start time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verify Go installation
echo -e "${YELLOW}[1/6] Checking Go version...${NC}"
if ! command -v go &> /dev/null; then
  echo -e "${RED}ERROR: Go not found. Install Go 1.25.8 or later.${NC}"
  exit 1
fi

GO_VERSION=$(go version | grep -oP 'go\d+\.\d+\.\d+' || go version)
echo -e "  ${GREEN}✓${NC} $GO_VERSION found"
echo ""

# Step 2: Change to repo directory
echo -e "${YELLOW}[2/6] Changing to repository...${NC}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
echo -e "  ${GREEN}✓${NC} Working directory: $(pwd)"
echo ""

# Step 3: Verify Go module dependencies
echo -e "${YELLOW}[3/6] Verifying Go modules...${NC}"
go mod verify > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Modules verified"
echo ""

# Step 4: Download Go module dependencies
echo -e "${YELLOW}[4/6] Downloading dependencies...${NC}"
echo "      (This may take 2-5 minutes on first run)"
go mod download
echo -e "  ${GREEN}✓${NC} Dependencies downloaded"
echo ""

# Step 5: Clean old binary
echo -e "${YELLOW}[5/6] Cleaning previous build...${NC}"
rm -f ./marketplaced /tmp/marketplaced
echo -e "  ${GREEN}✓${NC} Old binaries removed"
echo ""

# Step 6: Build blockchain binary
echo -e "${YELLOW}[6/6] Building marketplaced binary...${NC}"
echo "      This will take 3-10 minutes. DO NOT INTERRUPT."
echo "      Build output saved to: /tmp/blockchain_build.log"
echo ""

# Run build with 30-minute timeout and capture output
if timeout 1800 go build \
  -v \
  -o ./marketplaced \
  -ldflags="-X github.com/cosmos/cosmos-sdk/version.Name=marketplace" \
  ./cmd/marketplaced \
  2>&1 | tee /tmp/blockchain_build.log; then
  
  echo ""
  echo -e "${GREEN}[BUILD SUCCESSFUL]${NC}"
  
  # Verify binary exists and is executable
  if [ ! -f ./marketplaced ]; then
    echo -e "${RED}ERROR: Binary not found at ./marketplaced${NC}"
    exit 1
  fi
  
  if [ ! -x ./marketplaced ]; then
    chmod +x ./marketplaced
  fi
  
  # Show binary details
  BINARY_SIZE=$(stat -c%s "./marketplaced" 2>/dev/null || stat -f%z "./marketplaced" 2>/dev/null || du -h ./marketplaced | cut -f1)
  echo -e "  ${GREEN}✓${NC} Binary created"
  echo -e "  ${GREEN}✓${NC} Size: $BINARY_SIZE"
  echo -e "  ${GREEN}✓${NC} Executable: $(ls -lh ./marketplaced | awk '{print $1}')"
  echo ""
  
  echo -e "${GREEN}=== REBUILD COMPLETE ===${NC}"
  echo "End time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo ""
  echo "Next step: Start blockchain"
  echo ""
  echo "  cd blockchain_working"
  echo "  rm -rf data/  # Clean corrupted state"
  echo "  ../marketplaced start"
  echo ""
  echo "Then verify RPC:"
  echo "  curl http://127.0.0.1:26657/status | jq '.result.node_info.network'"
  echo "  # Should output: \"mallchain-1\""
  echo ""
  
else
  BUILD_EXIT=$?
  echo ""
  if [ $BUILD_EXIT -eq 124 ]; then
    echo -e "${RED}[BUILD TIMEOUT]${NC}"
    echo "Build timed out after 30 minutes."
    echo "System may be resource-constrained."
    echo ""
    echo "Troubleshooting:"
    echo "  • Check available memory: free -h"
    echo "  • Check disk space: df -h ."
    echo "  • Kill other builds: pkill -f 'go build'"
    echo "  • Retry: bash rebuild_blockchain.sh"
    echo ""
  else
    echo -e "${RED}[BUILD FAILED]${NC}"
    echo "Exit code: $BUILD_EXIT"
    echo "Full output saved to: /tmp/blockchain_build.log"
    echo ""
    echo "Troubleshooting:"
    echo "  • Review errors: tail -50 /tmp/blockchain_build.log"
    echo "  • Verify Go version: go version"
    echo "  • Check modules: go mod verify"
    echo "  • Try tidy: go mod tidy && bash rebuild_blockchain.sh"
    echo ""
  fi
  exit $BUILD_EXIT
fi
