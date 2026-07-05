#!/usr/bin/env bash
# Run Liquibase against the LOCAL SQL Server container (docker-compose.local.yml).
#
# Unlike db-migrate.sh (which targets Azure SQL with strict TLS), this uses a
# local-friendly JDBC URL (encrypt=false;trustServerCertificate=true) and first
# creates the `portfolio` database, which Liquibase cannot create itself.
#
#   npm run db:migrate:local            # update (default)
#   npm run db:migrate:local status     # pending changesets
#
# Requires: Docker running + `npm run local:up` (SQL container healthy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
COMPOSE_FILE="$ROOT/docker-compose.local.yml"
CMD="${1:-update}"

DATABASE="${AZURE_SQL_DATABASE:-portfolio}"

# SA password: env override -> local.settings.json -> compose default.
sa_password() {
  if [[ -n "${AZURE_SQL_PASSWORD:-}" ]]; then
    echo "$AZURE_SQL_PASSWORD"
    return
  fi
  if [[ -f "$SETTINGS" ]] && command -v jq >/dev/null 2>&1; then
    local pw
    pw="$(jq -r '.Values.AZURE_SQL_PASSWORD // empty' "$SETTINGS")"
    if [[ -n "$pw" ]]; then
      echo "$pw"
      return
    fi
  fi
  echo "Portfolio_Local1!"
}

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then: npm run local:up" >&2
  exit 1
fi

PASS="$(sa_password)"

# Resolve the running SQL container (compose service `sql`, container `ppm-sql`).
SQL_CID="$(docker compose -f "$COMPOSE_FILE" ps -q sql 2>/dev/null || true)"
if [[ -z "$SQL_CID" ]]; then
  SQL_CID="$(docker ps -q -f name=ppm-sql || true)"
fi
if [[ -z "$SQL_CID" ]]; then
  echo "Local SQL container is not running. Start it with: npm run local:up" >&2
  exit 1
fi

# 1) Ensure the database exists (Liquibase cannot CREATE DATABASE).
echo "Ensuring database '${DATABASE}' exists on local SQL..."
docker exec -i "$SQL_CID" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$PASS" -C \
  -Q "IF DB_ID('${DATABASE}') IS NULL CREATE DATABASE [${DATABASE}];"

# 2) Run Liquibase via Docker. host.docker.internal reaches the host-published
#    SQL port (1433) from the liquibase container on Docker Desktop.
JDBC_URL="jdbc:sqlserver://host.docker.internal:1433;databaseName=${DATABASE};encrypt=false;trustServerCertificate=true"

echo "Running Liquibase ${CMD} on ${DATABASE} @ local SQL..."
docker run --rm \
  -v "$ROOT/db:/liquibase/changelog" \
  -w /liquibase/changelog \
  liquibase/liquibase:4.31 \
  --url="$JDBC_URL" \
  --username=sa \
  --password="$PASS" \
  --changelog-file=changelog/db.changelog-master.yaml \
  "$CMD"
