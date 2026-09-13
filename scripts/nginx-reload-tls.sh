#!/bin/bash
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN environment variable must be set}"
LE_LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"
NGINX_SSL_DIR="/etc/nginx/ssl"
FULLCHAIN_DST="${NGINX_SSL_DIR}/fullchain.pem"
PRIVKEY_DST="${NGINX_SSL_DIR}/privkey.pem"

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo "[pre-flight] Running pre-flight checks..."

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root" >&2
  exit 1
fi
echo "[pre-flight] Running as root: ok"

command -v certbot >/dev/null 2>&1 || { echo "ERROR: certbot is required but not installed" >&2; exit 1; }
echo "[pre-flight] certbot: ok"

command -v nginx >/dev/null 2>&1 || { echo "ERROR: nginx is required but not installed" >&2; exit 1; }
echo "[pre-flight] nginx: ok"

command -v systemctl >/dev/null 2>&1 || { echo "ERROR: systemctl is required but not installed" >&2; exit 1; }
echo "[pre-flight] systemctl: ok"

if ! getent group nginx >/dev/null 2>&1; then
  echo "ERROR: nginx group does not exist" >&2
  exit 1
fi
echo "[pre-flight] nginx group: ok"

if [[ ! -d "${LE_LIVE_DIR}" ]]; then
  echo "WARNING: Let's Encrypt live dir ${LE_LIVE_DIR} does not exist yet — first cert issuance will create it."
fi

if [[ ! -d "${NGINX_SSL_DIR}" ]]; then
  echo "[pre-flight] Creating nginx SSL directory ${NGINX_SSL_DIR}..."
  mkdir -p "${NGINX_SSL_DIR}"
  chown root:nginx "${NGINX_SSL_DIR}"
  chmod 750 "${NGINX_SSL_DIR}"
fi
echo "[pre-flight] nginx SSL dir: ok"

echo "[pre-flight] All checks passed."

# -----------------------------------------------------------------------------
# Certbot renew with deploy hook
# -----------------------------------------------------------------------------
deploy_hook() {
  echo "[deploy-hook] Deploying renewed certificates for ${DOMAIN}..."

  cp -f "${LE_LIVE_DIR}/fullchain.pem" "${FULLCHAIN_DST}"
  cp -f "${LE_LIVE_DIR}/privkey.pem"  "${PRIVKEY_DST}"

  chmod 600 "${FULLCHAIN_DST}" "${PRIVKEY_DST}"
  chown root:nginx "${FULLCHAIN_DST}" "${PRIVKEY_DST}"
  echo "[deploy-hook] Certificates copied with mode 600, owner root:nginx."

  echo "[deploy-hook] Running nginx config test..."
  nginx -t

  echo "[deploy-hook] Reloading nginx via systemctl..."
  systemctl reload nginx

  echo "[deploy-hook] Deploy complete."
}

export -f deploy_hook
export DOMAIN LE_LIVE_DIR NGINX_SSL_DIR FULLCHAIN_DST PRIVKEY_DST

echo "[certbot] Running certbot renew with deploy-hook for ${DOMAIN}..."
certbot renew \
  --deploy-hook "bash -c 'source <(declare -f deploy_hook); deploy_hook'" \
  --non-interactive

echo "[certbot] Renewal finished."

# -----------------------------------------------------------------------------
# Ensure certs are in place even on first run / no-op renewal
# -----------------------------------------------------------------------------
if [[ -f "${LE_LIVE_DIR}/fullchain.pem" && -f "${LE_LIVE_DIR}/privkey.pem" ]]; then
  if [[ ! -f "${FULLCHAIN_DST}" || ! -f "${PRIVKEY_DST}" ]]; then
    echo "[nginx] Initial cert copy (no renewal was needed)..."
    cp -f "${LE_LIVE_DIR}/fullchain.pem" "${FULLCHAIN_DST}"
    cp -f "${LE_LIVE_DIR}/privkey.pem"  "${PRIVKEY_DST}"
    chmod 600 "${FULLCHAIN_DST}" "${PRIVKEY_DST}"
    chown root:nginx "${FULLCHAIN_DST}" "${PRIVKEY_DST}"
    nginx -t
    systemctl reload nginx
    echo "[nginx] Initial cert deployment complete."
  fi
fi

echo "[nginx-reload-tls] Done."
