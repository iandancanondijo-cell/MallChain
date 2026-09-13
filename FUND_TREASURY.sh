#!/bin/bash
# Top-up the treasury wallet's `stake` (gas/fee denom — NOT mlc/mallcoin)
# balance. Thin wrapper around backend/scripts/fund-treasury.js so this is
# reachable the same way START_ALL.sh/STOP_ALL.sh are, without needing to
# remember which directory the actual script lives in.
#
# Usage:
#   ./FUND_TREASURY.sh                       (default: 5,000,000 stake from the devnet faucet wallet)
#   ./FUND_TREASURY.sh --amount=1000000
#   ./FUND_TREASURY.sh --from-mnemonic-env=SOME_ENV_VAR
#
# See docs/runbooks/11-operator-stake-depleted.md for when/why you'd run
# this — normally only in response to a TreasuryWalletStakeLow alert, or
# when jobs/operatorStakeWatcher.js reports operator_stake_topup_total with
# status="treasury_insufficient".
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== FUND TREASURY ==="
echo ""

cd "${REPO_DIR}/backend"
node scripts/fund-treasury.js "$@"
