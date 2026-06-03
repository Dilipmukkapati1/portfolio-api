# portfolio-api

Azure Functions v4 (TypeScript) — Cosmos DB, Azure SQL, Key Vault, SimpleFIN, SnapTrade.

## Prerequisites

- Node 20+
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) via npm (`storage:start`) for queues/blob emulation
- [Terraform](https://www.terraform.io/downloads) + [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) — `portfolio-infra` dev stack applied
- `jq`, **Liquibase 4.31.x** (`brew install liquibase`)
- `sql_allow_current_client_ip = true` in `portfolio-infra/terraform/terraform.tfvars` (re-apply when your public IP changes)

Or use `STORAGE_MODE=disk` for fully local JSON storage (no Cosmos/SQL).

## Local run (zero Docker)

Local dev uses **Azure Cosmos** (`portfolio-dev`) and **Azure SQL** (`sqldb-dev`) from Terraform. Azurite runs via npm only.

**Shared dev SQL:** All developers use the same `sqldb-dev` database. Coordinate Liquibase migrations before merging schema changes.

### One-time setup

```bash
cd ../portfolio-infra
make apply-dev
make seed-dev-sql          # optional: Key Vault connection string

cd ../portfolio-contracts && npm install && npm run build
cd ../portfolio-tax-engine && npm install && npm run build
cd ../portfolio-api
cp local.settings.json.example local.settings.json
npm install && npm run build
npm run azure:local        # Cosmos + SQL → local.settings.json
npm run secrets:azure-local   # optional: SimpleFIN / SnapTrade from Key Vault
npm run db:migrate         # first time on empty sqldb-dev
```

### Each session

**Option A — local Azurite** (queues/blob emulator; default):

Terminal 1:

```bash
cd portfolio-api
npm run storage:start    # ports 10000–10002; keep running
```

Terminal 2:

```bash
npm run dev:check        # optional preflight
npm run start:local      # or: npm start (alias)
```

**Option B — Azure Storage dev** (shared Terraform storage account; no Azurite):

```bash
npm run start:dev        # Cosmos + SQL + Storage from Azure dev (no Azurite, no migrations)
```

Verify: `GET http://localhost:7071/api/health` — `sources.transactions` should include `azure-sql` when SQL is reachable.

### Storage layout (`STORAGE_MODE=cosmos`, default)

| Store | Data |
| ----- | ---- |
| **Cosmos DB** | Households, accounts, holdings, tax profiles, integration tokens, sync state |
| **Azure SQL** | Transactions (SimpleFIN / imports) |

| npm script | Purpose |
| ---------- | ------- |
| `start:local` | Azurite `AzureWebJobsStorage` + require Azurite running |
| `start:dev` | Azure dev: Cosmos + SQL + Storage (no Azurite, no `db:migrate`) |
| `start` | Alias for `start:local` |
| `azure:local` | `cosmos:azure` + `sql:azure` |
| `storage:azure` / `storage:local` | Write `AzureWebJobsStorage` only (used by start scripts) |
| `cosmos:azure` | Cosmos settings from Terraform + `az` |
| `sql:azure` | SQL settings from Terraform (no `az` required) |
| `sql:verify` | Test SQL connectivity (retries auto-pause) |
| `db:migrate` / `db:status` | Liquibase against `sqldb-dev` |

If Cosmos is unreachable at startup, the API **falls back to disk** for entities while SQL still handles transactions.

`STORAGE_MODE=memory` — ephemeral storage for tests.

**SimpleFIN locally:** When `KEY_VAULT_NAME` is empty, claimed Access URLs are saved to `.local-secrets.json` (gitignored).

**Environment config:** See [env/README.md](./env/README.md) and `env/*.values.example.json`.

### Troubleshooting

| Issue | Fix |
| ----- | --- |
| `Connection refused 127.0.0.1:10000` | Run `npm run storage:start` |
| SQL timeout on first query | DB auto-paused; wait and `npm run sql:verify` |
| SQL login / firewall errors | `npm run sql:azure`; re-apply infra with `sql_allow_current_client_ip = true` |
| Azurite API version unsupported | Restart `npm run storage:start` (`--skipApiVersionCheck`) |

Health: `GET http://localhost:7071/api/health`

## Deploy (Azure)

Deploy the Function App from your machine (same zip deploy as CI). Resource names come from `portfolio-infra` Terraform outputs.

**Prerequisites:** `az login`, dev stack applied (`cd ../portfolio-infra && make apply-dev`; prod needs `make apply-prod`), Node 20+, `zip`, `terraform`, `jq`. Migrations prefer Docker (`liquibase/liquibase:4.31`); if Docker is not running, the deploy script falls back to local Liquibase (`brew install liquibase`). For Azure SQL from your machine, allow your IP in `portfolio-infra/terraform/terraform.tfvars` (`sql_allow_current_client_ip = true`).

```bash
npm run deploy:dev              # dev Function App (code only; no Liquibase)
npm run deploy:prod             # prod — prompts: type prod to confirm
npm run deploy -- dev --skip-migrate   # same as deploy:dev
npm run deploy -- dev              # run Liquibase before deploy
npm run deploy -- prod --skip-build
```

| Script | Purpose |
| ------ | ------- |
| `deploy:dev` | Build and deploy dev app (no migrations; run `db:migrate` separately if needed) |
| `deploy:prod` | Same for prod (`sqldb-prod`) after confirmation |
| `--skip-migrate` | Skip Liquibase (code-only deploy) |
| `--skip-build` | Deploy existing `dist/` only |

Run migrations only (Terraform credentials, Docker or local Liquibase): `bash scripts/db-migrate-terraform.sh dev`

Deploy does **not** change Function App settings (Terraform + Key Vault remain the source of truth). After deploy, verify: `GET https://<function-app>/api/health`.

Deploy the web app separately: `cd ../portfolio-web && npm run deploy:dev`.

## API documentation (Swagger)

With the API running:

| URL | Description |
| --- | ----------- |
| [http://localhost:7071/api/docs](http://localhost:7071/api/docs) | **Swagger UI** |
| [http://localhost:7071/api/openapi.json](http://localhost:7071/api/openapi.json) | OpenAPI 3.0 JSON |

Use **Authorize** in Swagger UI to set `x-household-id` (defaults to `local-household` if omitted).

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
