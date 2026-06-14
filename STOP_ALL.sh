#!/bin/bash

set -euo pipefail

echo "Stopping Marketplace services..."

pkill -f "marketplaced start" 2>/dev/null || true
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "nodemon src/index.js" 2>/dev/null || true

sleep 1

fuser -k 4000/tcp 5173/tcp 5174/tcp 5175/tcp 5176/tcp 1317/tcp 26657/tcp 26656/tcp 9090/tcp 2>/dev/null || true

echo "All Marketplace services stopped."
