#!/usr/bin/env bash
# Point local.settings.json at the Terraform-managed Azure Cosmos dev database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
RG="${AZURE_RESOURCE_GROUP:-rg-portfolio}"
DATABASE="${COSMOS_AZURE_DATABASE:-portfolio-dev}"

source "$ROOT/scripts/lib/terraform-outputs.sh"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required and you must be logged in (az login)." >&2
  exit 1
fi

require_terraform_outputs
require_tf_output cosmos_endpoint
require_tf_output cosmos_account_name

ENDPOINT="$(tf_output_raw cosmos_endpoint)"
ACCOUNT="$(tf_output_raw cosmos_account_name)"
KEY="$(az cosmosdb keys list --name "$ACCOUNT" --resource-group "$RG" --type keys --query primaryMasterKey -o tsv)"

if [[ ! -f "$SETTINGS" ]]; then
  cp "$ROOT/local.settings.json.example" "$SETTINGS"
fi

tmp="$(mktemp)"
jq \
  --arg endpoint "$ENDPOINT" \
  --arg key "$KEY" \
  --arg database "$DATABASE" \
  '.Values.COSMOS_ENDPOINT = $endpoint
   | .Values.COSMOS_KEY = $key
   | .Values.COSMOS_DATABASE = $database
   | .Values.STORAGE_MODE = "cosmos"' \
  "$SETTINGS" >"$tmp"
mv "$tmp" "$SETTINGS"

echo "Updated $SETTINGS for Azure Cosmos dev:"
echo "  COSMOS_ENDPOINT=$ENDPOINT"
echo "  COSMOS_DATABASE=$DATABASE"
echo "  COSMOS_ACCOUNT=$ACCOUNT"
echo ""
echo "Containers are provisioned by Terraform (portfolio-infra). No emulator needed."
echo "Next: npm run sql:azure (if needed), npm run storage:start, npm run db:migrate, npm start"
