#!/usr/bin/env bash
set -euo pipefail

# tune_node_for_throughput.sh
# Adjusts node config and genesis consensus params to increase throughput capacity.
# Use with care — these settings trade decentralization/resource use for TPS.
#
# Usage:
#   ./scripts/tune_node_for_throughput.sh --home /tmp/mpnode
#

HOME_DIR=/tmp/mpnode

# Defaults (tunable via CLI flags)
MEMPOOL_SIZE=50000
MEMPOOL_CACHE=20000
TIMEOUT_PROPOSE="500ms"
TIMEOUT_PROPOSE_DELTA="500ms"
TIMEOUT_PREVOTE="500ms"
TIMEOUT_PRECOMMIT="500ms"
TIMEOUT_COMMIT="1s"
SEND_RATE=10485760
RECV_RATE=10485760
INDEXER="null"
MAX_OPEN_CONNECTIONS=20000
MAX_BYTES="22020096"
MAX_GAS="1000000000"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --home PATH                 Node home directory (default: /tmp/mpnode)
  --mempool-size N            Mempool size (default: $MEMPOOL_SIZE)
  --mempool-cache N           Mempool cache_size (default: $MEMPOOL_CACHE)
  --timeout-propose X        timeout_propose (default: $TIMEOUT_PROPOSE)
  --timeout-propose-delta X  timeout_propose_delta (default: $TIMEOUT_PROPOSE_DELTA)
  --timeout-prevote X        timeout_prevote (default: $TIMEOUT_PREVOTE)
  --timeout-precommit X      timeout_precommit (default: $TIMEOUT_PRECOMMIT)
  --timeout-commit X         timeout_commit (default: $TIMEOUT_COMMIT)
  --send-rate N              send_rate bytes/sec (default: $SEND_RATE)
  --recv-rate N              recv_rate bytes/sec (default: $RECV_RATE)
  --indexer VAL              indexer setting, e.g. \"null\" or \"kv\" (default: $INDEXER)
  --max-open-connections N   app.toml max_open_connections (default: $MAX_OPEN_CONNECTIONS)
  --max-bytes N              genesis.consensus_params.block.max_bytes (default: $MAX_BYTES)
  --max-gas N                genesis.consensus_params.block.max_gas (default: $MAX_GAS)
  --help                     Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --home) HOME_DIR="$2"; shift 2;;
    --mempool-size) MEMPOOL_SIZE="$2"; shift 2;;
    --mempool-cache) MEMPOOL_CACHE="$2"; shift 2;;
    --timeout-propose) TIMEOUT_PROPOSE="$2"; shift 2;;
    --timeout-propose-delta) TIMEOUT_PROPOSE_DELTA="$2"; shift 2;;
    --timeout-prevote) TIMEOUT_PREVOTE="$2"; shift 2;;
    --timeout-precommit) TIMEOUT_PRECOMMIT="$2"; shift 2;;
    --timeout-commit) TIMEOUT_COMMIT="$2"; shift 2;;
    --send-rate) SEND_RATE="$2"; shift 2;;
    --recv-rate) RECV_RATE="$2"; shift 2;;
    --indexer) INDEXER="$2"; shift 2;;
    --max-open-connections) MAX_OPEN_CONNECTIONS="$2"; shift 2;;
    --max-bytes) MAX_BYTES="$2"; shift 2;;
    --max-gas) MAX_GAS="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift 1;;
    --rollback) ROLLBACK=1; shift 1;;
    --help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

DRY_RUN=${DRY_RUN:-0}
ROLLBACK=${ROLLBACK:-0}

CONFIG_TOML="$HOME_DIR/config/config.toml"
APP_TOML="$HOME_DIR/config/app.toml"
GENESIS_JSON="$HOME_DIR/config/genesis.json"

if [ ! -d "$HOME_DIR" ]; then
  echo "Error: home dir not found: $HOME_DIR" >&2
  exit 1
fi

echo "Backing up config files in $HOME_DIR/config"
mkdir -p "$HOME_DIR/config/backup"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY-RUN: would back up: $CONFIG_TOML $APP_TOML $GENESIS_JSON to $HOME_DIR/config/backup/"
else
  cp -v "$CONFIG_TOML" "$APP_TOML" "$GENESIS_JSON" "$HOME_DIR/config/backup/" || true
fi

