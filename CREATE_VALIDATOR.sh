#!/bin/bash
# CREATE_VALIDATOR.sh — register a new validator on the mallchain-1 chain
# (MsgCreateValidator, x/staking, bond denom: stake).
#
# WHAT IT DOES
#   Wraps backend/scripts/create-validator.js (cosmjs). It reads your node's
#   consensus pubkey straight from priv_validator_key.json — because this
#   marketplaced binary has NO tx/query CLI and `comet show-validator`
#   panics — then signs and broadcasts MsgCreateValidator from a funded
#   account's mnemonic (that account becomes the operator; its address
#   re-encoded as mallvaloper1... is the validator address).
#
# PREREQUISITES
#   1. A fully SYNCED node (this script refuses to run against one catching up).
#   2. A funded account mnemonic, passed via an ENV VAR NAME — never put the
#      mnemonic itself on the command line (it would leak into shell history
#      and `ps`).
#   3. Run from a repository clone (needs backend/node_modules with cosmjs).
#      Inside a standalone node bundle, clone the repo (or `npm ci` cosmjs in
#      backend/) and run this script from the repo root.
#
# USAGE
#   ./CREATE_VALIDATOR.sh \
#     --priv-validator-key-file=<home>/config/priv_validator_key.json \
#     --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
#     --moniker="My Validator" \
#     --amount=1000000
#   Optional passthrough: --commission-rate=0.10 --commission-max-rate=0.20
#     --commission-max-change-rate=0.01 --min-self-delegation=1
#     --website=... --identity=... --details=...
#   Node selection (defaults match a local node): CHAIN_RPC env
#     (default http://127.0.0.1:26657) and CHAIN_REST (…:1317).
#
# IDEMPOTENCY / SAFETY CHECKS (added 2026-10-31)
#   * consensus key file must exist and contain pub_key.value
#   * mnemonic env var must be set (value never printed)
#   * node must be reachable AND not catching up
#   * if a validator with YOUR consensus pubkey already exists, stops with
#     an explanatory message instead of wasting a tx (MsgCreateValidator is
#     not an upsert — a second one for the same pubkey fails on-chain anyway)
#
# Staking params this chain is configured with (verified live, /cosmos/staking/
# v1beta1/params): bond_denom=stake, min_commission_rate=0, max_validators=100,
# unbonding_time=21 days. --amount is in stake (integers here; see
# docs/user-guides/09-become-a-validator.md before that).
# Full walkthrough: docs/user-guides/09-become-a-validator.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# locate the repo root (script sits at root normally; in a bundle it sits at
# the bundle root with no backend/ next to it)
REPO_DIR=""
for d in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$PWD"; do
  if [[ -f "$d/backend/scripts/create-validator.js" ]]; then REPO_DIR="$d"; break; fi
done
if [[ -z "$REPO_DIR" ]]; then
  echo "ERROR: could not find backend/scripts/create-validator.js near this" >&2
  echo "script. Validator creation uses cosmjs from the repo clone:" >&2
  echo "  git clone <mallchain repo> && cd <repo> && (cd backend && npm ci)" >&2
  echo "then run ./CREATE_VALIDATOR.sh from the repo root." >&2
  exit 1
fi

# --- parse just what we need for the pre-flight checks (rest is passed through)
PRIV_VAL_FILE=""
MNEMONIC_ENV=""
for arg in "$@"; do
  case "$arg" in
    --priv-validator-key-file=*) PRIV_VAL_FILE="${arg#*=}" ;;
    --from-mnemonic-env=*)       MNEMONIC_ENV="${arg#*=}" ;;
    -h|--help)                   sed -n '2,45p' "$0"; exit 0 ;;
  esac
done
[[ "$PRIV_VAL_FILE" == /* ]] || PRIV_VAL_FILE="$PWD/${PRIV_VAL_FILE#./}"

CHAIN_RPC="${CHAIN_RPC:-http://127.0.0.1:26657}"

echo "=== CREATE VALIDATOR — pre-flight ==="

[[ -n "$PRIV_VAL_FILE" && -f "$PRIV_VAL_FILE" ]] || {
  echo "ERROR: --priv-validator-key-file missing or not a file: '$PRIV_VAL_FILE'" >&2
  echo "       (your node home's config/priv_validator_key.json — created by" >&2
  echo "        gen-node-home; NOT the genesis, and never commit it)" >&2; exit 1; }
python3 -c "import json,sys;k=json.load(open('$PRIV_VAL_FILE'));assert k['pub_key']['value'],k" 2>/dev/null || {
  echo "ERROR: $PRIV_VAL_FILE has no pub_key.value — wrong/empty key file?" >&2; exit 1; }

[[ -n "$MNEMONIC_ENV" ]] || { echo "ERROR: --from-mnemonic-env=<ENV_VAR> is required" >&2; exit 1; }
[[ -n "${!MNEMONIC_ENV:-}" ]] || {
  echo "ERROR: env var \$$MNEMONIC_ENV is empty/unset. Export the mnemonic there" >&2
  echo "       first (NOT on the command line). Value is never printed." >&2; exit 1; }

# node reachable + synced?
STATUS="$(curl -s --max-time 10 "$CHAIN_RPC/status" 2>/dev/null || true)"
[[ -n "$STATUS" ]] || { echo "ERROR: no node RPC at $CHAIN_RPC (start your node, or set CHAIN_RPC)" >&2; exit 1; }
if echo "$STATUS" | grep -q '"catching_up":true'; then
  echo "ERROR: node at $CHAIN_RPC is still catching up. Wait for full sync:" >&2
  echo "  curl -s $CHAIN_RPC/status | grep -o '\"catching_up\":[a-z]*'" >&2; exit 1; fi
echo "node: reachable and synced at $CHAIN_RPC"

# idempotency: consensus pubkey already a validator?
CHAIN_REST="${CHAIN_REST:-http://127.0.0.1:1317}"
PUBKEY_B64="$(python3 -c "import json;print(json.load(open('$PRIV_VAL_FILE'))['pub_key']['value'])")"
EXISTING="$(curl -s --max-time 10 "$CHAIN_REST/cosmos/staking/v1beta1/validators?pagination.limit=200" 2>/dev/null \
  | PUBKEY_B64="$PUBKEY_B64" python3 -c "
import json,os,sys,base64
mine=base64.b64decode(os.environ['PUBKEY_B64']).hex().upper()
try: vs=json.load(sys.stdin).get('validators',[])
except Exception: sys.exit(0)
for v in vs:
    k=v.get('consensus_pubkey',{}).get('key','')
    try:
        if base64.b64decode(k).hex().upper()==mine:
            print(v['operator_address']+' | '+v.get('description',{}).get('moniker','')); break
    except Exception: pass
" 2>/dev/null || true)"
if [[ -n "$EXISTING" ]]; then
  echo "NOTHING TO DO: this consensus key is ALREADY a validator on-chain:" >&2
  echo "  $EXISTING" >&2
  echo "MsgCreateValidator would fail with 'validator already exists'. To edit" >&2
  echo "its description/commission use MsgEditValidator instead." >&2
  exit 0
fi

echo "preflight OK — submitting MsgCreateValidator"
echo ""
cd "${REPO_DIR}/backend"
exec node scripts/create-validator.js "$@"
