#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Stopping Cosmos emulator and clearing persisted emulator data..."
docker compose stop cosmos-emulator 2>/dev/null || true
docker compose rm -f cosmos-emulator 2>/dev/null || true
rm -rf .cosmos

echo "Pulling latest emulator image..."
docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:latest

echo "Starting Cosmos emulator..."
docker compose up -d cosmos-emulator
npm run cosmos:wait
