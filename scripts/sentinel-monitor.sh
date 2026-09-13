#!/bin/bash
set -euo pipefail

SENTINEL_COUNT=3
SENTINEL_PORT=26379
MASTER_NAME="${REDIS_MASTER_NAME:-mymaster}"
DOWN_AFTER_MS=5000
PARALLEL_SYNCS=1
FAILOVER_TIMEOUT=10000
AUTH_PASS_FILE="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
CKQUORUM_RETRIES=3
CHECK_INTERVAL=60

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo "[pre-flight] Running pre-flight checks..."

command -v redis-cli >/dev/null 2>&1 || { echo "ERROR: redis-cli is required but not installed" >&2; exit 1; }
echo "[pre-flight] redis-cli: ok"

if [[ ! -f "${AUTH_PASS_FILE}" ]]; then
  echo "ERROR: Redis password file not found at ${AUTH_PASS_FILE}" >&2
  exit 1
fi
REDIS_PASSWORD=$(cat "${AUTH_PASS_FILE}")
if [[ -z "${REDIS_PASSWORD}" ]]; then
  echo "ERROR: Redis password file ${AUTH_PASS_FILE} is empty" >&2
  exit 1
fi
echo "[pre-flight] auth pass file: ${AUTH_PASS_FILE} (non-empty)"

for i in $(seq 1 "${SENTINEL_COUNT}"); do
  SENTINEL_HOST="sentinel-${i}"
  if ! redis-cli -h "${SENTINEL_HOST}" -p "${SENTINEL_PORT}" \
      --no-auth-warning -a "${REDIS_PASSWORD}" ping >/dev/null 2>&1; then
    echo "WARNING: sentinel-${i} (${SENTINEL_HOST}:${SENTINEL_PORT}) not reachable yet"
  fi
done
echo "[pre-flight] Sentinel pre-flight reachability probes done."

# -----------------------------------------------------------------------------
# Configure each sentinel (parallel)
# -----------------------------------------------------------------------------
echo "[sentinel] Configuring ${SENTINEL_COUNT} sentinels for master '${MASTER_NAME}'..."

configure_sentinel() {
  local idx="$1"
  local host="sentinel-${idx}"
  echo "[sentinel-${idx}] Applying sentinel set directives..."
  redis-cli -h "${host}" -p "${SENTINEL_PORT}" --no-auth-warning -a "${REDIS_PASSWORD}" \
    sentinel set "${MASTER_NAME}" down-after-milliseconds "${DOWN_AFTER_MS}" \
    parallel-syncs "${PARALLEL_SYNCS}" \
    failover-timeout "${FAILOVER_TIMEOUT}" \
    auth-pass "file:${AUTH_PASS_FILE}" >/dev/null
  echo "[sentinel-${idx}] Configuration applied."
}

PIDS=()
for i in $(seq 1 "${SENTINEL_COUNT}"); do
  configure_sentinel "$i" &
  PIDS+=($!)
done

for PID in "${PIDS[@]}"; do
  if ! wait "${PID}"; then
    echo "ERROR: One or more sentinel configuration jobs failed" >&2
    exit 1
  fi
done
echo "[sentinel] All sentinels configured successfully."

# -----------------------------------------------------------------------------
# Monitor loop: every minute run sentinel ckquorum, exit 1 after 3 WARN retries
# -----------------------------------------------------------------------------
echo "[sentinel] Starting ckquorum monitor loop (every ${CHECK_INTERVAL}s, ${CKQUORUM_RETRIES} retries before fail)..."

WARN_COUNT=0

while true; do
  QUORUM_OK=1
  for i in $(seq 1 "${SENTINEL_COUNT}"); do
    HOST="sentinel-${i}"
    OUTPUT=$(redis-cli -h "${HOST}" -p "${SENTINEL_PORT}" --no-auth-warning -a "${REDIS_PASSWORD}" \
      sentinel ckquorum "${MASTER_NAME}" 2>&1 || true)
    if ! echo "${OUTPUT}" | grep -q "OK"; then
      echo "WARN $(date -Iseconds) sentinel-${i} ckquorum NOT OK: ${OUTPUT}"
      QUORUM_OK=0
    fi
  done

  if (( QUORUM_OK == 1 )); then
    echo "INFO $(date -Iseconds) sentinel ckquorum OK for all ${SENTINEL_COUNT} nodes."
    WARN_COUNT=0
  else
    WARN_COUNT=$(( WARN_COUNT + 1 ))
    echo "WARN $(date -Iseconds) ckquorum failures detected — consecutive warn count: ${WARN_COUNT}/${CKQUORUM_RETRIES}"
    if (( WARN_COUNT >= CKQUORUM_RETRIES )); then
      echo "ERROR $(date -Iseconds) ckquorum failed ${CKQUORUM_RETRIES} times in a row. Exiting 1." >&2
      exit 1
    fi
  fi

  sleep "${CHECK_INTERVAL}"
done
