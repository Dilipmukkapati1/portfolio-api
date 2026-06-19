#!/usr/bin/env bash
# Fast local start against Azure dev (Cosmos + SQL + Storage). No Azurite, no migrations by default.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_SYNC=0
FORCE_BUILD=0
RUN_MIGRATE=0

for arg in "$@"; do
  case "$arg" in
    --sync) FORCE_SYNC=1 ;;
    --build) FORCE_BUILD=1 ;;
    --migrate) RUN_MIGRATE=1 ;;
  esac
done

source "$ROOT/scripts/lib/build-if-needed.sh"
build_if_needed "$ROOT" "$FORCE_BUILD"

if [[ "$FORCE_SYNC" -eq 1 ]]; then
  bash "$ROOT/scripts/azure-local-sync.sh" --force
else
  bash "$ROOT/scripts/azure-local-sync.sh"
fi

if [[ "$RUN_MIGRATE" -eq 1 ]]; then
  echo "Running Liquibase migrations..."
  bash "$ROOT/scripts/db-migrate.sh"
else
  echo "Skipping db:migrate (run after schema changes: npm run db:migrate)"
fi

echo "Starting Functions host..."
exec func start
