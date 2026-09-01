#!/bin/bash
# restore.sh — Restore MongoDB and chain data from a backup created by
# backup.sh. Destructive: overwrites current chain data and drops+restores
# Mongo collections. Refuses to run unless the node is stopped and the
# caller explicitly confirms.
#
# Usage:
#   ./scripts/restore.sh <backup-name> [--yes]
#
# Transparently decrypts any *.tar.gz.gpg produced by backup.sh's
# BACKUP_GPG_RECIPIENT option (gpg must have the matching private key
# available) before restoring, and unpacks mongo.tar.gz (or falls back to a
# pre-encryption-support backup's plain mongo/ directory).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_HOME="${REPO_DIR}/blockchain_working"
BACKUP_ROOT="${BACKUP_ROOT:-${REPO_DIR}/backups}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/marketplace}"

NAME="${1:-}"
CONFIRM="${2:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <backup-name> [--yes]" >&2
  echo "" >&2
  echo "Available backups in ${BACKUP_ROOT}:" >&2
  ls -1 "$BACKUP_ROOT" 2>/dev/null >&2 || echo "  (none found)" >&2
  exit 1
fi

SRC="${BACKUP_ROOT}/${NAME}"
if [[ ! -d "$SRC" ]]; then
  echo "ERROR: backup not found: $SRC" >&2
  exit 1
fi

if pgrep -f "marketplaced start" >/dev/null 2>&1; then
  echo "ERROR: marketplaced is running. Stop the node before restoring — restoring into a" >&2
  echo "       live node's data directory will corrupt it." >&2
  exit 1
fi

echo "=== Mallchain Restore: ${NAME} ==="
echo "This will:"
echo "  - REPLACE ${CHAIN_HOME} with the contents of ${SRC}/chain-data.tar.gz"
echo "  - DROP AND RESTORE the MongoDB database at ${MONGO_URI} from ${SRC}/mongo"
echo ""

if [[ "$CONFIRM" != "--yes" ]]; then
  read -r -p "Type 'restore' to proceed: " ANSWER
  if [[ "$ANSWER" != "restore" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Decrypts $1.gpg to $1 in place, if present. Leaves $1 untouched if only the
# plaintext form exists (a backup taken without BACKUP_GPG_RECIPIENT set).
decrypt_if_present() {
  local file="$1"
  if [[ -f "${file}.gpg" ]]; then
    if ! command -v gpg >/dev/null 2>&1; then
      echo "ERROR: ${file}.gpg is encrypted but gpg is not on PATH." >&2
      exit 1
    fi
    echo "Decrypting ${file}.gpg ..."
    gpg --batch --yes --output "$file" --decrypt "${file}.gpg"
  fi
}

decrypt_if_present "${SRC}/chain-data.tar.gz"
decrypt_if_present "${SRC}/mongo.tar.gz"

if [[ -f "${SRC}/chain-data.tar.gz" ]]; then
  echo "Restoring chain data..."
  if [[ -d "$CHAIN_HOME" ]]; then
    MOVED_ASIDE="${CHAIN_HOME}.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "  Moving existing chain data aside to ${MOVED_ASIDE} (not deleted, in case this restore needs to be undone)"
    mv "$CHAIN_HOME" "$MOVED_ASIDE"
  fi
  tar xzf "${SRC}/chain-data.tar.gz" -C "$(dirname "$CHAIN_HOME")"
  echo "  Chain data restored to ${CHAIN_HOME}"
else
  echo "  (no chain-data.tar.gz in backup — skipping chain restore)"
fi

MONGO_DIR="${SRC}/mongo"
CLEANUP_MONGO_DIR=""
if [[ -f "${SRC}/mongo.tar.gz" ]]; then
  echo "Unpacking mongo.tar.gz..."
  tar xzf "${SRC}/mongo.tar.gz" -C "$SRC"
  CLEANUP_MONGO_DIR="$MONGO_DIR"
fi

if [[ -d "$MONGO_DIR" ]]; then
  if ! command -v mongorestore >/dev/null 2>&1; then
    echo "ERROR: mongorestore not found on PATH — install the MongoDB Database Tools." >&2
    exit 1
  fi

  # mongodump (run against a URI with a database in it, as backup.sh does)
  # writes one subdirectory per database under mongo/. When --uri also
  # names a database, mongorestore expects to be pointed at that specific
  # per-database subdirectory directly — pointed at the parent "mongo" dir
  # instead, it silently skips it ("don't know what to do with subdirectory")
  # and restores nothing, with exit code 0 and no error.
  DB_DIRS=("${MONGO_DIR}"/*/)
  if [[ ${#DB_DIRS[@]} -ne 1 ]]; then
    echo "ERROR: expected exactly one database directory under ${MONGO_DIR}, found ${#DB_DIRS[@]}." >&2
    exit 1
  fi

  echo "Restoring MongoDB (${MONGO_URI})..."
  mongorestore --uri="$MONGO_URI" --drop --quiet "${DB_DIRS[0]}"
  echo "  MongoDB restored"
  # Only remove what this run unpacked from mongo.tar.gz — never touch a
  # bare mongo/ directory that was the original backup artifact itself
  # (older, pre-encryption-support backups).
  [[ -n "$CLEANUP_MONGO_DIR" ]] && rm -rf "$CLEANUP_MONGO_DIR"
else
  echo "  (no mongo.tar.gz or mongo/ directory in backup — skipping Mongo restore)"
fi

echo ""
echo "Restore complete from ${SRC}."
