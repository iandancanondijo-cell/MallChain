#!/bin/bash
# Start all Mallchain services: blockchain → backend → frontend.
# The blockchain startup is self-healing: it validates genesis integrity
# and repairs it automatically if stale data is detected.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="${REPO_DIR}/marketplaced"
CHAIN_HOME="${REPO_DIR}/blockchain_working"
GO_BIN="${GO_BIN:-/usr/local/go/bin/go}"

echo "=== MALLCHAIN STARTUP ==="
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# STEP 0: Stop any running instances cleanly
# ──────────────────────────────────────────────────────────────────────────────
echo "Stopping any existing processes..."
pkill -TERM -f "marketplaced start" 2>/dev/null || true
pkill -TERM -f "node src/index.js"  2>/dev/null || true
pkill -TERM -f "vite"               2>/dev/null || true
pkill -TERM -f "npm start"          2>/dev/null || true
pkill -TERM -f "npm run dev"        2>/dev/null || true
sleep 3
pkill -9 -f "marketplaced start" 2>/dev/null || true
pkill -9 -f "node src/index.js"  2>/dev/null || true
pkill -9 -f "vite"               2>/dev/null || true
for port in 4000 5173 26657 26656 1317 9090; do
    fuser -k "${port}/tcp" 2>/dev/null || true
done
sleep 1

# ──────────────────────────────────────────────────────────────────────────────
# STEP 1: Build binary if missing
# ──────────────────────────────────────────────────────────────────────────────
if [[ ! -x "$BINARY" ]]; then
    echo "Building blockchain binary..."
    cd "$REPO_DIR"
    "$GO_BIN" build -o marketplaced ./cmd/marketplaced
    echo "✅ Binary built."
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 2: Validate genesis integrity — repair without touching wallets
# ──────────────────────────────────────────────────────────────────────────────
echo "Validating genesis..."

python3 "${REPO_DIR}/scripts/ensure_genesis.py" "${CHAIN_HOME}"

echo "✅ Genesis validated."

# ──────────────────────────────────────────────────────────────────────────────
# STEP 3: Check MongoDB
# ──────────────────────────────────────────────────────────────────────────────
if ! pgrep -x mongod > /dev/null; then
    echo "⚠️  MongoDB not running. Starting..."
    sudo systemctl start mongod 2>/dev/null || true
    sleep 2
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 4: Start blockchain
# ──────────────────────────────────────────────────────────────────────────────
echo "Starting blockchain (RPC :26657, REST :1317)..."
"$BINARY" start \
  --home="$CHAIN_HOME" \
  --minimum-gas-prices="0.01stake" \
  --rpc.laddr=tcp://0.0.0.0:26657 \
  --api.enable \
  --api.address=tcp://0.0.0.0:1317 \
  --grpc.enable=false \
  > /tmp/blockchain.log 2>&1 &
BLOCKCHAIN_PID=$!

BLOCKCHAIN_READY=0
for i in {1..30}; do
    if curl -sf http://localhost:26657/status > /dev/null 2>&1; then
        BLOCKCHAIN_READY=1
        break
    fi
    sleep 1
done

if [[ $BLOCKCHAIN_READY -eq 0 ]]; then
    echo "❌ Blockchain failed to start. Check /tmp/blockchain.log:"
    tail -20 /tmp/blockchain.log
    exit 1
fi
echo "✅ Blockchain running (PID: $BLOCKCHAIN_PID)"

# Wait for REST API
for i in {1..15}; do
    if curl -sf "http://localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest" > /dev/null 2>&1; then
        echo "✅ Blockchain REST API available"
        break
    fi
    sleep 1
done

# ──────────────────────────────────────────────────────────────────────────────
# STEP 5: Start backend
# ──────────────────────────────────────────────────────────────────────────────
echo "Starting backend (:4000)..."
cd "${REPO_DIR}/backend"
npm ci --prefer-offline > /tmp/backend-install.log 2>&1 || true
node src/index.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

BACKEND_READY=0
for i in {1..20}; do
    if curl -sf http://localhost:4000/api/health > /dev/null 2>&1; then
        BACKEND_READY=1
        break
    fi
    sleep 1
done

if [[ $BACKEND_READY -eq 0 ]]; then
    echo "❌ Backend failed to start. Check /tmp/backend.log:"
    tail -20 /tmp/backend.log
    exit 1
fi
echo "✅ Backend running (PID: $BACKEND_PID)"

# ──────────────────────────────────────────────────────────────────────────────
# STEP 6: Start frontend
# ──────────────────────────────────────────────────────────────────────────────
echo "Starting frontend (:5173)..."
cd "${REPO_DIR}/frontend"
npm ci --prefer-offline > /tmp/frontend-install.log 2>&1 || true
npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

FRONTEND_READY=0
for i in {1..20}; do
    if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        FRONTEND_READY=1
        break
    fi
    sleep 1
done

if [[ $FRONTEND_READY -eq 0 ]]; then
    echo "❌ Frontend failed to start. Check /tmp/frontend.log:"
    tail -20 /tmp/frontend.log
    exit 1
fi
echo "✅ Frontend running (PID: $FRONTEND_PID)"

# ──────────────────────────────────────────────────────────────────────────────
# STEP 7: Save PIDs
# ──────────────────────────────────────────────────────────────────────────────
cat > /tmp/mallchain.pids << PIDS
BLOCKCHAIN_PID=$BLOCKCHAIN_PID
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
PIDS

echo ""
echo "=== ALL SERVICES RUNNING ==="
echo "  Frontend:       http://localhost:5173"
echo "  Backend API:    http://localhost:4000"
echo "  Blockchain RPC: http://localhost:26657"
echo "  Blockchain REST:http://localhost:1317"
echo ""
echo "  Health: curl http://localhost:4000/api/health"
echo "  Logs:   /tmp/blockchain.log  /tmp/backend.log  /tmp/frontend.log"
echo ""
echo "  Stop:   ./STOP_ALL.sh"
