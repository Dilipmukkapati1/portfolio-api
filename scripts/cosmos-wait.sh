#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${COSMOS_WAIT_ATTEMPTS:-60}"
SLEEP_SECONDS="${COSMOS_WAIT_INTERVAL:-2}"
ENDPOINT="${COSMOS_ENDPOINT:-https://localhost:8081}"

cosmos_ready() {
  local code
  code="$(curl -sk -o /dev/null -w '%{http_code}' "${ENDPOINT}/" || true)"
  [[ "$code" == "200" || "$code" == "401" ]]
}

echo "Waiting for Cosmos DB emulator at ${ENDPOINT} (up to $((MAX_ATTEMPTS * SLEEP_SECONDS))s)..."

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
  if cosmos_ready; then
    echo "Cosmos DB emulator is ready."
    exit 0
  fi
  if ! docker compose ps cosmos-emulator 2>/dev/null | grep -q "Up"; then
    echo "Cosmos emulator container is not running. Starting it..."
    docker compose up -d cosmos-emulator
  fi
  sleep "${SLEEP_SECONDS}"
done

echo "Cosmos DB emulator did not become ready in time." >&2
echo "Try: docker compose restart cosmos-emulator && npm run cosmos:wait" >&2
exit 1
