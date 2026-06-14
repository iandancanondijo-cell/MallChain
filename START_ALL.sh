#!/bin/bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== MARKETPLACE STARTUP ==="
echo ""

# Kill any existing processes
killall -9 node npm vite marketplaced 2>/dev/null || true
sleep 2

# Start backend
echo "Starting Backend on port 4000..."
cd "$REPO_DIR/backend"
npm start > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

# Check backend
if curl -s http://localhost:4000/api/market/price 2>&1 | head -c 20 | grep -q "{{\|market_price\|Error"; then
  echo "✅ Backend running (PID: $BACKEND_PID)"
else
  echo "⚠️  Backend may still be starting..."
fi

# Start blockchain
echo "Starting Blockchain on RPC 26657 & API 1317..."
cd "$REPO_DIR"
"$REPO_DIR/marketplaced" start \
  --home="$REPO_DIR/blockchain_working" \
  --minimum-gas-prices="0.01stake" \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317 \
  > /tmp/blockchain.log 2>&1 &
BLOCKCHAIN_PID=$!
sleep 4

# Check blockchain
if curl -s http://localhost:26657/status 2>&1 | grep -q "sync_info"; then
  echo "✅ Blockchain RPC running (PID: $BLOCKCHAIN_PID)"
else
  echo "⚠️  Blockchain may still be starting..."
fi

# Start frontend
echo "Starting Frontend on port 5173..."
cd "$REPO_DIR/frontend"
npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 4

# Check frontend
if curl -s http://localhost:5173 2>&1 | head -c 50 | grep -q "doctype\|html"; then
  echo "✅ Frontend running (PID: $FRONTEND_PID)"
elif curl -s http://localhost:5174 2>&1 | head -c 50 | grep -q "doctype\|html"; then
  echo "✅ Frontend running on port 5174"
elif curl -s http://localhost:5175 2>&1 | head -c 50 | grep -q "doctype\|html"; then
  echo "✅ Frontend running on port 5175"
else
  echo "⚠️  Frontend may still be starting..."
fi

echo ""
echo "=== SERVICES STARTED ==="
echo "Backend:    http://localhost:4000"
echo "Blockchain: http://localhost:26657 (RPC)"
echo "            http://localhost:1317 (REST API)"
echo "Frontend:   http://localhost:5173+ (check port if needed)"
echo ""
echo "Check logs at /tmp/{backend,blockchain,frontend}.log"
