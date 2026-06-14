#!/bin/bash
# start_blockchain.sh - Blockchain startup with proper validator setup

set -e

MARKETPLACE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BLOCKCHAIN_HOME="${MARKETPLACE_DIR}/blockchain_working"
MARKETPLACED_BIN="${MARKETPLACE_DIR}/marketplaced"

echo "🔷 TMPChain Marketplace Blockchain Startup"
echo "=========================================="

# Initialize blockchain directory
if [ ! -d "$BLOCKCHAIN_HOME/config" ]; then
  echo "📁 Setting up blockchain working directory..."
  mkdir -p "$BLOCKCHAIN_HOME"/{config,data}
  
  # Copy from localtest (known working genesis structure)
  if [ -f "${MARKETPLACE_DIR}/localtest/config/genesis.json" ]; then
    echo "📋 Copying genesis from localtest..."
    cp "${MARKETPLACE_DIR}/localtest/config/genesis.json" "$BLOCKCHAIN_HOME/config/genesis.json"
  else
    echo "❌ No genesis source found"
    exit 1
  fi
  
  # Generate fresh validator keys
  echo "🔑 Generating validator and node keys..."
  $MARKETPLACED_BIN init validator1 --home="$BLOCKCHAIN_HOME" 2>&1 | grep -i "key\|seed\|mnemonic" || true
  
  echo "✅ Blockchain initialized"
else
  echo "✅ Blockchain directory already initialized"
  
  # Validate genesis supply if it exists
  if [ -f "$BLOCKCHAIN_HOME/config/genesis.json" ]; then
    echo "🔧 Validating genesis supply..."
    node "${MARKETPLACE_DIR}/scripts/fix_genesis_supply.js" "$BLOCKCHAIN_HOME/config/genesis.json" || true
  fi
fi

# Ensure validator state exists
if [ ! -f "$BLOCKCHAIN_HOME/data/priv_validator_state.json" ]; then
  mkdir -p "$BLOCKCHAIN_HOME/data"
  cat > "$BLOCKCHAIN_HOME/data/priv_validator_state.json" << 'STATE_EOF'
{
  "height": "0",
  "round": 0,
  "step": 0
}
STATE_EOF
fi

echo ""
echo "🚀 Starting blockchain on port 1317..."
echo "    Home: $BLOCKCHAIN_HOME"
echo "    Genesis: $BLOCKCHAIN_HOME/config/genesis.json"
echo ""
echo "Press Ctrl+C to stop"
echo ""

$MARKETPLACED_BIN start \
  --home="$BLOCKCHAIN_HOME" \
  --minimum-gas-prices="0.01umal" \
  --rpc.laddr="tcp://127.0.0.1:26657" \
  --api.enable \
  --api.address="tcp://localhost:1317"

