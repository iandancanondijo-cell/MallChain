#!/bin/bash
# mongo-rs-init.sh — one-shot init for docker-compose's mongo service:
# initiates the rs0 replica set (idempotent — safe if it's already
# initiated, e.g. after a container restart) and creates the 'mallchain'
# app user with readWrite-only access (production-readiness S1/D1).
#
# Runs as its own short-lived container (see docker-compose.yml's
# mongo-init service) rather than via docker-entrypoint-initdb.d, which
# does not reliably fire once --replSet is on the mongod command — that
# hook expects the node to already be PRIMARY, which a freshly-started
# replica-set member isn't until something calls rs.initiate().
set -euo pipefail

MONGO_HOST="mongo"
MONGO_PORT="27017"

echo "Waiting for mongo to accept connections..."
for i in $(seq 1 30); do
  if mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "db.adminCommand('ping')" \
      -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == 30 ]]; then
    echo "ERROR: mongo did not become reachable in time" >&2
    exit 1
  fi
  sleep 2
done

echo "Checking replica set status..."
RS_STATUS=$(mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "
  try {
    const s = rs.status();
    print('already-initiated');
  } catch (e) {
    print('not-initiated');
  }
" -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin)

if echo "$RS_STATUS" | grep -q "not-initiated"; then
  echo "Initiating replica set rs0..."
  mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "
    rs.initiate({
      _id: 'rs0',
      members: [{ _id: 0, host: '${MONGO_HOST}:${MONGO_PORT}' }]
    })
  " -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin

  echo "Waiting for this node to become PRIMARY..."
  for i in $(seq 1 30); do
    IS_PRIMARY=$(mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "db.hello().isWritablePrimary" \
      -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin 2>/dev/null || echo "false")
    if [[ "$IS_PRIMARY" == "true" ]]; then
      break
    fi
    if [[ "$i" == 30 ]]; then
      echo "ERROR: node never became PRIMARY after rs.initiate()" >&2
      exit 1
    fi
    sleep 2
  done
else
  echo "Replica set already initiated — skipping rs.initiate()."
fi

echo "Ensuring the 'mallchain' application user exists..."
MONGO_APP_PASSWORD="$MONGO_APP_PASSWORD" mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  /mongo-init.js

echo "mongo-init complete."
