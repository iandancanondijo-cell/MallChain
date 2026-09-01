#!/bin/bash
# verify-trusted-proxies.sh — Confirm that the deployed application's
# $TRUST_PROXY list (comma-separated CIDRs) matches the latest Cloudflare
# public IP ranges published at https://www.cloudflare.com/ips-v4 and
# https://www.cloudflare.com/ips-v6.
#
# Why:
#   Mallchain sits behind Cloudflare (WAF, DDoS protection, CDN). The
#   Node/Express backend reads the client IP from
#   `X-Forwarded-For`/`CF-Connecting-IP` and MUST accept it ONLY from a
#   Cloudflare edge IP. The ingress-nginx or API gateway configures
#   "trusted proxies" to implement this filter. If Cloudflare adds new
#   IP ranges to their published list and our config is not updated,
#   requests from those new ranges are treated as untrusted — the app
#   sees the *Cloudflare edge IP* as the client IP instead of the real
#   user's IP, which breaks rate-limiting, KYC geo, audit logs, AML
#   source-IP checks, and every other downstream consumer of client IP.
#
#   Conversely, if Cloudflare ever REMOVES a range and we don't remove
#   it, we keep trusting an IP that is no longer theirs — a (very small)
#   security widening. The script therefore checks in BOTH directions:
#   every published Cloudflare CIDR must be in TRUST_PROXY, and (optionally,
#   see STRICT mode) every CIDR in TRUST_PROXY must still be published
#   by Cloudflare.
#
# Behavior:
#   1. Download the two Cloudflare IP lists (unless --skip-update is
#      passed, in which case the cached copies in /tmp are reused).
#   2. Normalize both lists: trim leading/trailing whitespace, drop
#      blank lines and comments, sort.
#   3. Read $TRUST_PROXY, split on commas, normalize each entry
#      (trim, drop blanks), sort.
#   4. For every Cloudflare CIDR NOT present in TRUST_PROXY, print a
#      `MISMATCH` line (exit 1 at the end).
#   5. For every TRUST_PROXY CIDR NOT present in the current Cloudflare
#      list, print a `WARN` line (does NOT cause a non-zero exit on its
#      own — see STRICT_OLD below).
#
# Usage:
#   TRUST_PROXY="173.245.48.0/20,103.21.244.0/22,..." \
#     ./scripts/verify-trusted-proxies.sh
#
#   # Offline / cached mode (no HTTPS fetch — use /tmp/cloudflare-ips-*):
#   ./scripts/verify-trusted-proxies.sh --skip-update
#
# Env vars (all optional):
#   TRUST_PROXY            Comma-separated list of CIDRs (or bare IPs)
#                          the app currently trusts as source proxies.
#                          If unset, the script errors out with a clear
#                          message — CI must always pass it in.
#   STRICT_OLD             When set to a non-empty value, a CIDR that is
#                          present in TRUST_PROXY but no longer in
#                          Cloudflare's published list ALSO causes
#                          exit-code 1 (not just a WARN). Default off
#                          because Cloudflare historically deprecates
#                          ranges very slowly and the overlap window can
#                          be months — false-positive CI failures cost
#                          more than the tiny risk of over-trusting.
#   CF_IPV4_URL            Override the v4 URL (default
#                          https://www.cloudflare.com/ips-v4).
#   CF_IPV6_URL            Override the v6 URL (default
#                          https://www.cloudflare.com/ips-v6).
#   CACHE_DIR              Directory to cache downloaded lists
#                          (default: /tmp).
set -euo pipefail

# ---------------------------------------------------------------------
# Defaults and flag parsing
# ---------------------------------------------------------------------

SKIP_UPDATE=0
if [ "${1:-}" = "--skip-update" ]; then
  SKIP_UPDATE=1
  shift
fi

CF_IPV4_URL="${CF_IPV4_URL:-https://www.cloudflare.com/ips-v4}"
CF_IPV6_URL="${CF_IPV6_URL:-https://www.cloudflare.com/ips-v6}"
CACHE_DIR="${CACHE_DIR:-/tmp}"
STRICT_OLD="${STRICT_OLD:-}"

