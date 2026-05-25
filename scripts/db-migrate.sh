#!/usr/bin/env bash
# Run Liquibase against Azure SQL using local.settings.json (no Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
PROPS="$ROOT/db/liquibase.local.properties"
CMD="${1:-update}"

read_setting() {
  local key="$1"
  local env_name="$2"
  if [[ -n "${!env_name:-}" ]]; then
    echo "${!env_name}"
    return
  fi
  if [[ -f "$SETTINGS" ]]; then
    jq -r --arg k "$key" '.Values[$k] // empty' "$SETTINGS"
  fi
}

if ! command -v liquibase >/dev/null 2>&1; then
  echo "Liquibase CLI not found. Install with: brew install liquibase" >&2
  exit 1
fi

LB_VERSION="$(liquibase --version 2>/dev/null | head -1 || true)"
if [[ -n "$LB_VERSION" ]] && ! echo "$LB_VERSION" | grep -qE '4\.31'; then
  echo "Warning: expected Liquibase 4.31.x (CI uses 4.31). Found: $LB_VERSION" >&2
fi

SERVER="$(read_setting AZURE_SQL_SERVER AZURE_SQL_SERVER)"
DATABASE="$(read_setting AZURE_SQL_DATABASE AZURE_SQL_DATABASE)"
USER="$(read_setting AZURE_SQL_USER AZURE_SQL_USER)"
PASS="$(read_setting AZURE_SQL_PASSWORD AZURE_SQL_PASSWORD)"

if [[ -z "$SERVER" || -z "$DATABASE" || -z "$USER" || -z "$PASS" ]]; then
  echo "Missing AZURE_SQL_* in local.settings.json. Run: npm run sql:azure" >&2
  exit 1
fi

HOST="${SERVER%%,*}"
HOST="${HOST#tcp:}"

cat > "$PROPS" <<EOF
changelogFile=changelog/db.changelog-master.yaml
url=jdbc:sqlserver://${HOST}:1433;databaseName=${DATABASE};encrypt=true;trustServerCertificate=false
username=${USER}
password=${PASS}
driver=com.microsoft.sqlserver.jdbc.SQLServerDriver
EOF
chmod 600 "$PROPS"

echo "Running liquibase $CMD on ${DATABASE} @ ${HOST}..."
(cd "$ROOT/db" && liquibase --defaults-file=liquibase.local.properties "$CMD")
