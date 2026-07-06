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

## Fully local (Docker mirror)

Run against **local databases** instead of the shared Azure dev stack — no VPN, no IP allowlisting, no auto-pause cold starts, no shared `sqldb-dev`. Mirrors prod topology: **Cosmos DB Emulator** for entities + **SQL Server 2022** for transactions, both in Docker; Azurite (queues/blob) stays on npm.

**Prerequisites:** Docker Desktop running, `jq`. Node 23+ isn't supported by Azure Functions/Azurite — `start:local` auto-switches to Homebrew `node@22` if it's installed; otherwise use a supported Node (18/20/22) yourself.

### One-time setup

```bash
cp local.settings.local.example.json local.settings.json
npm install
npm run local:up                 # start cosmos emulator + SQL Server (first cosmos start ~1-2 min)
npm run db:migrate:local         # create `portfolio` DB + transactions table
```

### Each session (one command)

```bash
npm run start:local              # containers + Azurite + build + func on :7071
```

`start:local` does everything: it brings up the local DB containers (only when `local.settings.json` points at localhost), starts Azurite in the background, builds if needed, then runs the Functions host. `COSMOS_*`/`AZURE_SQL_*` come from `local.settings.json` and aren't overwritten — just don't run `npm run azure:local` (which repoints them at Azure). Pass `-- --build` to force a rebuild.

| npm script | Purpose |
| ---------- | ------- |
| `local:up` / `local:down` | Start / stop the local DB containers (SQL data persists in a volume; `local:down -- -v` wipes; the Cosmos emulator is in-container and resets on `local:down`) |
| `db:migrate:local` | Create `portfolio` DB + run Liquibase against local SQL (`db:migrate:local status` for pending) |

The Cosmos emulator is the Linux-native `vnext-preview` image, served over **HTTP** on `http://localhost:8081` (`COSMOS_ENDPOINT` in the example settings) with the well-known key; Data Explorer is at `http://localhost:1234`. (The legacy `:latest` image is the Windows emulator under emulation — heavy and, here, it started rejecting the well-known key mid-session, so we don't use it.)

Startup verifies only that the Cosmos database exists; the 13 containers are **created on demand** on first read/write, so `start:local` doesn't pre-create them (which is serialized and slow on the emulator). Set `COSMOS_WARMUP=all` to pre-create everything at startup instead.

Verify: `GET http://localhost:7071/api/health` → `storage: "cosmos"`, `sources.core: "cosmos"`, `sources.transactions: "azure-sql"`.

If health shows `sources.core: "disk"`, the app started before Cosmos was ready and fell back for that run — `start:local` waits for the emulator, but if you started `func` another way, just restart it once `docker logs ppm-cosmos` shows it serving.

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
| `start:dev` | Azure dev: cached settings sync, skip build/migrate when possible, then `func start` |
| `start:dev:sync` | Force refresh Azure settings, then start |
| `start:dev:migrate` | Start with Liquibase `db:migrate` (after schema changes) |
| `start:local` | Azurite storage + require Azurite running (skip build if `dist/` exists) |
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
