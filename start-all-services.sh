#!/bin/bash
# Mallchain Development Stack Startup Script
# This ensures MongoDB uses PERSISTENT storage, not /tmp

set -e

echo "Starting Mallchain development stack..."

# 1. Start MongoDB with persistent storage (NOT /tmp)
echo "Starting MongoDB replica set on port 27020 (persistent storage)..."
if ! pgrep -f "mongod.*27020" > /dev/null; then
    mkdir -p /home/elle_bryson/mongodb-data
    mongod --replSet mallchain --port 27020 \
        --dbpath /home/elle_bryson/mongodb-data \
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
    cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend
    node src/index.js > /tmp/backend.log 2>&1 &
    echo "✓ Backend started (PID: $!)"
else
    echo "✓ Backend already running"
fi

# 4. Start Blockchain
echo "Starting blockchain on port 1317..."
if ! pgrep -f "marketplaced start" > /dev/null; then
    /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/build/marketplaced start \
        --home /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/blockchain_working \
        --minimum-gas-prices "0.01stake" \
        > /tmp/chain.log 2>&1 &
    echo "✓ Blockchain started (PID: $!)"
else
    echo "✓ Blockchain already running"
fi

echo ""
echo "All services started successfully!"
echo "  Backend:    http://localhost:4000"
echo "  Blockchain: http://localhost:1317"
echo "  MongoDB:    localhost:27020 (persistent)"
echo "  Redis:      localhost:6379"
