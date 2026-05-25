#!/usr/bin/env bash
# Fail fast before func start if Azurite is not listening.
set -euo pipefail

port_open() {
  (echo >/dev/tcp/127.0.0.1/"$1") 2>/dev/null
}

if port_open 10000 && port_open 10001; then
  exit 0
fi

echo "Azurite is not running (connection refused on 127.0.0.1:10000 / :10001)." >&2
echo "" >&2
echo "Start it in another terminal and keep it open:" >&2
echo "  cd portfolio-api && npm run storage:start" >&2
echo "" >&2
echo "Then run npm start again." >&2
exit 1
