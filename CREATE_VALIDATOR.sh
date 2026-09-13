#!/bin/bash
# Registers a new validator on this chain (MsgCreateValidator). Requires a
# synced marketplaced node already running (for its priv_validator_key.json)
# and a funded account mnemonic to self-delegate from.
#
# Usage:
#   ./CREATE_VALIDATOR.sh \
#     --priv-validator-key-file=blockchain_working/config/priv_validator_key.json \
#     --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
#     --moniker="My Validator" \
#     --amount=1000000
#
# See docs/user-guides/09-become-a-validator.md for the full walkthrough.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== CREATE VALIDATOR ==="
echo ""

cd "${REPO_DIR}/backend"
node scripts/create-validator.js "$@"
