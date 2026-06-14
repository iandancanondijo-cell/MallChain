#!/usr/bin/env bash
set -euo pipefail

# benchmark_tx_generator.sh
# Simple sequential tx generator for load testing. Use multiple accounts or
# parallel instances to increase concurrency. This script sends COUNT
# transactions sequentially from a single account, querying sequence before
# each tx to avoid mismatches.
#
# Usage:
#   ./scripts/benchmark_tx_generator.sh --count 100 --mlcn 10 --home /tmp/mpnode
#   EXPECT_PASSPHRASE=... ./scripts/benchmark_tx_generator.sh --count 1000 --mlcn 1

CLI=${CLI:-/home/avasta/go/bin/marketplaced}
HOME_DIR=${HOME_DIR:-/tmp/mpnode}
KEYRING_DIR=${KEYRING_DIR:-/tmp/mp-keyring}
ADDR=${ADDR:-mp19zq8zuld8crwlxslm3yx0e7qmgt259myt2363g}
COUNT=100
MLCN=1
KEYRING_BACKEND=${KEYRING_BACKEND:-file}
CHAIN_ID=${CHAIN_ID:-marketplace}

usage(){
  cat <<EOF
Usage: $0 [options]
Options:
  --count N       Number of transactions to send (default: $COUNT)
  --mlcn N        MLCN amount per tx (default: $MLCN)
  --home PATH     Node home (default: $HOME_DIR)
  --help          Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --count) COUNT="$2"; shift 2;;
    --mlcn) MLCN="$2"; shift 2;;
    --home) HOME_DIR="$2"; shift 2;;
    --help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

get_sequence(){
  $CLI query auth account "$ADDR" --home "$HOME_DIR" 2>/dev/null | grep -o '"sequence".*' | sed -n 's/.*"sequence"\s*:\s*"\([0-9]*\)".*/\1/p' | head -n1
}

expect_send(){
  local cmd="$1"
  if command -v expect >/dev/null 2>&1 && [ -n "${EXPECT_PASSPHRASE:-}" ]; then
    expect -c "spawn $cmd\nexpect { -re \"Enter keyring passphrase.*:\\" { send \"${EXPECT_PASSPHRASE}\\r\"; exp_continue } eof }"
  else
    eval "$cmd"
  fi
}

for i in $(seq 1 $COUNT); do
  seq=$(get_sequence)
  if [ -z "$seq" ]; then
    echo "failed to query sequence" >&2
    exit 1
  fi
  echo "[$i/$COUNT] sending buy of $MLCN (sequence=$seq)"
  cmd="$CLI tx mlcoin buy-mallcoin --mlcn-amount $MLCN --from testkey --chain-id $CHAIN_ID --home $HOME_DIR --keyring-backend $KEYRING_BACKEND --keyring-dir $KEYRING_DIR --node http://localhost:26657 --sequence $seq -y"
  expect_send "$cmd" || true
  # small delay to let node process; tune for your environment
  sleep 0.05
done

echo "Done. Use queries to inspect market price and trade history."
