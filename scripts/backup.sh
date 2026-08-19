#!/bin/bash
# backup.sh — Back up MongoDB (all off-chain state: users, KYC, escrow
# records, audit logs, withdrawal requests, etc.) and the chain data
# directory (all on-chain state, including x/vault's KV store — vault
# signer shares/state live in the same multistore as every other module, so
# a chain-data backup covers them; there is no separate vault backup step).
#
# Usage:
#   ./scripts/backup.sh [backup-name]
#
# Env vars:
#   MONGO_URI     - defaults to backend's configured URI (mongodb://localhost:27017/marketplace)
#   BACKUP_ROOT    - where backups are written (default: ./backups)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_HOME="${REPO_DIR}/blockchain_working"
BACKUP_ROOT="${BACKUP_ROOT:-${REPO_DIR}/backups}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/marketplace}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${1:-$TIMESTAMP}"
DEST="${BACKUP_ROOT}/${NAME}"

echo "=== Mallchain Backup: ${NAME} ==="

if [[ -e "$DEST" ]]; then
  echo "ERROR: backup destination already exists: $DEST" >&2
  exit 1
fi
mkdir -p "$DEST"

# --- Chain data: refuse a hot copy of a running node's LevelDB files ---
# unless explicitly forced, since a copy taken while the DB is being
# written to can be internally inconsistent and unrestoreable.
if pgrep -f "marketplaced start" >/dev/null 2>&1; then
  if [[ "${FORCE_HOT_BACKUP:-}" != "true" ]]; then
    echo "ERROR: marketplaced is running. Stop the node first (safe, consistent backup)," >&2
    echo "       or re-run with FORCE_HOT_BACKUP=true to accept the risk of an inconsistent" >&2
    echo "       chain-data snapshot (never do this for a backup you intend to actually restore)." >&2
    rmdir "$DEST" 2>/dev/null || true
    exit 1
  fi
  echo "WARNING: marketplaced is running; taking a hot (potentially inconsistent) chain-data copy." >&2
fi

if [[ -d "$CHAIN_HOME/data" ]]; then
  echo "Backing up chain data (${CHAIN_HOME}) — includes every module's state, including x/vault's KV store..."
  tar czf "${DEST}/chain-data.tar.gz" -C "$(dirname "$CHAIN_HOME")" "$(basename "$CHAIN_HOME")"
  echo "  -> ${DEST}/chain-data.tar.gz"
else
  echo "WARNING: no chain data directory found at ${CHAIN_HOME}/data — skipping chain backup." >&2
fi

# --- MongoDB ---
if command -v mongodump >/dev/null 2>&1; then
  echo "Backing up MongoDB (${MONGO_URI})..."
  mongodump --uri="$MONGO_URI" --out="${DEST}/mongo" --quiet
  echo "  -> ${DEST}/mongo"
else
  echo "ERROR: mongodump not found on PATH — install the MongoDB Database Tools." >&2
  exit 1
fi

cat > "${DEST}/MANIFEST.json" <<EOF
{
  "name": "${NAME}",
  "createdAt": "${TIMESTAMP}",
  "mongoUri": "${MONGO_URI}",
  "chainHome": "${CHAIN_HOME}",
  "hotChainBackup": $( [[ "${FORCE_HOT_BACKUP:-}" == "true" ]] && echo true || echo false )
}
EOF

echo ""
echo "Backup complete: ${DEST}"
echo "Restore with: ./scripts/restore.sh ${NAME}"
