#!/usr/bin/env bash
set -euo pipefail

SA_PASSWORD="${AZURE_SQL_PASSWORD:-PortfolioDev1!}"
SERVER="${AZURE_SQL_SERVER:-localhost}"
DATABASE="${AZURE_SQL_DATABASE:-portfolio}"

echo "Ensuring database ${DATABASE} exists on ${SERVER}..."

docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "${SA_PASSWORD}" -C \
  -Q "IF DB_ID('${DATABASE}') IS NULL CREATE DATABASE [${DATABASE}];"

echo "Database ${DATABASE} ready."
