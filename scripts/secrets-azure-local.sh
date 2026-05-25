#!/usr/bin/env bash
# Pull dev integration secrets from Key Vault into .local-secrets.json (unprefixed keys).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="$ROOT/.local-secrets.json"
source "$ROOT/scripts/lib/terraform-outputs.sh"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required. Run: az login" >&2
  exit 1
fi

require_terraform_outputs
require_tf_output key_vault_name

VAULT="$(tf_output_raw key_vault_name)"

pull_secret() {
  local kv_name="$1"
  local local_key="$2"
  local value
  if ! value="$(az keyvault secret show --vault-name "$VAULT" --name "$kv_name" --query value -o tsv 2>/dev/null)"; then
    echo "Skip (not found): $kv_name" >&2
    return 0
  fi
  if [[ -z "$value" ]]; then
    echo "Skip (empty): $kv_name" >&2
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$SECRETS_FILE" ]]; then
    jq --arg k "$local_key" --arg v "$value" '.[$k] = $v' "$SECRETS_FILE" >"$tmp"
  else
    jq -n --arg k "$local_key" --arg v "$value" '{($k): $v}' >"$tmp"
  fi
  mv "$tmp" "$SECRETS_FILE"
  echo "Set .local-secrets.json → $local_key (from $kv_name)"
}

pull_secret dev-simplefin-access-url simplefin-access-url
pull_secret dev-snaptrade-client-id snaptrade-client-id
pull_secret dev-snaptrade-consumer-key snaptrade-consumer-key
pull_secret dev-snaptrade-webhook-secret snaptrade-webhook-secret

echo ""
echo "Done. SQL credentials: use npm run sql:azure (not Key Vault for local SQL)."
