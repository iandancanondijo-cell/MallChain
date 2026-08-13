#!/bin/bash
# Stop all Mallchain services cleanly.
set -euo pipefail

echo "=== MALLCHAIN SHUTDOWN ==="

# --- Graceful SIGTERM first ---
echo "Sending SIGTERM to services..."

pkill -TERM -f "marketplaced start" 2>/dev/null && echo "  Stopping blockchain..." || true
pkill -TERM -f "node src/index.js"  2>/dev/null && echo "  Stopping backend..."    || true
pkill -TERM -f "vite"               2>/dev/null && echo "  Stopping frontend..."   || true

# Also handle npm-wrapped processes in mallchain-frontend directory
pkill -TERM -f "npm start"          2>/dev/null || true
pkill -TERM -f "npm run dev"        2>/dev/null || true

# Give processes up to 8 seconds to exit cleanly
sleep 8

# --- Force-kill anything still alive ---
pkill -9 -f "marketplaced start" 2>/dev/null || true
pkill -9 -f "node src/index.js"  2>/dev/null || true
pkill -9 -f "vite"               2>/dev/null || true
pkill -9 -f "npm start"          2>/dev/null || true
pkill -9 -f "npm run dev"        2>/dev/null || true

# --- Release ports ---
for port in 4000 5173 5174 26657 26656 1317 9090; do
    fuser -k "${port}/tcp" 2>/dev/null && echo "  Released port ${port}" || true
done

# --- Clean up PID file ---
rm -f /tmp/mallchain.pids

echo ""
echo "✅ All Mallchain services stopped."
