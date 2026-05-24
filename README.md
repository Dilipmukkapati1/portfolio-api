# portfolio-api

Azure Functions v4 (TypeScript) — Cosmos DB, Key Vault, SimpleFIN, SnapTrade.

## Prerequisites

- Node 20+
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (queues/storage)
- Cosmos DB Emulator or dev Cosmos account — **optional** if `STORAGE_MODE=disk` (default in `local.settings.json.example`) or `STORAGE_MODE=memory`

## Local run

**Terminal 1 — Azurite** (required for timers, queue worker, and `AzureWebJobsStorage`):

```bash
cd portfolio-api
npm run storage:start   # npm azurite on ports 10000–10002 (keep this terminal open)
# Or with Docker: npm run storage:start:docker
```

**Terminal 2 — API:**

```bash
cd ../portfolio-contracts && npm install && npm run build
cd ../portfolio-tax-engine && npm install && npm run build
cd ../portfolio-api
cp local.settings.json.example local.settings.json
npm install && npm run build
npm start
```

By default, local settings use **`STORAGE_MODE=cosmos`** with the Cosmos emulator for households, accounts, holdings, and sync state. **Transactions** are stored in **Azure SQL** when `AZURE_SQL_*` is set (included in `local.settings.json.example`).

```bash
npm run dev:deps      # Azurite + Cosmos emulator + SQL Server
npm run db:migrate    # Liquibase schema
npm start
```

Use `STORAGE_MODE=disk` only when the Cosmos emulator is unavailable (core data falls back to `.local-data/portfolio-store.json`; transactions still require SQL). Use `STORAGE_MODE=memory` for ephemeral in-process storage in tests.

**SimpleFIN locally:** When `KEY_VAULT_NAME` is empty, claimed Access URLs are saved to `.local-secrets.json` (gitignored) so setup tokens are not wasted on retry. Each setup token from [SimpleFIN Bridge](https://bridge.simplefin.org/simplefin/create) can only be claimed once — generate a new token if connect fails.

**Environment config:** See [env/README.md](./env/README.md) and `env/*.values.example.json` for `local`, `development`, and `production` settings. Integration secrets (e.g. `SIMPLEFIN_ACCESS_URL`, `SNAPTRADE_*`) and URLs (`API_PUBLIC_BASE_URL`, `WEB_APP_URL`) are set per environment in `local.settings.json` or Azure App Settings.

If you see `Connection refused (127.0.0.1:10000)` or `10001`, Azurite is not running — start it first, then restart `npm start`.

If you see **Azurite API version 2026-02-06 is not supported**, restart Azurite with `npm run storage:start` (uses `--skipApiVersionCheck`). Docker: `npm run storage:stop:docker && npm run storage:start:docker`.

Health: `GET http://localhost:7071/api/health`

## API documentation (Swagger)

With the API running:

| URL | Description |
| --- | ----------- |
| [http://localhost:7071/api/docs](http://localhost:7071/api/docs) | **Swagger UI** — browse and **Try it out** against live endpoints |
| [http://localhost:7071/api/openapi.json](http://localhost:7071/api/openapi.json) | OpenAPI 3.0 JSON spec |

Use **Authorize** in Swagger UI to set `x-household-id` (defaults to `local-household` if omitted). The spec’s server URL is derived from the request host so Try-it-out works locally and when deployed.

## Key routes

| Method | Route |
| ------ | ----- |
| GET | `/api/health` |
| GET/PUT | `/api/household` |
| GET | `/api/accounts` |
| GET | `/api/transactions` |
| GET | `/api/holdings` |
| GET | `/api/networth` |
| POST | `/api/integrations/simplefin/connect` |
| POST | `/api/integrations/simplefin/sync` |
| POST | `/api/integrations/snaptrade/connect` |
| GET | `/api/integrations/snaptrade/callback` |
| POST | `/api/integrations/snaptrade/webhook` |
| POST | `/api/tax/estimate` |
| GET | `/api/tax/strategies` |
