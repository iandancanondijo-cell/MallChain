#!/bin/bash
# survey-routes.sh — authenticated GET survey against the local backend.
#
#   ./scripts/login-local.sh               # writes /tmp/mc.cookies + /tmp/mc.csrf
#   ./scripts/survey-routes.sh /api/health /api/admin/dashboard ...
#
# Prints "<code> <path>" and, for anything that is not 2xx/401-as-expected,
# the first 200 bytes of the response body, because the difference between
# `Cannot GET /api/x` (route missing = wrong checkout is serving) and
# `500` (route exists, handler threw) is the whole point of running this.
#
# Requests sleep 120ms apart: the anonymous per-IP limiter in
# backend/src/middleware/rateLimiter.js allows 300 requests / 15 min, and a
# burst that trips it turns a passing route into a fake 429 failure.
set -u
BASE=${BASE:-http://localhost:4000}
JAR=${JAR:-/tmp/mc.cookies}
CSRF=$(cat /tmp/mc.csrf 2>/dev/null || true)
[ $# -gt 0 ] || { echo "usage: $0 <path> [<path> ...]" >&2; exit 2; }
tmp=$(mktemp)
for p in "$@"; do
  code=$(curl -s -o "$tmp" -w '%{http_code}' --max-time 25 -b "$JAR" -c "$JAR" \
    ${CSRF:+-H "X-CSRF-Token: $CSRF"} "$BASE$p")
  case "$code" in
    2*|3*) printf '%-4s %s\n' "$code" "$p" ;;
    *)     printf '%-4s %-52s %s\n' "$code" "$p" "$(head -c 200 "$tmp" | tr -d '\n' | tr -s ' ')" ;;
  esac
  sleep 0.12
done
rm -f "$tmp"
