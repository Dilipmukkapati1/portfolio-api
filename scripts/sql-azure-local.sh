#!/usr/bin/env bash
# Point local.settings.json at Terraform-managed Azure SQL dev database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
source "$ROOT/scripts/lib/terraform-outputs.sh"

DATABASE="${AZURE_SQL_DATABASE:-}"

require_terraform_outputs
require_tf_output sql_server_fqdn
require_tf_output sql_admin_password

FQDN="$(tf_output_raw sql_server_fqdn)"
LOGIN="$(tf_sql_admin_login)"
PASSWORD="$(tf_output_raw sql_admin_password)"
if [[ -z "$DATABASE" ]]; then
  DATABASE="$(tf_sql_database_dev)"
fi

if [[ -z "$(tf_output_raw_optional sql_admin_login)" ]]; then
  echo "Note: run 'cd portfolio-infra && make apply-dev' to register sql_admin_login output (using default login ${LOGIN})." >&2
fi

if [[ ! -f "$SETTINGS" ]]; then
  cp "$ROOT/local.settings.json.example" "$SETTINGS"
fi

tmp="$(mktemp)"
jq \
  --arg server "$FQDN" \
  --arg database "$DATABASE" \
  --arg user "$LOGIN" \
  --arg password "$PASSWORD" \
  '.Values.AZURE_SQL_SERVER = $server
   | .Values.AZURE_SQL_DATABASE = $database
   | .Values.AZURE_SQL_USER = $user
   | .Values.AZURE_SQL_PASSWORD = $password
   | .Values.AZURE_SQL_ENCRYPT = "true"
   | del(.Values.AZURE_SQL_CONNECTION_STRING)' \
  "$SETTINGS" >"$tmp"
mv "$tmp" "$SETTINGS"

echo "Updated $SETTINGS for Azure SQL dev:"
echo "  AZURE_SQL_SERVER=$FQDN"
echo "  AZURE_SQL_DATABASE=$DATABASE"
echo "  AZURE_SQL_USER=$LOGIN"
echo "  AZURE_SQL_ENCRYPT=true"
echo ""
echo "Ensure sql_allow_current_client_ip = true in portfolio-infra/terraform.tfvars and re-apply if needed."
echo "Next: npm run sql:verify && npm run db:migrate"
