#!/bin/bash
set -euo pipefail

PGUSER="${POSTGRES_USER:?POSTGRES_USER must be set (e.g. postgres)}"
PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_DB:-postgres}"
PGPASSWORD="${POSTGRES_PASSWORD:-}"

EXPLORER_USER="${EXPLORER_USER:-explorer}"
EXPLORER_PASSWORD="${EXPLORER_PASSWORD:?EXPLORER_PASSWORD must be set}"
EXPLORER_DB="${EXPLORER_DB:-explorer}"

GRAFANA_USER="${GRAFANA_USER:-grafana}"
GRAFANA_PASSWORD="${GRAFANA_PASSWORD:?GRAFANA_PASSWORD must be set}"

export PGUSER PGHOST PGPORT PGDATABASE PGPASSWORD

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo "[pre-flight] Running pre-flight checks..."

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql (PostgreSQL client) is required but not installed" >&2; exit 1; }
echo "[pre-flight] psql: ok"

for i in $(seq 1 20); do
  if psql -c "SELECT 1;" >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == 20 ]]; then
    echo "ERROR: Could not connect to PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}" >&2
    exit 1
  fi
  sleep 2
done
echo "[pre-flight] PostgreSQL connection OK."

PG_VERSION=$(psql -tAc "SHOW server_version_num;")
echo "[pre-flight] PostgreSQL server version (num): ${PG_VERSION}"

TSDB_INSTALLED=$(psql -tAc "SELECT 1 FROM pg_available_extensions WHERE name='timescaledb' LIMIT 1;" | tr -d '[:space:]')
if [[ "${TSDB_INSTALLED}" != "1" ]]; then
  echo "WARNING: timescaledb extension does not appear to be available in shared_preload_libraries. CREATE EXTENSION may fail."
fi
echo "[pre-flight] Pre-flight checks done."

# -----------------------------------------------------------------------------
# Run bootstrap SQL as POSTGRES_USER
# -----------------------------------------------------------------------------
echo "[postgres] Running bootstrap as user '${PGUSER}'..."

GRAFANA_PW_ESCAPED=$(printf '%s' "${GRAFANA_PASSWORD}" | sed "s/'/''/g")
EXPLORER_PW_ESCAPED=$(printf '%s' "${EXPLORER_PASSWORD}" | sed "s/'/''/g")
EXPLORER_USER_ESCAPED=$(printf '%s' "${EXPLORER_USER}" | sed "s/'/''/g")

psql -v ON_ERROR_STOP=1 <<EOSQL
-- ---------------------------------------------------------------------------
-- Extensions (pg_stat_statements requires shared_preload_libraries)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Grafana monitoring user + pg_monitor role
-- ---------------------------------------------------------------------------
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'grafana') THEN
    CREATE ROLE grafana WITH LOGIN ENCRYPTED PASSWORD '${GRAFANA_PW_ESCAPED}';
  ELSE
    ALTER ROLE grafana WITH ENCRYPTED PASSWORD '${GRAFANA_PW_ESCAPED}';
  END IF;
END
\$\$;
GRANT pg_monitor TO grafana;

-- ---------------------------------------------------------------------------
-- Explorer user
-- ---------------------------------------------------------------------------
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${EXPLORER_USER_ESCAPED}') THEN
    CREATE ROLE ${EXPLORER_USER} WITH LOGIN ENCRYPTED PASSWORD '${EXPLORER_PW_ESCAPED}';
  ELSE
    ALTER ROLE ${EXPLORER_USER} WITH ENCRYPTED PASSWORD '${EXPLORER_PW_ESCAPED}';
  END IF;
END
\$\$;

-- ---------------------------------------------------------------------------
-- Explorer database
-- ---------------------------------------------------------------------------
SELECT 'CREATE DATABASE ${EXPLORER_DB} OWNER ${EXPLORER_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${EXPLORER_DB}')\\gexec

-- ---------------------------------------------------------------------------
-- Grant CONNECT on explorer db to explorer user
-- ---------------------------------------------------------------------------
GRANT CONNECT ON DATABASE ${EXPLORER_DB} TO ${EXPLORER_USER};
EOSQL

# Run per-database grants inside the explorer database
echo "[postgres] Applying per-database grants on ${EXPLORER_DB}..."
psql -v ON_ERROR_STOP=1 -d "${EXPLORER_DB}" <<'EOSQL'
GRANT CONNECT ON DATABASE explorer TO explorer;
ALTER DEFAULT PRIVILEGES FOR ROLE explorer IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO explorer;
ALTER DEFAULT PRIVILEGES FOR ROLE explorer IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO explorer;
EOSQL

echo "[postgres] Bootstrap complete."
echo "[postgres] Extensions: pg_stat_statements, timescaledb"
echo "[postgres] User 'grafana' created (pg_monitor role)"
echo "[postgres] Database '${EXPLORER_DB}' owned by '${EXPLORER_USER}' with CONNECT grant"
