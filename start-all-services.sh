#!/bin/bash
# Mallchain Development Stack Startup Script
# Two jobs, in this order:
#   1. MongoDB must use PERSISTENT storage, never /tmp (a tmpfs dbpath wipes
#      every account on a power outage — see docs and the project notes).
#   2. The services must come from the CURRENT checkout, not an old snapshot.
#
# The second point is why this file changed. Steps 3 and 4 used to hardcode
# /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain for both the
# backend and the chain, which is the 2026-10 snapshot tree. Running this
# script after a reboot therefore served an API whose branch does not contain
# the routes the frontend calls — endpoints answering `Cannot GET /api/...`
# right after they had been built and tested green. scripts/health-guard.sh hit
# the same trap and already solved it with the CHAIN_ROOT / SERVICES_ROOT split
# below; this script now follows the same convention so the two cannot disagree
# about which tree is live.
#
#   SERVICES_ROOT — code: backend (:4000), frontend (:5173). Tracks the
#                   worktree the current work is in. Override if it moves.
#   CHAIN_ROOT    — data: build/marketplaced and blockchain_working/. This is
#                   the validator's on-disk state; it stays exactly where it
#                   is. Starting a second marketplaced against the same home
#                   wedges the chain, so this must never be repointed at
#                   SERVICES_ROOT unless that tree also has the binary and the
#                   state directory.
set -e

SERVICES_ROOT=${SERVICES_ROOT:-/home/elle_bryson/Documents/mallchain-main-56caea3e}
CHAIN_ROOT=${CHAIN_ROOT:-/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain}
MONGO_DBPATH=${MONGO_DBPATH:-/home/elle_bryson/mongodb-data}

echo "Starting Mallchain development stack..."
echo "  code  : $SERVICES_ROOT"
echo "  chain : $CHAIN_ROOT"

# 1. Start MongoDB with persistent storage (NOT /tmp)
echo "Starting MongoDB replica set on port 27020 (persistent storage)..."
if ! pgrep -f "mongod.*27020" > /dev/null; then
    mkdir -p "$MONGO_DBPATH"
    mongod --replSet mallchain --port 27020 \
        --dbpath "$MONGO_DBPATH" \
        --logpath /tmp/mongo-rs.log \
        --bind_ip 127.0.0.1 \
        --fork

    # Initialize replica set if needed
    sleep 3
    mongosh --port 27020 --eval "try { rs.status() } catch(e) { rs.initiate() }" --quiet
    echo "✓ MongoDB started"
else
    echo "✓ MongoDB already running"
fi

# 2. Start Redis
echo "Starting Redis..."
if ! redis-cli ping > /dev/null 2>&1; then
    redis-server --daemonize yes --logfile /tmp/redis.log
    echo "✓ Redis started"
else
    echo "✓ Redis already running"
fi

# 3. Start Backend
echo "Starting backend on port 4000..."
if ! pgrep -f "node src/index.js" > /dev/null; then
    cd "$SERVICES_ROOT/backend"
    node src/index.js > /tmp/backend.log 2>&1 &
    echo "✓ Backend started (PID: $!)"
else
    echo "✓ Backend already running"
fi

# 4. Start Blockchain
echo "Starting blockchain on port 1317..."
if ! pgrep -f "marketplaced start" > /dev/null; then
    "$CHAIN_ROOT/build/marketplaced" start \
        --home "$CHAIN_ROOT/blockchain_working" \
        --minimum-gas-prices "0.01stake" \
        > /tmp/chain.log 2>&1 &
    echo "✓ Blockchain started (PID: $!)"
else
    echo "✓ Blockchain already running"
fi

# 5. Verify the workers actually came up.
# Background workers (sweeps, notification fan-out, reconciliation) connect to
# Redis at start-up. When Redis was not yet listening, the backend silently
# booted without them — the API answers fine and every scheduled job is dead
# until the next restart. Post-reboot reports kept hitting this, so the marker
# line is checked here instead of left to chance.
echo "Checking background workers..."
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    grep -q "Background workers started" /tmp/backend.log 2>/dev/null && break
    sleep 2
done
if grep -q "Background workers started" /tmp/backend.log 2>/dev/null; then
    echo "✓ Background workers active"
else
    echo "✗ 'Background workers started' not in /tmp/backend.log."
    echo "  Usually Redis was not ready when the backend booted. Restart the"
    echo "  backend (kill the 'node src/index.js' process, re-run this script)"
    echo "  now that redis-cli ping answers."
fi

echo ""
echo "All services started:"
echo "  Backend:    http://localhost:4000   ($SERVICES_ROOT/backend)"
echo "  Blockchain: http://localhost:1317   ($CHAIN_ROOT)"
echo "  MongoDB:    localhost:27020 (persistent, $MONGO_DBPATH)"
echo "  Redis:      localhost:6379"
echo ""
echo "Frontend dev server is not started here — scripts/health-guard.sh owns it"
echo "(it also detects an API running from a stale checkout and repairs it)."
echo "Manually: cd $SERVICES_ROOT/mallchain-os-v14 && npm run dev"
