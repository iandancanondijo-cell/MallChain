#!/usr/bin/env bash
set -euo pipefail

# sequence_tx_batch.sh
# Runs a small sequence of buy/sell txs while querying the account sequence
# between txs to avoid account-sequence mismatches. If EXPECT_PASSPHRASE is
# set in the environment, the script will supply it to the CLI using `expect`.

CLI=${CLI:-/home/avasta/go/bin/marketplaced}
HOME_DIR=${HOME_DIR:-/tmp/mpnode}
KEYRING_DIR=${KEYRING_DIR:-/tmp/mp-keyring}
NODE=${NODE:-http://localhost:26657}
ADDR=${ADDR:-mp19zq8zuld8crwlxslm3yx0e7qmgt259myt2363g}
KEYRING_BACKEND=${KEYRING_BACKEND:-file}
CHAIN_ID=${CHAIN_ID:-marketplace}

expect_passphrase() {
  # $1 is the full command to spawn
  if ! command -v expect >/dev/null 2>&1; then
    echo "expect not installed; cannot supply passphrase non-interactively" >&2
    return 1
  fi
  local cmd=$1
  expect -c "spawn $cmd\nexpect {\n  -re \"Enter keyring passphrase.*:\" { send \"${EXPECT_PASSPHRASE}\\r\"; exp_continue }\n  eof\n}\n"
}

get_sequence() {
  # Query the account and extract sequence (robust to plain text output)
  local out
  out=$($CLI query auth account "$ADDR" --home "$HOME_DIR" 2>/dev/null || true)
  # Try JSON first
  if echo "$out" | grep -q '"sequence"'; then
    echo "$out" | sed -n 's/.*"sequence"\s*:\s*"\([0-9]*\)".*/\1/p' | head -n1
    return
  fi
  # Fallback to YAML-like parsing
  echo "$out" | grep 'sequence:' | head -n1 | awk '{print $2}' | tr -d '"'
}

send_tx() {
  local verb=$1
  local amt=$2
  local seq
  seq=$(get_sequence)
  if [ -z "$seq" ]; then
    echo "failed to get account sequence" >&2
    return 1
  fi
  echo "Sending $verb $amt (sequence=$seq)"

  local txcmd="$CLI tx mlcoin ${verb}-mallcoin --mlcn-amount ${amt} --from testkey --chain-id ${CHAIN_ID} --home ${HOME_DIR} --keyring-backend ${KEYRING_BACKEND} --keyring-dir ${KEYRING_DIR} --node ${NODE} --sequence ${seq} -y"

  if [ -n "${EXPECT_PASSPHRASE:-}" ]; then
    expect_passphrase "$txcmd"
  else
    eval "$txcmd"
  fi
}

main() {
  # Sequence of trades: buy 2000, buy 1500, sell 1000, sell 500
  send_tx buy 2000 || true
  sleep 1
  send_tx buy 1500 || true
  sleep 1
  send_tx sell 1000 || true
  sleep 1
  send_tx sell 500 || true
  sleep 1

  echo "--- market price (final) ---"
  $CLI query mlcoin get-market-price --home "$HOME_DIR" || true
  echo "--- trade history (final) ---"
  $CLI query mlcoin get-trade-history --home "$HOME_DIR" || true
}

main "$@"
