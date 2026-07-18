#!/bin/bash
# Reset local chain data while preserving the canonical genesis.
# Safe to run at any time — does not modify genesis.json or keys.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${REPO_DIR}/blockchain_working"
BINARY="${REPO_DIR}/marketplaced"

echo "=== Mallchain: Reset Chain Data ==="

# Stop node if running
echo "Stopping node if running..."
pkill -f "marketplaced start" 2>/dev/null || true
sleep 1

# Build binary if missing
if [[ ! -x "$BINARY" ]]; then
    echo "Binary missing — building..."
    cd "$REPO_DIR"
    /usr/local/go/bin/go build -o marketplaced ./cmd/marketplaced
    echo "Binary built."
fi

# Wipe block/state data only — config and genesis are untouched
echo "Resetting chain data in ${HOME_DIR}/data ..."
"$BINARY" tendermint unsafe-reset-all --home="$HOME_DIR"

echo ""
echo "✅ Chain data reset. Genesis and keys are intact."
echo "   Start the full stack with: ./START_ALL.sh"
