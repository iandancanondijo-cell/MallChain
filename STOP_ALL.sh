#!/bin/bash

set -euo pipefail

echo "=== MALLCHAIN SHUTDOWN ==="

# Read PIDs if available
if [[ -f /tmp/mallchain.pids ]]; then
    source /tmp/mallchain.pids
fi

# Gracefully stop services
if [[ -n "${BACKEND_PID:-}" ]]; then
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi
fi

if [[ -n "${BLOCKCHAIN_PID:-}" ]]; then
    if kill -0 "$BLOCKCHAIN_PID" 2>/dev/null; then
        echo "Stopping blockchain (PID: $BLOCKCHAIN_PID)..."
        kill -TERM "$BLOCKCHAIN_PID" 2>/dev/null || true
    fi
fi

if [[ -n "${FRONTEND_PID:-}" ]]; then
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi
fi

# Kill any remaining processes
echo "Cleaning up any remaining processes..."
pkill -f "npm start" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "marketplaced" 2>/dev/null || true

# Clean up PID file
rm -f /tmp/mallchain.pids

# Release ports
for port in 4000 5173 26657 1317; do
    if fuser -k "$port/tcp" 2>/dev/null; then
        echo "Released port $port"
    fi
done

echo "✅ Mallchain stopped"