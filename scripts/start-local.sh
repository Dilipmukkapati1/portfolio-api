#!/usr/bin/env bash
# One-command local dev: local DB containers + Azurite + build + Functions host.
#
#   npm run start:local            # start everything, then func start
#   npm run start:local -- --build # force a rebuild first
#
# Brings up the Cosmos emulator + SQL Server (docker-compose.local.yml) ONLY when
# local.settings.json points at localhost DBs (the "Fully local (Docker mirror)"
# setup). If you're pointed at Azure Cosmos/SQL, the container step is skipped and
# this just runs Azurite + func. Cosmos/SQL connection settings come from
# local.settings.json either way.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SETTINGS="$ROOT/local.settings.json"
COMPOSE_FILE="$ROOT/docker-compose.local.yml"

FORCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=1 ;;
  esac
done

# --- Use node@22 when the default node is too new -------------------------------
# Azure Functions + Azurite don't support Node 23+. If the active node is newer and
# Homebrew node@22 is installed, put it first on PATH so azurite/func use it.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [[ "$(node_major)" -ge 23 ]]; then
  N22="$({ brew --prefix node@22 2>/dev/null || echo /usr/local/opt/node@22; })/bin"
  if [[ -x "$N22/node" && ":$PATH:" != *":$N22:"* ]]; then
    export PATH="$N22:$PATH"
    echo "Using node@22 for local dev (default $(node -v || true) is unsupported by Azure Functions/Azurite)."
  fi
fi

port_open() { (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# --- Local DB containers (only when settings point at localhost) ----------------
uses_local_db() {
  [[ -f "$SETTINGS" ]] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  local cosmos sql
  cosmos="$(jq -r '.Values.COSMOS_ENDPOINT // ""' "$SETTINGS")"
  sql="$(jq -r '.Values.AZURE_SQL_SERVER // ""' "$SETTINGS")"
  [[ "$cosmos" == *localhost* || "$cosmos" == *127.0.0.1* || "$sql" == "localhost" || "$sql" == 127.0.0.1* ]]
}

if [[ -f "$COMPOSE_FILE" ]] && uses_local_db; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "Ensuring local DB containers are up (Cosmos emulator + SQL Server)..."
    docker compose -f "$COMPOSE_FILE" up -d

    # Wait briefly for SQL to be healthy (usually instant if already running).
    echo -n "Waiting for SQL Server"
    for _ in $(seq 1 30); do
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ppm-sql 2>/dev/null || echo none)"
      [[ "$status" == "healthy" || "$status" == "none" ]] && break
      echo -n "."; sleep 2
    done
    echo " ok"

    # Cosmos emulator: wait until it can actually serve, not just until the port is
    # open. While starting it returns 503; once ready an unauthenticated request
    # gets 401. Starting func before this => the app falls back to disk for the run.
    echo -n "Waiting for Cosmos emulator"
    for _ in $(seq 1 60); do
      code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8081/ 2>/dev/null || echo 000)"
      [[ "$code" == "401" ]] && break
      echo -n "."; sleep 2
    done
    echo " ok"
  else
    echo "Docker isn't running — start Docker Desktop for local Cosmos/SQL, or use STORAGE_MODE=disk." >&2
  fi
fi

# --- Azurite (queues/blob) — start it if not already listening ------------------
AZ_PID=""
cleanup() { [[ -n "$AZ_PID" ]] && kill "$AZ_PID" 2>/dev/null || true; }

if port_open 10000 && port_open 10001; then
  echo "Azurite already running."
else
  echo "Starting Azurite..."
  mkdir -p "$ROOT/.azurite"
  azurite --silent --location "$ROOT/.azurite" --skipApiVersionCheck > "$ROOT/.azurite/azurite.log" 2>&1 &
  AZ_PID=$!
  trap cleanup EXIT INT TERM
  for _ in $(seq 1 40); do
    port_open 10000 && port_open 10001 && break
    sleep 0.5
  done
  if ! { port_open 10000 && port_open 10001; }; then
    echo "Azurite failed to start. Last log lines:" >&2
    tail -n 15 "$ROOT/.azurite/azurite.log" >&2 || true
    exit 1
  fi
  echo "Azurite started (pid $AZ_PID; log: .azurite/azurite.log)."
fi

# Write AzureWebJobsStorage=UseDevelopmentStorage=true into local.settings.json.
bash "$ROOT/scripts/storage-azurite-local.sh"

# --- Build + run ----------------------------------------------------------------
source "$ROOT/scripts/lib/build-if-needed.sh"
build_if_needed "$ROOT" "$FORCE_BUILD"

echo "Starting Functions host on http://localhost:7071 ..."
func start
