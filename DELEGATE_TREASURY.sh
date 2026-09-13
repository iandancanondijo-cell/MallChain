#!/bin/bash
# Bonds (delegates) some of the treasury's `stake` to a validator — the
# one-time bootstrap step that turns the treasury into a real, ongoing
# source of stake in production (see backend/src/utils/staking.js's header
# comment: this chain mints new stake every block and pays it to
# delegators as staking rewards; backend/src/jobs/treasuryRewardsSweeper.js
# then claims those rewards automatically, forever, with no further human
# action needed).
#
# Deliberately NOT automatic like FUND_TREASURY.sh/the stake watcher — how
# much to lock up is a real financial decision (delegated stake isn't
# spendable until unbonded), so this stays something a human runs
# explicitly.
#
# Usage:
#   ./DELEGATE_TREASURY.sh --amount=500000
#   ./DELEGATE_TREASURY.sh --amount=500000 --validator=mallvaloper1...
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== DELEGATE TREASURY ==="
echo ""

cd "${REPO_DIR}/backend"
node scripts/delegate-treasury.js "$@"
