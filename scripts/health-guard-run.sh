#!/bin/bash
# health-guard-run.sh — cron entrypoint wrapper around health-guard.sh.
#
# Why this exists (2026-11-09 outage): the keep-alive watchdog is a Qoder
# automation, and automations can pause themselves — the stack watchdog hit its
# failure circuit breaker on 2026-11-04 and stayed disabled (enabled:false,
# pauseReason:failureCircuit) through the 2026-11-09 cold boot. The one-shot
# @reboot pass ran 30s after power-on, when the node was still replaying blocks
# and systemd had not registered the tunnel yet, so it recorded
# "FAILED chain" + "FAILED cloudflared" and nothing ever re-checked. Real users
# then hit a stack that was actually fine but unmonitored, and the owner's
# experience was "services are really down".
#
# This wrapper makes recovery independent of any single automation:
#   * runs on the OS cron, so it heals even when Qoder is paused/not running;
#   * a boot pass waits with BOOT_WAIT patience AND re-verifies after 3 minutes,
#     so a still-starting service is never reported as an outage;
#   * keeps one small, rotating, timestamped log instead of an unbounded one.
#
# Usage: health-guard-run.sh boot|cron
set -u

REPO=/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
GUARD="$REPO/scripts/health-guard.sh"

# Which checkout the API and the frontend are restarted from. This is the one
# line to change when the working branch moves: the two worktrees in this repo
# are not ancestors of each other, so a guard that keeps starting :4000 from the
# older snapshot serves code without the newer routes and every fresh feature
# looks broken (`Cannot GET /api/...`) while health still reports 200.
# See the CHAIN_ROOT/SERVICES_ROOT header in health-guard.sh — the chain binary
# and its data home deliberately stay at $REPO.
export SERVICES_ROOT=${SERVICES_ROOT:-/home/elle_bryson/Documents/mallchain-main-56caea3e}
MODE=${1:-cron}
LOG=/tmp/health-guard-$MODE.log
MAX_BYTES=2000000

rotate() {
  if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_BYTES" ]; then
    tail -c 400000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

pass() {
  local label=$1 wait=$2
  {
    echo "=== $(date -u '+%Y-%m-%d %H:%M:%SZ') health-guard $label (BOOT_WAIT=$wait) ==="
    BOOT_WAIT=$wait bash "$GUARD" 2>&1
    echo "--- exit $? ---"
  } >> "$LOG"
}

rotate
case "$MODE" in
  boot)
    sleep 30
    # First pass is patient: the chain may need minutes to open its RPC after a
    # power loss, and the tunnel takes a minute to register.
    pass "boot/pass-1" 5
    sleep 180
    # Second pass is a fast confirmation that whatever pass 1 flagged is really
    # down now, not merely still starting.
    pass "boot/pass-2" 1
    ;;
  cron)
    pass "scheduled" 1
    ;;
  *)
    echo "usage: $0 boot|cron" >&2
    exit 2
    ;;
esac
