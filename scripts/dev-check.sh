#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

check_port() {
  local port="$1"
  if (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
    echo "OK  localhost:$port"
    return 0
  fi
  echo "MISS localhost:$port (start: npm run storage:start)" >&2
  return 1
}

echo "=== Local dev preflight ==="
AZURITE_OK=0
check_port 10000 && AZURITE_OK=1 || true
check_port 10001 || true

if [[ -f local.settings.json ]] && jq -e '.Values.AZURE_SQL_SERVER // empty' local.settings.json | grep -q .; then
  echo ""
  echo "SQL settings present; running sql:verify..."
  bash scripts/sql-verify.sh || true
else
  echo ""
  echo "SQL not configured. Run: npm run azure:local"
fi

echo ""
echo "Checklist:"
echo "  1. npm run azure:local        # once / after infra change (cached on later runs)"
echo "  2. npm run db:migrate         # first time on sqldb-dev, or after schema change"
echo "  3a. npm run storage:start && npm run start:local   # Azurite"
echo "  3b. npm run start:dev         # Azure dev (fast: skips rebuild + settings sync when fresh)"
echo "  3c. npm run start:dev:sync    # force refresh Azure settings, then start"