CACHE_V4="${CACHE_DIR}/cloudflare-ips-v4"
CACHE_V6="${CACHE_DIR}/cloudflare-ips-v6"

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

log_info()  { echo "INFO:  $*"; }
log_warn()  { echo "WARN:  $*"; }
log_mismatch() { echo "MISMATCH: $*"; }
log_error() { echo "ERROR: $*" >&2; }

# normalize_cidrs <file-or-stdin>: trim each line, drop blanks and
# lines starting with '#', sort. Accepts either a file argument or
# stdin (via pipe / heredoc).
normalize_cidrs() {
  local src="${1:--}"
  # shellcheck disable=SC2002
  cat "$src" \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$' \
    | grep -v '^#' \
    | sort -u
}

# contains_element <needle> <haystack-file>: returns 0 if the exact
# trimmed string <needle> appears as a line in <haystack-file>
# (haystack-file must already be normalized).
contains_element() {
  local needle="$1"
  local haystack="$2"
  grep -Fxq -- "$needle" "$haystack"
}

# ---------------------------------------------------------------------
# Step 0: Validate that TRUST_PROXY is set
# ---------------------------------------------------------------------

if [ -z "${TRUST_PROXY:-}" ]; then
  log_error "TRUST_PROXY environment variable is not set."
  log_error "Expected a comma-separated list of CIDRs the app currently trusts as proxy sources."
  log_error "Example: TRUST_PROXY=\"173.245.48.0/20,103.21.244.0/22,2a06:98c0::/29\" ./scripts/verify-trusted-proxies.sh"
  exit 2
fi

# ---------------------------------------------------------------------
# Step 1: Fetch / read Cloudflare IP lists
# ---------------------------------------------------------------------

mkdir -p "$CACHE_DIR"

download_one() {
  local url="$1"
  local dest="$2"
  local label="$3"
  log_info "Fetching ${label} list: ${url}"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --output "$dest" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=3 --timeout=30 --output-document="$dest" "$url"
  else
    log_error "Neither curl nor wget is available on PATH — cannot download Cloudflare IP lists."
    log_error "Install one of them, or re-run with --skip-update after manually placing:"
    log_error "  ${CACHE_V4}"
    log_error "  ${CACHE_V6}"
    exit 2
  fi
  if [ ! -s "$dest" ]; then
    log_error "Download of ${label} list produced an empty file: ${dest} (url=${url})"
    exit 2
  fi
}

if [ "$SKIP_UPDATE" -eq 1 ]; then
  log_info "--skip-update set: reusing cached Cloudflare IP lists from ${CACHE_DIR}"
  if [ ! -f "$CACHE_V4" ] || [ ! -s "$CACHE_V4" ]; then
    log_error "Cached v4 list ${CACHE_V4} is missing or empty — run once without --skip-update to seed the cache."
    exit 2
  fi
  if [ ! -f "$CACHE_V6" ] || [ ! -s "$CACHE_V6" ]; then
    log_error "Cached v6 list ${CACHE_V6} is missing or empty — run once without --skip-update to seed the cache."
    exit 2
  fi
else
  download_one "$CF_IPV4_URL" "$CACHE_V4" "IPv4"
  download_one "$CF_IPV6_URL" "$CACHE_V6" "IPv6"
fi

# Normalize both files into sorted, de-duplicated temp files.
NORM_CF_V4="$(mktemp)"
NORM_CF_V6="$(mktemp)"
NORM_CF_ALL="$(mktemp)"
NORM_TRUST="$(mktemp)"
trap 'rm -f "$NORM_CF_V4" "$NORM_CF_V6" "$NORM_CF_ALL" "$NORM_TRUST"' EXIT

normalize_cidrs "$CACHE_V4" > "$NORM_CF_V4"
normalize_cidrs "$CACHE_V6" > "$NORM_CF_V6"
cat "$NORM_CF_V4" "$NORM_CF_V6" | sort -u > "$NORM_CF_ALL"

log_info "Cloudflare published IPv4 CIDRs: $(wc -l < "$NORM_CF_V4")"
log_info "Cloudflare published IPv6 CIDRs: $(wc -l < "$NORM_CF_V6")"
log_info "Cloudflare published total :     $(wc -l < "$NORM_CF_ALL")"

