#!/bin/bash
# Comprehensive Local Deployment Verification Script
# Tests every service, port, health check, and inter-service connectivity
# Produces structured evidence, not just status output

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp/mallchain-verification"
EVIDENCE_FILE="${LOG_DIR}/verification-evidence.txt"
ERRORS_FILE="${LOG_DIR}/verification-errors.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

mkdir -p "$LOG_DIR"
> "$EVIDENCE_FILE"
> "$ERRORS_FILE"

log_evidence() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$EVIDENCE_FILE"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$ERRORS_FILE"
    echo -e "${RED}ERROR: $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
    log_evidence "✓ $1"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    log_evidence "⚠ $1"
}

# ============================================================================
# PHASE 1: PRE-EXECUTION CHECKS
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ MALLCHAIN LOCAL DEPLOYMENT VERIFICATION                                   ║"
echo "║ Comprehensive evidence collection, no fallback masking                     ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 1: PRE-EXECUTION CHECKS ==="
log_evidence "Repository directory: $REPO_DIR"

# Check that required files exist
echo "Checking for required files..."
if [[ ! -f "$REPO_DIR/START_ALL.sh" ]]; then
    log_error "START_ALL.sh not found"
    exit 1
fi
log_success "START_ALL.sh exists"

if [[ ! -f "$REPO_DIR/STOP_ALL.sh" ]]; then
    log_error "STOP_ALL.sh not found"
    exit 1
fi
log_success "STOP_ALL.sh exists"

# Check if services are already running
echo ""
echo "Checking for running services..."
if pgrep -f "marketplaced start" > /dev/null; then
    log_warning "Blockchain already running, will be stopped first"
fi
if pgrep -f "node src/index.js" > /dev/null; then
    log_warning "Backend already running, will be stopped first"
fi
if pgrep -f "vite" > /dev/null; then
    log_warning "Frontend already running, will be stopped first"
fi

# Check for Go installation
echo ""
echo "Checking Go installation..."
if ! command -v /usr/local/go/bin/go &> /dev/null; then
    log_warning "Go not found at /usr/local/go/bin/go"
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed. Required to build blockchain binary."
        exit 1
    fi
    log_success "Go found in PATH"
else
    log_success "Go found at /usr/local/go/bin/go"
fi

# Check for Python3 (needed for genesis validation)
if ! command -v python3 &> /dev/null; then
    log_error "python3 not found. Required for genesis validation."
    exit 1
fi
log_success "Python3 found"

# Check for required tools
for tool in nc mongosh curl jq; do
    if ! command -v "$tool" &> /dev/null; then
        log_warning "$tool not found (may be needed for connectivity tests)"
    else
        log_success "$tool found"
    fi
done

# ============================================================================
# PHASE 2: START SERVICES
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 2: STARTING SERVICES                                                ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 2: STARTING SERVICES ==="
log_evidence "Execution start time: $(date +'%Y-%m-%d %H:%M:%S')"

cd "$REPO_DIR"
echo "Executing START_ALL.sh..."
if bash START_ALL.sh > "$LOG_DIR/startup.log" 2>&1; then
    log_success "START_ALL.sh completed successfully"
else
    log_error "START_ALL.sh failed with exit code $?"
    echo "Startup log:"
    cat "$LOG_DIR/startup.log" | tail -50
fi

log_evidence "Startup log captured: $LOG_DIR/startup.log"

# Wait for services to stabilize
echo ""
echo "Waiting for services to stabilize (15 seconds)..."
sleep 15

# ============================================================================
# PHASE 3: SERVICE STARTUP VERIFICATION
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 3: SERVICE STARTUP VERIFICATION                                     ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 3: SERVICE STARTUP VERIFICATION ==="

# Check blockchain service
echo "Verifying blockchain service..."
if pgrep -f "marketplaced start" > /dev/null; then
    BLOCKCHAIN_PID=$(pgrep -f "marketplaced start" | head -1)
    log_success "Blockchain process running (PID: $BLOCKCHAIN_PID)"
else
    log_error "Blockchain process NOT running"
fi

# Check backend service
echo "Verifying backend service..."
if pgrep -f "node src/index.js" > /dev/null; then
    BACKEND_PID=$(pgrep -f "node src/index.js" | head -1)
    log_success "Backend process running (PID: $BACKEND_PID)"
else
    log_error "Backend process NOT running"
fi

# Check frontend service
echo "Verifying frontend service..."
if pgrep -f "vite" > /dev/null; then
    FRONTEND_PID=$(pgrep -f "vite" | head -1)
    log_success "Frontend process running (PID: $FRONTEND_PID)"
else
    log_warning "Frontend process NOT running (may still be starting)"
fi

# ============================================================================
# PHASE 4: PORT LISTENING VERIFICATION
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 4: PORT LISTENING VERIFICATION                                      ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 4: PORT LISTENING VERIFICATION ==="

