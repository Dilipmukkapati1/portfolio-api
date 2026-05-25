#!/usr/bin/env bash
# Verify Azure SQL connectivity using the same settings as the API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"

if [[ ! -f "$SETTINGS" ]]; then
  echo "Missing local.settings.json. Run: npm run sql:azure" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

export AZURE_SQL_SERVER="$(jq -r '.Values.AZURE_SQL_SERVER // empty' "$SETTINGS")"
export AZURE_SQL_DATABASE="$(jq -r '.Values.AZURE_SQL_DATABASE // empty' "$SETTINGS")"
export AZURE_SQL_USER="$(jq -r '.Values.AZURE_SQL_USER // empty' "$SETTINGS")"
export AZURE_SQL_PASSWORD="$(jq -r '.Values.AZURE_SQL_PASSWORD // empty' "$SETTINGS")"
export AZURE_SQL_ENCRYPT="$(jq -r '.Values.AZURE_SQL_ENCRYPT // "true"' "$SETTINGS")"

if [[ -z "$AZURE_SQL_SERVER" || -z "$AZURE_SQL_DATABASE" || -z "$AZURE_SQL_USER" || -z "$AZURE_SQL_PASSWORD" ]]; then
  echo "Incomplete AZURE_SQL_* in local.settings.json. Run: npm run sql:azure" >&2
  exit 1
fi

cd "$ROOT"
npm run build --silent 2>/dev/null || npm run build

node --input-type=module <<'NODE'
import { probeSql, resetSqlPoolForTests } from "./dist/src/sql/client.js";

const attempts = 3;
for (let i = 0; i < attempts; i++) {
  resetSqlPoolForTests();
  const ok = await probeSql();
  if (ok) {
    console.log("Azure SQL OK:", process.env.AZURE_SQL_DATABASE, "@", process.env.AZURE_SQL_SERVER);
    process.exit(0);
  }
  if (i < attempts - 1) {
    console.warn(`Attempt ${i + 1} failed; retrying in 5s (DB may be auto-paused)...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.error("Azure SQL unreachable. Check firewall (sql_allow_current_client_ip), npm run sql:azure, VPN/IP.");
process.exit(1);
NODE
