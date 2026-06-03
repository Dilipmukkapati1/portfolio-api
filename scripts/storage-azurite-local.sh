#!/usr/bin/env bash
# Point local.settings.json at local Azurite (UseDevelopmentStorage=true).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/local.settings.json"
QUEUE_NAME="${PORTFOLIO_QUEUE_NAME:-portfolio-sync}"

if [[ ! -f "$SETTINGS" ]]; then
  cp "$ROOT/local.settings.json.example" "$SETTINGS"
fi

tmp="$(mktemp)"
jq \
  --arg queue "$QUEUE_NAME" \
  '.Values.AzureWebJobsStorage = "UseDevelopmentStorage=true"
   | .Values.PORTFOLIO_QUEUE_NAME = $queue' \
  "$SETTINGS" >"$tmp"
mv "$tmp" "$SETTINGS"

echo "Updated $SETTINGS for local Azurite:"
echo "  AzureWebJobsStorage=UseDevelopmentStorage=true"
echo "  PORTFOLIO_QUEUE_NAME=$QUEUE_NAME"
echo ""
echo "Start Azurite in another terminal: npm run storage:start"
