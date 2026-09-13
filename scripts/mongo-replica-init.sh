#!/bin/bash
set -euo pipefail

RS_ID="mallchain-rs"
MONGO_NODES=("mongo-rs-1:27017" "mongo-rs-2:27017" "mongo-rs-3:27017")
MAX_WAIT=90
EXPLORER_USER="${MONGO_EXPLORER_USER:-explorer}"
EXPLORER_PASSWORD="${MONGO_EXPLORER_PASSWORD:?MONGO_EXPLORER_PASSWORD must be set}"
MONGO_ROOT_USER="${MONGO_ROOT_USER:-admin}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD must be set}"

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo "[pre-flight] Running pre-flight checks..."

command -v mongosh >/dev/null 2>&1 || { echo "ERROR: mongosh is required but not installed" >&2; exit 1; }
echo "[pre-flight] mongosh: ok"

echo "[pre-flight] Waiting up to ${MAX_WAIT}s for all 3 mongo RS containers to be healthy..."
START_TS=$(date +%s)
ALL_READY=0

while true; do
  ELAPSED=$(( $(date +%s) - START_TS ))
  if (( ELAPSED >= MAX_WAIT )); then
    break
  fi

  NODE_OK_COUNT=0
  for NODE in "${MONGO_NODES[@]}"; do
    HOST="${NODE%%:*}"
    PORT="${NODE##*:}"
    if mongosh --host "$HOST" --port "$PORT" --quiet \
        -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
      NODE_OK_COUNT=$(( NODE_OK_COUNT + 1 ))
    fi
  done

  if (( NODE_OK_COUNT == 3 )); then
    ALL_READY=1
    break
  fi

  echo "[pre-flight] Healthy nodes: ${NODE_OK_COUNT}/3 (${ELAPSED}s elapsed)..."
  sleep 3
done

if (( ALL_READY == 0 )); then
  echo "ERROR: Not all 3 mongo RS nodes became healthy within ${MAX_WAIT}s" >&2
  exit 1
fi
echo "[pre-flight] All 3 mongo RS nodes are healthy."

# -----------------------------------------------------------------------------
# Initiate replica set
# -----------------------------------------------------------------------------
echo "[mongo-rs] Checking replica set status on mongo-rs-1..."
RS_INITIATED=$(mongosh --host mongo-rs-1 --port 27017 --quiet \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval "
    try {
      const s = rs.status();
      print('true');
    } catch (e) {
      print('false');
    }
  ")

if [[ "${RS_INITIATED}" != "true" ]]; then
  echo "[mongo-rs] Initiating replica set '${RS_ID}'..."
  mongosh --host mongo-rs-1 --port 27017/admin --quiet \
    -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin --eval "
      rs.initiate({
        _id: '${RS_ID}',
        version: 1,
        members: [
          { _id: 0, host: 'mongo-rs-1:27017', priority: 3 },
          { _id: 1, host: 'mongo-rs-2:27017', priority: 2 },
          { _id: 2, host: 'mongo-rs-3:27017', arbiterOnly: true, priority: 0 }
        ]
      })
    "
  echo "[mongo-rs] rs.initiate() issued."
else
  echo "[mongo-rs] Replica set already initiated — skipping rs.initiate()."
fi

# -----------------------------------------------------------------------------
# Wait for rs.status().ok
# -----------------------------------------------------------------------------
echo "[mongo-rs] Waiting for rs.status().ok === 1..."
for i in $(seq 1 30); do
  STATUS_OK=$(mongosh --host mongo-rs-1 --port 27017 --quiet \
    -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin --eval "rs.status().ok" 2>/dev/null || echo "0")
  if [[ "${STATUS_OK}" == "1" ]]; then
    break
  fi
  if [[ "$i" == 30 ]]; then
    echo "ERROR: rs.status().ok never returned 1" >&2
    exit 1
  fi
  sleep 3
done
echo "[mongo-rs] Replica set status OK."

# -----------------------------------------------------------------------------
# Wait for a writable primary
# -----------------------------------------------------------------------------
echo "[mongo-rs] Waiting for PRIMARY node..."
for i in $(seq 1 30); do
  IS_PRIMARY=$(mongosh --host mongo-rs-1 --port 27017 --quiet \
    -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin --eval "db.hello().isWritablePrimary" 2>/dev/null || echo "false")
  if [[ "${IS_PRIMARY}" == "true" ]]; then
    break
  fi
  if [[ "$i" == 30 ]]; then
    echo "ERROR: No node became PRIMARY within timeout" >&2
    exit 1
  fi
  sleep 3
done
echo "[mongo-rs] PRIMARY is available."

# -----------------------------------------------------------------------------
# Create explorer user
# -----------------------------------------------------------------------------
echo "[mongo-rs] Creating/updating '${EXPLORER_USER}' user with readWriteAnyDatabase..."
mongosh --host mongo-rs-1 --port 27017/admin --quiet \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval "
    const user = '${EXPLORER_USER}';
    const pwd  = '${EXPLORER_PASSWORD}';
    const existing = db.getUser(user);
    if (existing) {
      db.updateUser(user, {
        pwd: pwd,
        mechanisms: ['SCRAM-SHA-256'],
        roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }]
      });
      print('user-updated');
    } else {
      db.createUser({
        user: user,
        pwd: pwd,
        mechanisms: ['SCRAM-SHA-256'],
        roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }]
      });
      print('user-created');
    }
  "

echo "[mongo-rs] Done."
