#!/usr/bin/env bash
# Point local.settings.json at Terraform-managed Azure Storage (queues/blob for Functions host).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
QUEUE_NAME="${PORTFOLIO_QUEUE_NAME:-portfolio-sync-dev}"
RG="${AZURE_RESOURCE_GROUP:-}"

source "$ROOT/scripts/lib/terraform-outputs.sh"

require_terraform_outputs
require_tf_output storage_account_name

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required and you must be logged in (az login)." >&2
  exit 1
fi

ACCOUNT="$(tf_output_raw storage_account_name)"
if [[ -z "$RG" ]]; then
  RG="$(tf_resource_group_name)"
fi

CONN="$(tf_output_raw_optional storage_connection_string)"
if [[ -z "$CONN" ]]; then
  CONN="$(az storage account show-connection-string \
    --name "$ACCOUNT" \
    --resource-group "$RG" \
    --query connectionString -o tsv)"
fi

if [[ -z "$CONN" ]]; then
  echo "Could not resolve storage connection string for account $ACCOUNT in $RG." >&2
  exit 1
fi

if [[ ! -f "$SETTINGS" ]]; then
  cp "$ROOT/local.settings.json.example" "$SETTINGS"
fi

tmp="$(mktemp)"
jq \
  --arg conn "$CONN" \
  --arg queue "$QUEUE_NAME" \
  '.Values.AzureWebJobsStorage = $conn
   | .Values.PORTFOLIO_QUEUE_NAME = $queue' \
  "$SETTINGS" >"$tmp"
mv "$tmp" "$SETTINGS"

echo "Updated $SETTINGS for Azure Storage dev:"
echo "  storage_account=$ACCOUNT"
echo "  PORTFOLIO_QUEUE_NAME=$QUEUE_NAME"
echo ""
echo "Azurite is not required. Cosmos/SQL: npm run azure:local (or npm run start:dev)"