declare -A PORTS=(
    ["26657"]="Blockchain RPC"
    ["26656"]="Blockchain P2P"
    ["1317"]="Blockchain REST"
    ["27017"]="MongoDB"
    ["6379"]="Redis"
    ["4000"]="Backend API"
    ["5173"]="Frontend"
)

for port in "${!PORTS[@]}"; do
    service_name="${PORTS[$port]}"
    echo "Checking port $port ($service_name)..."
    
    if nc -z localhost "$port" 2>/dev/null; then
        log_success "Port $port ($service_name) is listening"
    else
        log_error "Port $port ($service_name) is NOT listening"
    fi
done

# ============================================================================
# PHASE 5: HEALTH CHECKS
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 5: HEALTH CHECKS                                                    ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 5: HEALTH CHECKS ==="

# Blockchain RPC status
echo "Checking blockchain RPC health..."
if BLOCKCHAIN_STATUS=$(curl -s http://localhost:26657/status 2>/dev/null); then
    if echo "$BLOCKCHAIN_STATUS" | jq . > /dev/null 2>&1; then
        BLOCK_HEIGHT=$(echo "$BLOCKCHAIN_STATUS" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "unknown")
        CATCHING_UP=$(echo "$BLOCKCHAIN_STATUS" | jq -r '.result.sync_info.catching_up' 2>/dev/null || echo "unknown")
        log_success "Blockchain RPC responding (height: $BLOCK_HEIGHT, catching_up: $CATCHING_UP)"
        log_evidence "Blockchain status: $BLOCKCHAIN_STATUS" | head -c 500
    else
        log_error "Blockchain RPC returned invalid JSON"
    fi
else
    log_error "Blockchain RPC health check failed"
fi

# Blockchain REST API
echo "Checking blockchain REST API health..."
if REST_RESPONSE=$(curl -s http://localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest 2>/dev/null); then
    if echo "$REST_RESPONSE" | jq . > /dev/null 2>&1; then
        REST_HEIGHT=$(echo "$REST_RESPONSE" | jq -r '.block.header.height' 2>/dev/null || echo "unknown")
        log_success "Blockchain REST API responding (height: $REST_HEIGHT)"
    else
        log_error "Blockchain REST API returned invalid JSON"
    fi
else
    log_error "Blockchain REST API health check failed"
fi

# Backend API health
echo "Checking backend API health..."
if BACKEND_HEALTH=$(curl -s http://localhost:4000/api/health 2>/dev/null); then
    if echo "$BACKEND_HEALTH" | jq . > /dev/null 2>&1; then
        log_success "Backend API responding with health endpoint"
        log_evidence "Backend health: $BACKEND_HEALTH"
    else
        log_error "Backend API returned invalid JSON"
    fi
else
    log_error "Backend API health check failed"
fi

# Frontend HTTP
echo "Checking frontend HTTP..."
if FRONTEND_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null); then
    if [[ "$FRONTEND_HTTP" == "200" ]]; then
        log_success "Frontend HTTP responding (200)"
    else
        log_warning "Frontend HTTP responded with status $FRONTEND_HTTP"
    fi
else
    log_error "Frontend HTTP check failed"
fi

# MongoDB ping
echo "Checking MongoDB..."
if MONGO_PING=$(mongosh --port 27017 --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null); then
    if [[ "$MONGO_PING" == "1" ]]; then
        log_success "MongoDB responding to ping"
    else
        log_error "MongoDB ping failed (response: $MONGO_PING)"
    fi
else
    log_warning "MongoDB connection failed (may not be required)"
fi

# Redis ping
echo "Checking Redis..."
if REDIS_PING=$(redis-cli ping 2>/dev/null); then
    if [[ "$REDIS_PING" == "PONG" ]]; then
        log_success "Redis responding (PONG)"
    else
        log_error "Redis responded: $REDIS_PING"
    fi
else
    log_warning "Redis connection failed (may not be required)"
fi

# ============================================================================
# PHASE 6: BACKEND DEPENDENCY VERIFICATION
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 6: BACKEND DEPENDENCY VERIFICATION                                  ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 6: BACKEND DEPENDENCY VERIFICATION ==="

# Backend → Blockchain connectivity
echo "Checking backend → blockchain connectivity..."
if curl -s http://localhost:4000/api/blockchain/status 2>/dev/null | jq . > /dev/null 2>&1; then
    log_success "Backend can query blockchain"
else
    log_warning "Backend blockchain query may have failed"
fi

# ============================================================================
# PHASE 7: FRONTEND-BACKEND CONNECTIVITY
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 7: FRONTEND-BACKEND CONNECTIVITY                                    ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 7: FRONTEND-BACKEND CONNECTIVITY ==="

# Get frontend HTML and check for API references
echo "Checking frontend HTML..."
if FRONTEND_HTML=$(curl -s http://localhost:5173/ 2>/dev/null); then
    if echo "$FRONTEND_HTML" | grep -q "localhost\|127.0.0.1\|api"; then
        log_success "Frontend HTML contains API references"
    else
        log_warning "Frontend HTML may not contain API references"
    fi
else
    log_error "Could not fetch frontend HTML"
fi

# ============================================================================
# PHASE 8: ERROR LOG COLLECTION
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 8: ERROR LOG COLLECTION                                             ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 8: ERROR LOG COLLECTION ==="

# Collect startup logs
if [[ -f /tmp/blockchain.log ]]; then
    log_evidence "Blockchain log exists (size: $(wc -c < /tmp/blockchain.log) bytes)"
    BLOCKCHAIN_ERRORS=$(grep -i "error\|failed\|fatal" /tmp/blockchain.log 2>/dev/null | wc -l)
    if [[ $BLOCKCHAIN_ERRORS -gt 0 ]]; then
        log_error "Blockchain log contains $BLOCKCHAIN_ERRORS error lines"
        log_evidence "First error from blockchain: $(grep -i 'error\|failed\|fatal' /tmp/blockchain.log 2>/dev/null | head -1)"
    else
        log_success "Blockchain log has no obvious errors"
    fi
fi

if [[ -f /tmp/backend.log ]]; then
    log_evidence "Backend log exists (size: $(wc -c < /tmp/backend.log) bytes)"
    BACKEND_ERRORS=$(grep -i "error\|failed\|fatal" /tmp/backend.log 2>/dev/null | wc -l)
    if [[ $BACKEND_ERRORS -gt 0 ]]; then
        log_error "Backend log contains $BACKEND_ERRORS error lines"
        log_evidence "First error from backend: $(grep -i 'error\|failed\|fatal' /tmp/backend.log 2>/dev/null | head -1)"
    else
        log_success "Backend log has no obvious errors"
    fi
fi

if [[ -f /tmp/frontend.log ]]; then
    log_evidence "Frontend log exists (size: $(wc -c < /tmp/frontend.log) bytes)"
    FRONTEND_ERRORS=$(grep -i "error\|failed\|fatal" /tmp/frontend.log 2>/dev/null | wc -l)
    if [[ $FRONTEND_ERRORS -gt 0 ]]; then
        log_error "Frontend log contains $FRONTEND_ERRORS error lines"
        log_evidence "First error from frontend: $(grep -i 'error\|failed\|fatal' /tmp/frontend.log 2>/dev/null | head -1)"
    else
        log_success "Frontend log has no obvious errors"
    fi
fi

# ============================================================================
# PHASE 9: PERSISTENCE CHECK
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 9: PERSISTENCE CHECK (60 seconds)                                   ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 9: PERSISTENCE CHECK (60 seconds) ==="

echo "Services running for 60 seconds, checking for crashes..."
CRASH_CHECK=0

for i in {1..6}; do
    sleep 10
    
    if ! pgrep -f "marketplaced start" > /dev/null 2>&1; then
        log_error "Blockchain crashed"
        CRASH_CHECK=1
    fi
    
    if ! pgrep -f "node src/index.js" > /dev/null 2>&1; then
        log_error "Backend crashed"
        CRASH_CHECK=1
    fi
    
    if ! nc -z localhost 26657 2>/dev/null; then
        log_error "Blockchain RPC port lost"
        CRASH_CHECK=1
    fi
    
    if ! nc -z localhost 4000 2>/dev/null; then
        log_error "Backend API port lost"
        CRASH_CHECK=1
    fi
done

if [[ $CRASH_CHECK -eq 0 ]]; then
    log_success "All services remained running for 60+ seconds"
else
    log_error "Services crashed or became unavailable during persistence check"
fi

# ============================================================================
# PHASE 10: FINAL SUMMARY
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║ PHASE 10: FINAL SUMMARY                                                   ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

log_evidence "=== PHASE 10: FINAL SUMMARY ==="

TOTAL_ERRORS=$(wc -l < "$ERRORS_FILE")
TOTAL_EVIDENCE=$(wc -l < "$EVIDENCE_FILE")

echo ""
echo "Verification Complete."
echo ""
echo "Evidence file: $EVIDENCE_FILE ($(wc -l < "$EVIDENCE_FILE") lines)"
echo "Errors file: $ERRORS_FILE ($TOTAL_ERRORS lines)"
echo ""

if [[ $TOTAL_ERRORS -gt 0 ]]; then
    echo -e "${RED}⚠ ISSUES FOUND ($TOTAL_ERRORS errors)${NC}"
    echo ""
    echo "Error summary:"
    grep "ERROR:" "$ERRORS_FILE" | head -10
else
    echo -e "${GREEN}✓ NO ERRORS FOUND${NC}"
fi

log_evidence ""
log_evidence "Verification completed at $(date +'%Y-%m-%d %H:%M:%S')"

echo ""
echo "Full evidence captured in: $EVIDENCE_FILE"
echo ""
