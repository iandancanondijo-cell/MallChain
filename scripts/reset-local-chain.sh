#!/bin/bash
# Reset local chain data after genesis / chain-id changes.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${REPO_DIR}/blockchain_working"

echo "Stopping node if running..."
pkill -f "marketplaced start" 2>/dev/null || true
sleep 1

echo "Resetting chain data in ${HOME_DIR}..."
"${REPO_DIR}/marketplaced" tendermint unsafe-reset-all --home="${HOME_DIR}"

echo "Done. Start the chain with ./START_ALL.sh or readme.md commands."
