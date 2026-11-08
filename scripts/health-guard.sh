#!/bin/bash
# health-guard.sh — idempotent self-healing check for the Mallchain local stack.
#
# Safe to run any time (after boot, wake from sleep/hibernate, or on a schedule).
# Checks every service; starts ONLY the ones that are down; never disturbs a
# healthy process. Prints one line per service:
#   OK <name>                     — already healthy
#   REPAIRED <name>               — was down, this script restarted it
#   FAILED <name> <detail>        — could not fix automatically, needs a human
#   STUCK chain                   — chain process alive but block height frozen
#
# Exit code: 0 when everything ended OK/REPAIRED, 1 when anything FAILED/STUCK.
#
# CRITICAL MongoDB rule: mongod MUST use --dbpath /home/elle_bryson/mongodb-data
# (persistent). NEVER /tmp — tmpfs wipes the whole database on power loss.
set -u

REPO=/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
MONGO_DBPATH=/home/elle_bryson/mongodb-data
STATUS=0

say() { echo "$@"; }

# ------------------------------------------------------------------ MongoDB
check_mongo() {
  if mongosh --port 27020 --quiet --eval 'rs.status().ok' >/dev/null 2>&1; then
    say "OK mongo (rs0 mallchain :27020, persistent dbpath)"
    return
  fi
  # Not healthy — start it (guarded: only if no mongod on 27020 at all)
  if ! pgrep -f "mongod.*27020" >/dev/null; then
    mkdir -p "$MONGO_DBPATH"
    mongod --replSet mallchain --port 27020 --dbpath "$MONGO_DBPATH" \
           --logpath /tmp/mongo-rs.log --bind_ip 127.0.0.1 --fork >/dev/null 2>&1
  fi
  for i in $(seq 1 15); do
    if mongosh --port 27020 --quiet --eval 'rs.status().ok' >/dev/null 2>&1; then break; fi
    if [ "$i" = 1 ]; then
      mongosh --port 27020 --quiet --eval "try { rs.initiate() } catch(e) { rs.status() }" >/dev/null 2>&1
    fi
    sleep 2
  done
  if mongosh --port 27020 --quiet --eval 'rs.status().ok' >/dev/null 2>&1; then
    say "REPAIRED mongo (replset restarted on :27020)"
  else
    say "FAILED mongo — not responding on :27020; check /tmp/mongo-rs.log (dbpath $MONGO_DBPATH)"
    STATUS=1
  fi
}

# -------------------------------------------------------------------- Redis
check_redis() {
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    say "OK redis (:6379)"
    return
  fi
  pgrep -x redis-server >/dev/null || redis-server --daemonize yes --logfile /tmp/redis.log >/dev/null 2>&1
  for i in $(seq 1 10); do redis-cli ping 2>/dev/null | grep -q PONG && break; sleep 1; done
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    say "REPAIRED redis"
  else
    say "FAILED redis — not responding on :6379 (background workers/crons need it)"
    STATUS=1
  fi
}

# ------------------------------------------------------------------ Chain
chain_height() {
  curl -s --max-time 5 http://localhost:26657/status 2>/dev/null \
    | grep -o '"latest_block_height":"[0-9]*"' | grep -o '[0-9]*'
}

check_chain() {
  local h1 h2
  h1=$(chain_height)
  if [ -z "$h1" ]; then
    pgrep -x marketplaced >/dev/null || {
      cd "$REPO" && nohup "$REPO/build/marketplaced" start \
        --home "$REPO/blockchain_working" --minimum-gas-prices "0.01stake" \
        > /tmp/chain.log 2>&1 &
    }
    for i in $(seq 1 20); do h1=$(chain_height); [ -n "$h1" ] && break; sleep 2; done
    if [ -z "$h1" ]; then
      say "FAILED chain — no RPC response on :26657; check /tmp/chain.log"
      STATUS=1
      return
    fi
    say "REPAIRED chain (marketplaced restarted, height $h1)"
  fi
  sleep 9
  h2=$(chain_height)
  if [ -n "$h2" ] && [ "$h2" -gt "$h1" ]; then
    say "OK chain (advancing: $h1 -> $h2)"
  elif [ -n "$h2" ] && [ "$h2" = "$h1" ]; then
    say "STUCK chain — process responds but block height frozen at $h1 (check /tmp/chain.log; validator state may need intervention)"
    STATUS=1
  else
    say "FAILED chain — height went unresponsive mid-check"
    STATUS=1
  fi
}

# ----------------------------------------------------------------- Backend
backend_health() {
  curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://localhost:4000/api/health 2>/dev/null
}

