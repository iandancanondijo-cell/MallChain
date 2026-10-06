#!/bin/bash
# install-remote-node.sh — Set up a marketplaced node on this machine that joins
# the mallchain-1 network through an existing peer.
#
# Run on the NEW machine, inside a clone of this repository:
#   scripts/install-remote-node.sh --peer=<node_id@host:26656> [--start]
#
# What it does:
#   1. Builds ./marketplaced if missing (requires Go 1.25.8+)
#   2. Creates the node home with fresh node/validator keys via
#      scripts/gen_node_home.go (the binary has NO `init` command — see
#      docs/user-guides/10-run-a-blockchain-node.md) and sets the moniker
#   3. Installs the committed mallchain-1 genesis.json and app.toml
#      (the committed app.toml has gRPC disabled — the safe default)
#   4. Sets persistent_peers in config.toml
#   5. Moves gRPC off the default 9090 — a busy gRPC port silently kills the
#      REST API server (shared errgroup in server/start.go, no log output)
#   6. Optionally enables the REST API (--api) and starts the node (--start)
#
# To become a validator AFTER the node is synced and you have a funded
# account, use ./CREATE_VALIDATOR.sh — never edit the live genesis.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PEER=""
NODE_HOME="${HOME}/.mallchain"
MONIKER="$(hostname -s 2>/dev/null || echo remote-node)"
CHAIN_ID="mallchain-1"
GRPC_ADDR="localhost:9099"
ENABLE_API=false
START_NODE=false

usage() {
  cat <<EOF
Usage: scripts/install-remote-node.sh --peer=<node_id@host:port> [options]

Required:
  --peer=<id@host:port>   Existing node to connect to.
                          Get it on the peer machine with:
                            marketplaced tendermint show-node-id --home=<peer home>

Options:
  --home=<dir>            Node home directory (default: ~/.mallchain)
  --moniker=<name>        Node name (default: hostname)
  --chain-id=<id>         Chain id (default: mallchain-1)
  --grpc-address=<addr>   gRPC listen address (default: localhost:9099)
  --api                   Enable REST API on 127.0.0.1:1317
  --start                 Start the node when setup completes
  -h, --help              Show this help
EOF
}

for arg in "$@"; do
  case "$arg" in
    --peer=*)          PEER="${arg#*=}" ;;
    --home=*)          NODE_HOME="${arg#*=}" ;;
    --moniker=*)       MONIKER="${arg#*=}" ;;
    --chain-id=*)      CHAIN_ID="${arg#*=}" ;;
    --grpc-address=*)  GRPC_ADDR="${arg#*=}" ;;
    --api)             ENABLE_API=true ;;
    --start)           START_NODE=true ;;
    -h|--help)         usage; exit 0 ;;
    *)                 echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

if [[ -z "$PEER" ]]; then
  echo "ERROR: --peer is required"
  usage
  exit 1
fi
if [[ ! "$PEER" =~ ^[0-9a-f]{40}@.+:[0-9]+$ ]]; then
  echo "ERROR: --peer must look like <40-hex node id>@<host>:<port>"
  echo "       e.g. --peer=57c770cb4072eaf15bf1314a35c43acb827c09a2@10.0.0.5:26656"
  exit 1
fi

if [[ "$(uname)" == "Darwin" ]]; then
  SED_I=(sed -i '')
else
  SED_I=(sed -i)
fi

# Normalize to an absolute path: gen_node_home.go runs from the repo root
# (module context), so a relative --home would resolve against the wrong dir.
mkdir -p "$NODE_HOME"
NODE_HOME="$(cd "$NODE_HOME" && pwd)"

BINARY="$REPO_DIR/marketplaced"
GENESIS_SRC="$REPO_DIR/blockchain_working/config/genesis.json"
APP_TOML_SRC="$REPO_DIR/blockchain_working/config/app.toml"

echo "=== Mallchain remote node install ==="
echo "  Peer:      $PEER"
echo "  Chain:     $CHAIN_ID"
echo "  Home:      $NODE_HOME"
echo "  Moniker:   $MONIKER"
echo ""

# --- 1. Build ---------------------------------------------------------------
if ! command -v go &>/dev/null && [[ -x /usr/local/go/bin/go ]]; then
  PATH="/usr/local/go/bin:$PATH"
fi
if ! command -v go &>/dev/null; then
  echo "ERROR: Go not found. Install Go 1.25.8 or later."
  exit 1
fi

if [[ ! -x "$BINARY" ]]; then
  echo "[1/4] Building marketplaced (3-10 min, do not interrupt)..."
  (cd "$REPO_DIR" && go mod download)
  BUILD_CMD=(go build -o "$BINARY"
    -ldflags="-X github.com/cosmos/cosmos-sdk/version.Name=marketplace"
    ./cmd/marketplaced)
  if command -v timeout &>/dev/null; then
    (cd "$REPO_DIR" && timeout 1800 "${BUILD_CMD[@]}")
  else
    (cd "$REPO_DIR" && "${BUILD_CMD[@]}")
  fi
  echo "      Build complete."
