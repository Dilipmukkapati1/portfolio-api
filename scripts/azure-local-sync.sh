#!/usr/bin/env bash
# Sync Cosmos + SQL + Storage settings into local.settings.json from Terraform outputs.
# Skips work when infra fingerprint is unchanged and settings look complete (fast local start).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
CACHE_DIR="$ROOT/.local"
CACHE_FILE="$CACHE_DIR/azure-sync-fingerprint"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done

source "$ROOT/scripts/lib/terraform-outputs.sh"

require_terraform_outputs

compute_fingerprint() {
  local tf_json
  tf_json="$(terraform -chdir="${PORTFOLIO_INFRA_TF_DIR}" output -json)"
  printf '%s' "$tf_json" | jq -c '{
    cosmos_endpoint: .cosmos_endpoint.value,
    cosmos_account: .cosmos_account_name.value,
    sql_server: .sql_server_fqdn.value,
    sql_db: (.sql_database_dev.value // ((.sql_database_names.value // []) | map(select(endswith("-dev"))) | first) // "sqldb-dev"),
    sql_user: (.sql_admin_login.value // "ppmadmin"),
    sql_password: .sql_admin_password.value,
    storage_account: .storage_account_name.value
  }' | shasum -a256 | awk '{print $1}'
}

settings_complete() {
  [[ -f "$SETTINGS" ]] || return 1
  jq -e '
    (.Values.COSMOS_ENDPOINT // "") != ""
    and (.Values.COSMOS_KEY // "") != ""
    and (.Values.COSMOS_DATABASE // "") != ""
    and (.Values.AZURE_SQL_SERVER // "") != ""
    and (.Values.AZURE_SQL_DATABASE // "") != ""
    and (.Values.AZURE_SQL_USER // "") != ""
    and (.Values.AZURE_SQL_PASSWORD // "") != ""
    and (.Values.AzureWebJobsStorage // "") != ""
    and (.Values.AzureWebJobsStorage // "") != "UseDevelopmentStorage=true"
  ' "$SETTINGS" >/dev/null 2>&1
}

FP="$(compute_fingerprint)"

if [[ "$FORCE" -eq 0 ]] && settings_complete && [[ -f "$CACHE_FILE" ]] && [[ "$(cat "$CACHE_FILE")" == "$FP" ]]; then
  echo "Azure dev settings up to date (skipped cosmos/sql/storage sync)."
  echo "  Force refresh: npm run azure:local:force  or  npm run start:dev:sync"
  exit 0
fi

echo "Syncing Azure dev settings from Terraform..."
bash "$ROOT/scripts/cosmos-azure-local.sh"
bash "$ROOT/scripts/sql-azure-local.sh"
bash "$ROOT/scripts/storage-azure-local.sh"

mkdir -p "$CACHE_DIR"
echo "$FP" >"$CACHE_FILE"
echo "Azure dev settings synced."
