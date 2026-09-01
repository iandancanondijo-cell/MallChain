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
#   MONGO_URI            - defaults to backend's configured URI (mongodb://localhost:27017/marketplace)
#   BACKUP_ROOT           - where backups are written (default: ./backups)
#   BACKUP_GPG_RECIPIENT  - if set, encrypt each tarball with `gpg --encrypt
#                           --recipient` for this key (email or key ID) and
#                           delete the plaintext tarball. Unset = plaintext
#                           tarballs only (fine for a local/dev drill, not for
#                           anything leaving this machine).
#   BACKUP_OFFSITE_URI    - if set, upload the finished backup directory
#                           offsite: an s3://bucket/prefix URI uses the AWS
#                           CLI, a gs://bucket/prefix URI uses gsutil. Unset =
#                           local-only backup (single point of failure if
#                           this disk is lost).
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
#
# `marketplaced export` was evaluated as a possible safe alternative (it
# produces a consistent JSON state dump without a raw file copy) — tested
# live against a running node and confirmed it fails identically to a raw
# copy would ("resource temporarily unavailable": the same underlying
# on-disk store file lock a concurrent copy would hit). There is no
# scriptable way around this for a single node; the two real options are:
#   (1) stop the node for this backup (safe, what this script requires by
#       default), or
#   (2) run a SECOND full node dedicated to backups (not a validator, so
#       stopping it briefly on a schedule has no consensus impact) and back
#       that one up instead — the standard production answer, but it's an
#       infrastructure decision (a node to provision) rather than a change
#       this script can make on its own.
if pgrep -f "marketplaced start" >/dev/null 2>&1; then
  if [[ "${FORCE_HOT_BACKUP:-}" != "true" ]]; then
    echo "ERROR: marketplaced is running. Stop the node first (safe, consistent backup)," >&2
    echo "       or re-run with FORCE_HOT_BACKUP=true to accept the risk of an inconsistent" >&2
    echo "       chain-data snapshot (never do this for a backup you intend to actually restore)." >&2
    echo "       For zero-downtime backups going forward, run a second non-validating full node" >&2
    echo "       dedicated to backups and point this script at ITS chain-data directory instead —" >&2
    echo "       see the comment above this check for why a live export/copy of this node can't work." >&2
    rmdir "$DEST" 2>/dev/null || true
    exit 1
  fi
  echo "WARNING: marketplaced is running; taking a hot (potentially inconsistent) chain-data copy." >&2
fi

# Encrypts $1 in place (replacing it with $1.gpg) when BACKUP_GPG_RECIPIENT
# is set. A backup that never leaves this machine can skip this, but
# anything handed to BACKUP_OFFSITE_URI below must not go up in plaintext.
encrypt_if_configured() {
  local file="$1"
  if [[ -z "${BACKUP_GPG_RECIPIENT:-}" ]]; then
    return
  fi
  if ! command -v gpg >/dev/null 2>&1; then
    echo "ERROR: BACKUP_GPG_RECIPIENT is set but gpg is not on PATH." >&2
    exit 1
  fi
  gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "${file}.gpg" "$file"
  rm -f "$file"
  echo "  -> encrypted for ${BACKUP_GPG_RECIPIENT}: ${file}.gpg"
}

if [[ -d "$CHAIN_HOME/data" ]]; then
  echo "Backing up chain data (${CHAIN_HOME}) — includes every module's state, including x/vault's KV store..."
  tar czf "${DEST}/chain-data.tar.gz" -C "$(dirname "$CHAIN_HOME")" "$(basename "$CHAIN_HOME")"
  echo "  -> ${DEST}/chain-data.tar.gz"
  encrypt_if_configured "${DEST}/chain-data.tar.gz"
else
  echo "WARNING: no chain data directory found at ${CHAIN_HOME}/data — skipping chain backup." >&2
fi

# --- MongoDB ---
if command -v mongodump >/dev/null 2>&1; then
  echo "Backing up MongoDB (${MONGO_URI})..."
  mongodump --uri="$MONGO_URI" --out="${DEST}/mongo" --quiet
  # Packed into a single tarball (rather than left as a directory tree) so
  # there's exactly one artifact per component to encrypt and ship offsite,
  # matching chain-data.tar.gz.
  tar czf "${DEST}/mongo.tar.gz" -C "$DEST" mongo
  rm -rf "${DEST}/mongo"
  echo "  -> ${DEST}/mongo.tar.gz"
  encrypt_if_configured "${DEST}/mongo.tar.gz"
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
  "hotChainBackup": $( [[ "${FORCE_HOT_BACKUP:-}" == "true" ]] && echo true || echo false ),
  "encrypted": $( [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]] && echo true || echo false )
}
EOF

echo ""
echo "Backup complete: ${DEST}"
echo "Restore with: ./scripts/restore.sh ${NAME}"

# --- Offsite upload ---
if [[ -n "${BACKUP_OFFSITE_URI:-}" ]]; then
  if [[ -z "${BACKUP_GPG_RECIPIENT:-}" ]]; then
    echo "WARNING: uploading offsite without BACKUP_GPG_RECIPIENT set — backup contents (KYC docs, user PII) will leave this machine in plaintext." >&2
  fi

  case "$BACKUP_OFFSITE_URI" in
    s3://*)
      if ! command -v aws >/dev/null 2>&1; then
        echo "ERROR: BACKUP_OFFSITE_URI is an s3:// URI but the AWS CLI is not on PATH." >&2
        exit 1
      fi
      echo "Uploading to ${BACKUP_OFFSITE_URI%/}/${NAME} ..."
      aws s3 cp "$DEST" "${BACKUP_OFFSITE_URI%/}/${NAME}" --recursive
      ;;
    gs://*)
      if ! command -v gsutil >/dev/null 2>&1; then
        echo "ERROR: BACKUP_OFFSITE_URI is a gs:// URI but gsutil is not on PATH." >&2
        exit 1
      fi
      echo "Uploading to ${BACKUP_OFFSITE_URI%/}/${NAME} ..."
      gsutil -m cp -r "$DEST" "${BACKUP_OFFSITE_URI%/}/${NAME}"
      ;;
    *)
      echo "ERROR: BACKUP_OFFSITE_URI must start with s3:// or gs:// (got: ${BACKUP_OFFSITE_URI})" >&2
      exit 1
      ;;
  esac
  echo "Offsite upload complete."
fi
