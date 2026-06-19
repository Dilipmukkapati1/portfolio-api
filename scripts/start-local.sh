#!/usr/bin/env bash
# Local start with Azurite for queues/blob. Cosmos/SQL come from existing local.settings.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=1 ;;
  esac
done

source "$ROOT/scripts/lib/build-if-needed.sh"
build_if_needed "$ROOT" "$FORCE_BUILD"

bash "$ROOT/scripts/storage-azurite-local.sh"
bash "$ROOT/scripts/require-azurite.sh"

echo "Starting Functions host (Azurite storage)..."
exec func start