# ---------------------------------------------------------------------
# Step 2: Normalize TRUST_PROXY (comma-separated -> one-per-line, sorted)
# ---------------------------------------------------------------------

# TRUST_PROXY is a comma-separated string. Use awk to split on commas
# and print one per line (which we then pipe through the same normalizer
# we apply to the Cloudflare files).
awk -v RS=',' '{ print }' <<<"$TRUST_PROXY" \
  | normalize_cidrs \
  > "$NORM_TRUST"

log_info "TRUST_PROXY unique entries:      $(wc -l < "$NORM_TRUST")"

# ---------------------------------------------------------------------
# Step 3: Compare — published Cloudflare CIDRs vs TRUST_PROXY
#
# Direction A (hard error): every published Cloudflare CIDR MUST be
#   present in TRUST_PROXY. If any is missing, ingress will fail to
#   trust packets from that range → client IPs wrong → KYC/rate limit
#   /audit-log / AML breakage.
#
# Direction B (warn, optional strict): CIDRs in TRUST_PROXY that are
#   no longer published by Cloudflare are probably stale. We warn about
#   them so an operator can clean up, but by default we do NOT fail CI
#   on them — Cloudflare keeps old ranges routable for long transition
#   windows, and the security risk of "we still trust a CIDR that was
#   once Cloudflare's but is now unannounced" is minimal compared to
#   the operational cost of spurious CI failures. Set STRICT_OLD=1 to
#   flip direction B to a hard error.
# ---------------------------------------------------------------------

MISMATCH_COUNT=0
WARN_STALE_COUNT=0

log_info ""
log_info "--- Checking published Cloudflare CIDRs vs TRUST_PROXY (direction A: must all be present) ---"
while IFS= read -r cf_cidr; do
  [ -z "$cf_cidr" ] && continue
  if ! contains_element "$cf_cidr" "$NORM_TRUST"; then
    log_mismatch "Cloudflare CIDR ${cf_cidr} is MISSING from TRUST_PROXY — ingress will NOT trust traffic from this range (client IPs will be wrong)."
    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))
  fi
done < "$NORM_CF_ALL"

log_info ""
log_info "--- Checking TRUST_PROXY vs current Cloudflare list (direction B: stale entries are warnings) ---"
while IFS= read -r trust_cidr; do
  [ -z "$trust_cidr" ] && continue
  if ! contains_element "$trust_cidr" "$NORM_CF_ALL"; then
    log_warn "TRUST_PROXY entry ${trust_cidr} is NO LONGER in Cloudflare's published list — it may be stale and should be audited."
    WARN_STALE_COUNT=$((WARN_STALE_COUNT + 1))
  fi
done < "$NORM_TRUST"

# ---------------------------------------------------------------------
# Step 4: Report / exit
# ---------------------------------------------------------------------

log_info ""
log_info "=== Summary ==="
log_info "Cloudflare published CIDRs: $(wc -l < "$NORM_CF_ALL") (v4: $(wc -l < "$NORM_CF_V4"), v6: $(wc -l < "$NORM_CF_V6"))"
log_info "TRUST_PROXY entries:         $(wc -l < "$NORM_TRUST")"
log_info "Missing from TRUST_PROXY:    ${MISMATCH_COUNT}"
log_info "Stale in TRUST_PROXY:        ${WARN_STALE_COUNT}"

EXIT_CODE=0
if [ "$MISMATCH_COUNT" -gt 0 ]; then
  log_error "${MISMATCH_COUNT} Cloudflare CIDR(s) are missing from TRUST_PROXY."
  log_error "Update TRUST_PROXY (typically in your ingress-nginx ConfigMap, Node.js app.trust proxy config, or equivalent) to include every CIDR listed above as MISMATCH."
  EXIT_CODE=1
fi

if [ "$WARN_STALE_COUNT" -gt 0 ] && [ -n "$STRICT_OLD" ]; then
  log_error "${WARN_STALE_COUNT} stale TRUST_PROXY CIDR(s) and STRICT_OLD is set — treating as hard error."
  EXIT_CODE=1
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  log_info "All checks passed."
fi

exit "$EXIT_CODE"
