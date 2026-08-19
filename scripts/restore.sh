#!/bin/bash
# restore.sh — Restore MongoDB and chain data from a backup created by
# backup.sh. Destructive: overwrites current chain data and drops+restores
# Mongo collections. Refuses to run unless the node is stopped and the
# caller explicitly confirms.
#
# Usage:
#   ./scripts/restore.sh <backup-name> [--yes]
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

if [[ -d "${SRC}/mongo" ]]; then
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
  DB_DIRS=("${SRC}/mongo"/*/)
  if [[ ${#DB_DIRS[@]} -ne 1 ]]; then
    echo "ERROR: expected exactly one database directory under ${SRC}/mongo, found ${#DB_DIRS[@]}." >&2
    exit 1
  fi

  echo "Restoring MongoDB (${MONGO_URI})..."
  mongorestore --uri="$MONGO_URI" --drop --quiet "${DB_DIRS[0]}"
  echo "  MongoDB restored"
else
  echo "  (no mongo/ directory in backup — skipping Mongo restore)"
fi

echo ""
echo "Restore complete from ${SRC}."
