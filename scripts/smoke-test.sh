#!/bin/bash
# smoke-test.sh — post-deploy sanity check. Verifies the deployed stack
# actually serves traffic, not just that processes are running: liveness,
# readiness, chain connectivity, and Mongo/Redis health.
#
# Usage:
#   ./scripts/smoke-test.sh
#
# Env vars (all optional, sensible localhost defaults for a docker-compose
# or bare-metal dev run):
#   BACKEND_URL   - default http://localhost:4000
#   FRONTEND_URL  - default http://localhost:8080
#   CHAIN_RPC_URL - default http://localhost:26657
set -uo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
CHAIN_RPC_URL="${CHAIN_RPC_URL:-http://localhost:26657}"

FAILURES=0

# check <name> <url> [expected_status, default 200]
check() {
  local name="$1" url="$2" expected="${3:-200}"
  local status
  status=$(curl -s -o /tmp/smoke-test-body.$$ -w '%{http_code}' --max-time 10 "$url" 2>/dev/null)
  if [[ "$status" == "$expected" ]]; then
    echo "  OK   $name ($status)"
  else
    echo "  FAIL $name — expected $expected, got ${status:-<no response>}" >&2
    if [[ -f "/tmp/smoke-test-body.$$" ]]; then
      echo "       body: $(head -c 300 /tmp/smoke-test-body.$$)" >&2
    fi
    FAILURES=$((FAILURES + 1))
  fi
  rm -f "/tmp/smoke-test-body.$$"
}

echo "=== Mallchain smoke test ==="
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo "Chain:    $CHAIN_RPC_URL"
echo ""

echo "-- Backend --"
check "liveness (/api/live)" "$BACKEND_URL/api/live"
check "readiness (/api/ready)" "$BACKEND_URL/api/ready"
check "health (/api/health)" "$BACKEND_URL/api/health"
# A fresh deploy reporting "degraded" (503 — see index.js's /api/health,
# which independently checks chain/db/redis) is exactly what this script
# should catch and fail on, not something to treat as acceptable.

echo "-- Chain node --"
check "RPC status" "$CHAIN_RPC_URL/status"

echo "-- Frontend --"
check "static assets served" "$FRONTEND_URL/"

echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  echo "All checks passed."
  exit 0
else
  echo "$FAILURES check(s) failed." >&2
  exit 1
fi
