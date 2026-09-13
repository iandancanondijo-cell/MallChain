#!/bin/bash
set -euo pipefail

VAULT_KEYS_FILE="/tmp/vault-keys.json"
RED='\033[0;31m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo "[pre-flight] Running pre-flight checks..."

if [[ -z "${VAULT_ADDR:-}" ]]; then
  echo "ERROR: VAULT_ADDR environment variable is not set" >&2
  exit 1
fi
echo "[pre-flight] VAULT_ADDR=${VAULT_ADDR}"

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required but not installed" >&2; exit 1; }
echo "[pre-flight] curl: ok"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required but not installed" >&2; exit 1; }
echo "[pre-flight] jq: ok"

command -v vault >/dev/null 2>&1 || { echo "ERROR: vault CLI is required but not installed" >&2; exit 1; }
echo "[pre-flight] vault CLI: ok"

for i in $(seq 1 20); do
  if curl -fsS "${VAULT_ADDR}/v1/sys/health" >/dev/null 2>&1 || \
     curl -fsS "${VAULT_ADDR}/v1/sys/init" >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == 20 ]]; then
    echo "ERROR: Vault at ${VAULT_ADDR} is not reachable after 20 attempts" >&2
    exit 1
  fi
  sleep 3
done
echo "[pre-flight] Vault endpoint reachable"

# -----------------------------------------------------------------------------
# Check init status
# -----------------------------------------------------------------------------
echo "[vault] Checking Vault initialization status..."
INIT_STATUS=$(curl -fsS "${VAULT_ADDR}/v1/sys/init" | jq -r .initialized)

if [[ "${INIT_STATUS}" == "true" ]]; then
  echo "[vault] Vault is already initialized. Exiting."
  exit 0
fi

echo "[vault] Vault is not initialized. Proceeding with init..."

# -----------------------------------------------------------------------------
# Initialize Vault
# -----------------------------------------------------------------------------
echo "[vault] Initializing Vault with 5 secret shares / 3 threshold..."
curl -fsS \
  --request POST \
  --data '{"secret_shares": 5, "secret_threshold": 3}' \
  "${VAULT_ADDR}/v1/sys/init" \
  > "${VAULT_KEYS_FILE}"

chmod 600 "${VAULT_KEYS_FILE}"
echo "[vault] Keys written to ${VAULT_KEYS_FILE} (mode 600)"

echo -e "\n${RED}================================================================================${NC}"
echo -e "${RED}  UNSEAL KEYS MUST BE MOVED OFF HOST NOW${NC}"
echo -e "${RED}  File: ${VAULT_KEYS_FILE}${NC}"
echo -e "${RED}  Distribute unseal keys to separate custodians BEFORE proceeding.${NC}"
echo -e "${RED}================================================================================${NC}\n"

# -----------------------------------------------------------------------------
# Unseal with first 3 keys
# -----------------------------------------------------------------------------
echo "[vault] Unsealing Vault using first 3 keys..."
for idx in 0 1 2; do
  KEY=$(jq -r ".unseal_keys_b64[${idx}]" "${VAULT_KEYS_FILE}")
  echo "[vault] Unseal with key #$((idx + 1))..."
  RESPONSE=$(curl -fsS \
    --request POST \
    --data "{\"key\": \"${KEY}\"}" \
    "${VAULT_ADDR}/v1/sys/unseal")
  PROGRESS=$(echo "${RESPONSE}" | jq -r .progress)
  SEALED=$(echo "${RESPONSE}" | jq -r .sealed)
  echo "[vault] progress=${PROGRESS} sealed=${SEALED}"
done

SEAL_STATUS=$(curl -fsS "${VAULT_ADDR}/v1/sys/seal-status" | jq -r .sealed)
if [[ "${SEAL_STATUS}" != "false" ]]; then
  echo "ERROR: Vault is still sealed after 3 unseal keys" >&2
  exit 1
fi
echo "[vault] Vault is unsealed."

# -----------------------------------------------------------------------------
# Export root token
# -----------------------------------------------------------------------------
VAULT_TOKEN=$(jq -r .root_token "${VAULT_KEYS_FILE}")
export VAULT_TOKEN
echo "[vault] VAULT_TOKEN exported (root token loaded from ${VAULT_KEYS_FILE})"
echo "[vault] Done."
