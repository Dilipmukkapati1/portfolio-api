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
npm run start:dev        # fast: skips settings sync + build when already configured
npm run start:dev:sync   # refresh Cosmos/SQL/Storage from Azure, then start
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

## Market data (instruments)

| Variable | Description |
| -------- | ----------- |
| `INSTRUMENT_DATA_PROVIDER` | `stub` (default) or `fmp` |
| `FMP_API_KEY` | [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs) API key (required when provider is `fmp`) |
| `FMP_BASE_URL` | Optional; defaults to `https://financialmodelingprep.com/stable` |

With `INSTRUMENT_DATA_PROVIDER=fmp` and a valid `FMP_API_KEY`, `/api/instruments/search` and `/api/instruments/{ticker}/profile` use live quotes, returns, and ETF metadata, with the stub catalog as fallback for search and estimated projection fields.

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

## OpenRouter (Tax Advisor)

| Variable | Description |
| -------- | ----------- |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) API key — local: `local.settings.json`; dev/prod: Key Vault `dev-openrouter-api-key` / `prod-openrouter-api-key` via Terraform app setting |
| `OPENROUTER_MODEL` | Optional model id; omitted uses `openrouter/auto` |

## URLs

| Variable | Description |
| -------- | ----------- |
| `API_PUBLIC_BASE_URL` | Public API base (no `/api` suffix) |
| `WEB_APP_URL` | Frontend origin (CORS) |