else
  echo "[1/4] Binary already present: $BINARY"
fi
echo ""

# --- 2. Init home -----------------------------------------------------------
# There is no `marketplaced init` — the helper generates node/validator keys
# and a default config.toml using the same cometbft version as the binary.
# LoadOrGen semantics make re-runs safe: existing keys are kept.
if [[ -f "$NODE_HOME/config/priv_validator_key.json" ]]; then
  echo "[2/4] Node home exists — keeping existing keys:"
else
  echo "[2/4] Creating node home with fresh keys..."
fi
(cd "$REPO_DIR" && go run scripts/gen_node_home.go "$NODE_HOME")

CONFIG="$NODE_HOME/config/config.toml"
"${SED_I[@]}" "s|^moniker = .*|moniker = \"$MONIKER\"|" "$CONFIG"
if ! grep -q "^moniker = \"$MONIKER\"$" "$CONFIG"; then
  echo "ERROR: Failed to set moniker in $CONFIG"
  exit 1
fi
echo "      moniker = $MONIKER"
echo ""

# --- 3. Install committed genesis ------------------------------------------
if [[ ! -f "$GENESIS_SRC" ]]; then
  echo "ERROR: Committed genesis not found at $GENESIS_SRC"
  echo "       Clone the full repository first."
  exit 1
fi

GENESIS_CHAIN="$(grep -o '"chain_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$GENESIS_SRC" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
if [[ "$GENESIS_CHAIN" != "$CHAIN_ID" ]]; then
  echo "ERROR: Genesis chain_id '$GENESIS_CHAIN' does not match --chain-id '$CHAIN_ID'"
  exit 1
fi

echo "[3/4] Installing committed genesis and app.toml ($GENESIS_CHAIN)..."
cp "$GENESIS_SRC" "$NODE_HOME/config/genesis.json"
if [[ ! -f "$APP_TOML_SRC" ]]; then
  echo "ERROR: Committed app.toml not found at $APP_TOML_SRC"
  echo "       Clone the full repository first."
  exit 1
fi
cp "$APP_TOML_SRC" "$NODE_HOME/config/app.toml"
echo ""

# --- 4. Configure peers and ports -------------------------------------------
APP="$NODE_HOME/config/app.toml"

echo "[4/4] Configuring..."
if grep -q '^persistent_peers = ' "$CONFIG"; then
  "${SED_I[@]}" "s|^persistent_peers = .*|persistent_peers = \"$PEER\"|" "$CONFIG"
else
  printf 'persistent_peers = "%s"\n' "$PEER" >> "$CONFIG"
fi
if ! grep -q "^persistent_peers = \"$PEER\"$" "$CONFIG"; then
  echo "ERROR: Failed to set persistent_peers in $CONFIG"
  exit 1
fi
echo "  persistent_peers = $PEER"

# gRPC: move off 9090/9091. The listener binds before any logging, so an
# EADDRINUSE there cancels the shared context and silently kills the REST API.
if grep -q '^\[grpc\]' "$APP"; then
  "${SED_I[@]}" "/^\[grpc\]/,/^\[/ s|^address = .*|address = \"$GRPC_ADDR\"|" "$APP"
  echo "  grpc.address = $GRPC_ADDR"
fi

if $ENABLE_API; then
  "${SED_I[@]}" "/^\[api\]/,/^\[/ { s/^enable = .*/enable = true/; s|^address = .*|address = \"tcp://127.0.0.1:1317\"| }" "$APP"
  echo "  api.enable   = true (127.0.0.1:1317)"
fi
echo ""

# --- Summary / start --------------------------------------------------------
echo "=== Setup complete ==="
# show-node-id prints to stderr, hence 2>&1
echo "Node id:    $("$BINARY" tendermint show-node-id --home="$NODE_HOME" 2>&1)"
echo "Home:       $NODE_HOME"
echo ""
echo "Start the node:"
echo "  $BINARY start --home=$NODE_HOME --minimum-gas-prices=0.01umal"
echo ""
echo "Verify sync (height should climb every ~5-6s):"
echo "  curl -s http://127.0.0.1:26657/status | jq '.result.sync_info.latest_block_height'"
echo ""
echo "If other nodes should dial THIS node, set external_address in"
echo "$CONFIG to a routable IP."

if $START_NODE; then
  echo ""
  echo "Starting node (Ctrl+C to stop)..."
  exec "$BINARY" start \
    --home="$NODE_HOME" \
    --minimum-gas-prices="0.01umal"
fi
