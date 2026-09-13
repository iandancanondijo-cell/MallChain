#!/bin/bash
# Stop all Mallchain services cleanly.
set -euo pipefail

echo "=== MALLCHAIN SHUTDOWN ==="

# --- Graceful SIGTERM first ---
echo "Sending SIGTERM to services..."

pkill -TERM -f "marketplaced start" 2>/dev/null && echo "  Stopping blockchain..." || true
pkill -TERM -f "node src/index.js"  2>/dev/null && echo "  Stopping backend..."    || true
pkill -TERM -f "vite"               2>/dev/null && echo "  Stopping frontend..."   || true
# The backend needs a replica set (transactions require it), so it runs its
# own mongod on a dedicated port/dbpath (see START_ALL.sh) rather than the
# system package's plain instance — this script never stopped that one, so
# port 27018 stayed bound and the next START_ALL had to reuse a stale
# instance instead of starting fresh.
pkill -TERM -f "mongod.*27018"      2>/dev/null && echo "  Stopping MongoDB..."    || true

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
pkill -9 -f "mongod.*27018"      2>/dev/null || true

# --- Release ports ---
# 27018 = the dedicated replica-set mongod; 6379 = Redis (started manually
# via `redis-server --daemonize yes` in START_ALL.sh, not tracked by any of
# the pkill patterns above since it doesn't run under a project-specific
# command line).
for port in 4000 5173 5174 26657 26656 1317 9090 27018 6379; do
    fuser -k "${port}/tcp" 2>/dev/null && echo "  Released port ${port}" || true
done

# --- Clean up PID file ---
rm -f /tmp/mallchain.pids

echo ""
echo "✅ All Mallchain services stopped."
