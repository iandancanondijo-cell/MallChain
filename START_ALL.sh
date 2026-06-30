#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== MALLCHAIN STARTUP ==="
echo ""

# Check if marketplaced binary exists, build if not
if [[ ! -x "$REPO_DIR/marketplaced" ]]; then
    echo "Building blockchain binary..."
    cd "$REPO_DIR"
    go build -o marketplaced ./cmd/marketplaced
    echo "Binary built successfully"
fi

# Kill any existing processes gracefully
echo "Stopping any existing processes..."
killall -9 node npm pnpm vite marketplaced 2>/dev/null || true
sleep 2

# Check MongoDB is running
if ! pgrep -x mongod > /dev/null; then
    echo "⚠️  MongoDB not detected. Starting..."
    sudo systemctl start mongod 2>/dev/null || true
fi

# Check Redis is running
if ! pgrep -x redis-server > /dev/null && ! nc -z 127.0.0.1 6379 2>/dev/null; then
    echo "⚠️  Redis not detected. Background workers may be unavailable."
fi

# ============== BLOCKCHAIN FIRST ==============
echo "Starting Blockchain on RPC 26657 & API 1317..."
cd "$REPO_DIR"

# Ensure blockchain_working directory exists with initialized chain
if [[ ! -d "$REPO_DIR/blockchain_working/config" ]]; then
    echo "Initializing blockchain..."
    "$REPO_DIR/marketplaced" init mallchain --chain-id mallchain-1 > /tmp/blockchain-init.log 2>&1 || true
fi

"$REPO_DIR/marketplaced" start \
  --home="$REPO_DIR/blockchain_working" \
  --minimum-gas-prices="0.01stake" \
  --rpc.laddr=tcp://0.0.0.0:26657 \
  --api.enable \
  --api.address=tcp://0.0.0.0:1317 \
  > /tmp/blockchain.log 2>&1 &
BLOCKCHAIN_PID=$!

# Wait for blockchain RPC
BLOCKCHAIN_READY=0
for i in {1..20}; do
    if curl -sf http://localhost:26657/status > /dev/null 2>&1; then
        echo "✅ Blockchain RPC running (PID: $BLOCKCHAIN_PID)"
        BLOCKCHAIN_READY=1
        break
    fi
    sleep 1
done

if [[ $BLOCKCHAIN_READY -eq 0 ]]; then
    echo "❌ Blockchain failed to start. Check /tmp/blockchain.log"
    echo "Aborting startup sequence."
    exit 1
fi

# Wait for blockchain REST API
for i in {1..10}; do
    if curl -sf http://localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest > /dev/null 2>&1; then
        echo "✅ Blockchain REST API available"
        break
    fi
    sleep 1
done

# ============== BACKEND SECOND ==============
echo "Starting Backend on port 4000..."
cd "$REPO_DIR/backend"

npm ci --prefer-offline > /tmp/backend-install.log 2>&1 || true
npm start > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be healthy with retries
BACKEND_READY=0
for i in {1..15}; do
    if curl -sf http://localhost:4000/api/health > /dev/null 2>&1; then
        echo "✅ Backend running (PID: $BACKEND_PID)"
        BACKEND_READY=1
        break
    fi
    sleep 1
done

if [[ $BACKEND_READY -eq 0 ]]; then
    echo "❌ Backend failed to start. Check /tmp/backend.log"
    echo "Aborting startup sequence."
    exit 1
fi

# ============== FRONTEND THIRD ==============
echo "Starting Frontend on port 5173..."
cd "$REPO_DIR/frontend"
npm ci --prefer-offline > /tmp/frontend-install.log 2>&1 || true
npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 2

FRONTEND_READY=0
for i in {1..10}; do
    if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        echo "✅ Frontend running (PID: $FRONTEND_PID)"
        FRONTEND_READY=1
        break
    fi
    sleep 1
done

if [[ $FRONTEND_READY -eq 0 ]]; then
    echo "❌ Frontend failed to start. Check /tmp/frontend.log"
    echo "Aborting startup sequence."
    exit 1
fi

# Save PIDs for stop script
cat > /tmp/mallchain.pids << EOF
BACKEND_PID=$BACKEND_PID
BLOCKCHAIN_PID=$BLOCKCHAIN_PID
FRONTEND_PID=$FRONTEND_PID
EOF

echo ""
echo "=== SERVICES STARTED ==="
echo "Backend:    http://localhost:4000"
echo "Blockchain: http://localhost:26657 (RPC)"
echo "            http://localhost:1317 (REST API)"
echo "Frontend:   http://localhost:5173"
echo ""
echo "Health check: curl http://localhost:4000/api/health"
echo "Logs: /tmp/backend.log, /tmp/blockchain.log, /tmp/frontend.log"