check_backend() {
  local code
  code=$(backend_health)
  if [ "$code" = "200" ]; then
    say "OK backend (:4000 health 200)"
    return
  fi
  pgrep -f "node src/index.js" >/dev/null && {
    # process alive but unhealthy — give it a moment, then restart it
    sleep 5
    code=$(backend_health)
    if [ "$code" = "200" ]; then say "OK backend (recovered without restart)"; return; fi
    pkill -f "node src/index.js" 2>/dev/null; sleep 3
  }
  cd "$REPO/backend" && nohup node src/index.js > /tmp/backend.log 2>&1 &
  for i in $(seq 1 30); do
    code=$(backend_health); [ "$code" = "200" ] && break; sleep 4
  done
  if [ "$code" != "200" ]; then
    say "FAILED backend — /api/health not 200 after 120s; check /tmp/backend.log"
    STATUS=1
    return
  fi
  # Redis-race trap: backend can boot healthy yet silently disable background
  # workers if Redis wasn't ready. Verify the marker line; restart once if absent.
  sleep 3
  if grep -q "Background workers started" /tmp/backend.log; then
    say "REPAIRED backend (health 200, background workers active)"
  else
    pkill -f "node src/index.js" 2>/dev/null; sleep 3
    cd "$REPO/backend" && nohup node src/index.js > /tmp/backend.log 2>&1 &
    for i in $(seq 1 30); do
      code=$(backend_health); [ "$code" = "200" ] && break; sleep 4
    done
    sleep 3
    if [ "$code" = "200" ] && grep -q "Background workers started" /tmp/backend.log; then
      say "REPAIRED backend (restarted; workers now active)"
    else
      say "FAILED backend — up but background workers not confirmed; check /tmp/backend.log"
      STATUS=1
    fi
  fi
}

# --------------------------------------------------------------- Explorer
check_explorer() {
  # Probe the real stats endpoint (root returns 404 and the indexer can be
  # slow on cold queries, so give it 8s and check the payload, not just TCP).
  if curl -s --max-time 8 http://127.0.0.1:4100/api/explorer/stats 2>/dev/null | grep -q '"success":true'; then
    say "OK explorer (:4100)"
    return
  fi
  if ! pgrep -f "explorer.*server.js" >/dev/null && ! ss -tln 2>/dev/null | grep -q ':4100'; then
    cd "$REPO/explorer/backend" && nohup node server.js >> /tmp/explorer.log 2>&1 &
  fi
  for i in $(seq 1 10); do
    curl -s --max-time 5 http://127.0.0.1:4100/api/explorer/stats 2>/dev/null | grep -q '"success":true' && break
    sleep 2
  done
  if curl -s --max-time 5 http://127.0.0.1:4100/api/explorer/stats 2>/dev/null | grep -q '"success":true'; then
    say "REPAIRED explorer"
  else
    # Non-fatal: frontend explorer endpoints are served locally by the backend.
    say "OK explorer (optional :4100 service not up; backend serves /api/explorer locally)"
  fi
}

# ------------------------------------------------------------- Dev server
check_devserver() {
  if curl -s --max-time 4 -o /dev/null http://localhost:5173/ 2>/dev/null; then
    say "OK devserver (:5173)"
    return
  fi
  cd "$REPO/mallchain-os-v14" && nohup npm run dev > /tmp/vite-dev.log 2>&1 &
  for i in $(seq 1 15); do
    curl -s --max-time 3 -o /dev/null http://localhost:5173/ 2>/dev/null && break
    sleep 2
  done
  if curl -s --max-time 3 -o /dev/null http://localhost:5173/ 2>/dev/null; then
    say "REPAIRED devserver (vite on :5173)"
  else
    say "FAILED devserver — :5173 not serving; check /tmp/vite-dev.log"
    STATUS=1
  fi
}

# -------------------------------------------------- Tunnel connector (root)
check_cloudflared() {
  if pgrep -f "cloudflared.*tunnel run" >/dev/null; then
    say "OK cloudflared (api.mallchain.network tunnel process alive)"
  else
    # Runs as root with /etc/cloudflared/token — cannot auto-start unprivileged.
    say "FAILED cloudflared — tunnel process not running; needs: sudo /home/elle_bryson/.local/bin/cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token & "
    STATUS=1
  fi
}

# ------------------------------------------------------------------ Watcher
check_stake_watcher() {
  # Advisory only: reads treasury balance; does NOT move funds.
  local tb
  tb=$(curl -s --max-time 5 http://localhost:1317/cosmos/bank/v1beta1/balances/mall1u9mqkl02w3g744va90ak338e80zlp3p4ehlwjp 2>/dev/null \
       | grep -o '"amount":"[0-9]*"' | grep -o '[0-9]*' | head -1)
  tb=${tb:-0}
  if [ "$tb" -lt 6000000 ]; then
    say "WARN treasury — stake balance $tb below 6000000; operatorStakeWatcher needs treasury > 5000000 (run ./FUND_TREASURY.sh)"
  else
    say "OK treasury ($tb stake)"
  fi
}

# Chain FIRST: whenever this runs (PC wake, cold boot, scheduled watchdog),
# confirming the blockchain is alive and advancing is the top priority —
# everything else (users, KYC, conversions) ultimately depends on it.
# Diagnose each section fully before moving to the next; report, don't guess.
check_chain
check_mongo
check_redis
check_backend
check_explorer
check_devserver
check_cloudflared
check_stake_watcher

exit $STATUS