echo "Patching $CONFIG_TOML (mempool, consensus timeouts, p2p, tx_index)"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY-RUN: set timeout_propose = $TIMEOUT_PROPOSE"
  echo "DRY-RUN: set timeout_propose_delta = $TIMEOUT_PROPOSE_DELTA"
  echo "DRY-RUN: set timeout_prevote = $TIMEOUT_PREVOTE"
  echo "DRY-RUN: set timeout_precommit = $TIMEOUT_PRECOMMIT"
  echo "DRY-RUN: set timeout_commit = $TIMEOUT_COMMIT"
  echo "DRY-RUN: set mempool size = $MEMPOOL_SIZE, cache = $MEMPOOL_CACHE"
  echo "DRY-RUN: set send_rate = $SEND_RATE, recv_rate = $RECV_RATE"
  echo "DRY-RUN: set indexer = $INDEXER"
else
  sed -i.bak -E "s/^(timeout_propose\s*=).*/\1 \"$TIMEOUT_PROPOSE\"/" "$CONFIG_TOML" || true
  sed -i -E "s/^(timeout_propose_delta\s*=).*/\1 \"$TIMEOUT_PROPOSE_DELTA\"/" "$CONFIG_TOML" || true
  sed -i -E "s/^(timeout_prevote\s*=).*/\1 \"$TIMEOUT_PREVOTE\"/" "$CONFIG_TOML" || true
  sed -i -E "s/^(timeout_precommit\s*=).*/\1 \"$TIMEOUT_PRECOMMIT\"/" "$CONFIG_TOML" || true
  sed -i -E "s/^(timeout_commit\s*=).*/\1 \"$TIMEOUT_COMMIT\"/" "$CONFIG_TOML" || true

  # Mempool: increase size and cache
  sed -i -E "s/^(size\s*=).*/\1 $MEMPOOL_SIZE/" "$CONFIG_TOML" || true
  sed -i -E "s/^(cache_size\s*=).*/\1 $MEMPOOL_CACHE/" "$CONFIG_TOML" || true

  # Increase send/recv rates (bytes/sec)
  sed -i -E "s/^(send_rate\s*=).*/\1 $SEND_RATE/" "$CONFIG_TOML" || true
  sed -i -E "s/^(recv_rate\s*=).*/\1 $RECV_RATE/" "$CONFIG_TOML" || true

  # Set indexer
  sed -i -E "s/^(indexer\s*=).*/\1 \"$INDEXER\"/" "$CONFIG_TOML" || true
fi

echo "Patching $APP_TOML (api/grpc limits)"
# Increase GRPC and API limits if present
sed -i -E "s/^(max_open_connections\s*=).*/\1 $MAX_OPEN_CONNECTIONS/" "$APP_TOML" || true

if [ -f "$GENESIS_JSON" ]; then
  echo "Patching $GENESIS_JSON (consensus_params.block)"
  # Use jq to safely edit genesis consensus params; if jq not available, fallback to sed
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY-RUN: set genesis.consensus_params.block.max_bytes = $MAX_BYTES"
    echo "DRY-RUN: set genesis.consensus_params.block.max_gas = $MAX_GAS"
  else
    if command -v jq >/dev/null 2>&1; then
      tmpfile=$(mktemp)
      jq --arg mb "$MAX_BYTES" --arg mg "$MAX_GAS" '.consensus_params.block.max_bytes = $mb | .consensus_params.block.max_gas = $mg' "$GENESIS_JSON" > "$tmpfile" && mv "$tmpfile" "$GENESIS_JSON"
    else
      echo "jq not found; attempting approximate sed edits (less safe)"
      sed -i -E "s/\"max_bytes\"\s*:\s*\"?[0-9]+\"?/\"max_bytes\": \"$MAX_BYTES\"/" "$GENESIS_JSON" || true
      sed -i -E "s/\"max_gas\"\s*:\s*\"?-?[0-9]+\"?/\"max_gas\": \"$MAX_GAS\"/" "$GENESIS_JSON" || true
    fi
  fi
fi

echo "Tuning complete. Recommended next steps:" 
echo " 1) Stop the node process using this home." 
echo " 2) Start the node again so Tendermint and the app pick up new config and genesis settings." 
echo " 3) Monitor resource usage (CPU, disk IO, network) and adjust mempool/timeout settings as needed." 
echo "Note: To reach 10k+ TPS you will likely need: faster hardware, multiple validators, tuned networking, and application-level optimizations (parallel tx processing, simplified handlers)."

if [ "$ROLLBACK" -eq 1 ]; then
  echo "Rollback requested: restoring backups from $HOME_DIR/config/backup"
  if [ ! -d "$HOME_DIR/config/backup" ]; then
    echo "No backup directory found at $HOME_DIR/config/backup" >&2
    exit 1
  fi
  cp -v "$HOME_DIR/config/backup/config.toml" "$CONFIG_TOML" || true
  cp -v "$HOME_DIR/config/backup/app.toml" "$APP_TOML" || true
  cp -v "$HOME_DIR/config/backup/genesis.json" "$GENESIS_JSON" || true
  echo "Rollback complete. Restart node to apply restored config." 
fi
