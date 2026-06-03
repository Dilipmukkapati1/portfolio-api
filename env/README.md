# Environment configuration (portfolio-api)

Copy values into `local.settings.json` → `Values` (local) or Azure Function **App Settings** (deployed).

Set `APP_ENV` to `local`, `development`, or `production`.

## Storage (`STORAGE_MODE=cosmos`)

| Backend | Contents |
| ------- | -------- |
| **Cosmos DB** (`COSMOS_*`) | Households, accounts, holdings, tax profiles, integration tokens, sync state |
| **Azure SQL** (`AZURE_SQL_*`) | Transactions only |

### Local dev — Azure (no Docker)

```bash
cd ../portfolio-infra && make apply-dev
cd ../portfolio-api
npm run start:dev        # Cosmos + SQL + Storage → Azure dev (no Azurite, no migrations)
# or local Azurite for queues/blob:
npm run storage:start && npm run start:local   # terminal A + B
# schema changes only when needed:
npm run db:migrate
```

- `npm run cosmos:azure` — Terraform + `az` → `COSMOS_*`, database `portfolio-dev`
- `npm run sql:azure` — Terraform → `AZURE_SQL_*`, database `sqldb-dev`
- `npm run secrets:azure-local` — optional integration secrets from Key Vault → `.local-secrets.json`

**Note:** `sqldb-dev` is shared by all developers using this Azure stack.

### Other modes

- `STORAGE_MODE=disk` — `.local-data/` only
- `STORAGE_MODE=memory` — tests

## SimpleFIN / SnapTrade / URLs

See previous docs in git history or `local.settings.json.example` for variable tables.

## Files

- `local.values.example.json` — local (`APP_ENV=local`)
- `development.values.example.json` — dev deployment (`sqldb-dev`)
- `production.values.example.json` — prod deployment (`sqldb-prod`)

## SimpleFIN

| Variable | Description |
| -------- | ----------- |
| `SIMPLEFIN_ACCESS_URL` | Claimed Access URL. Optional if using Connections UI (`.local-secrets.json` locally). |
| `SIMPLEFIN_ACCESS_URL__LOCAL_HOUSEHOLD` | Per-household override (`local-household` → `LOCAL_HOUSEHOLD`). |

## SnapTrade

| Variable | Description |
| -------- | ----------- |
| `SNAPTRADE_CLIENT_ID` | SnapTrade client id |
| `SNAPTRADE_CONSUMER_KEY` | SnapTrade consumer key |
| `SNAPTRADE_WEBHOOK_SECRET` | Webhook HMAC secret |
| `SNAPTRADE_REDIRECT_URL` | OAuth callback (defaults from `API_PUBLIC_BASE_URL`) |

## URLs

| Variable | Description |
| -------- | ----------- |
| `API_PUBLIC_BASE_URL` | Public API base (no `/api` suffix) |
| `WEB_APP_URL` | Frontend origin (CORS) |
