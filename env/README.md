# Environment configuration (portfolio-api)

Copy the values for your target environment into `local.settings.json` → `Values` (local) or Azure Function **App Settings** (deployed).

Set `APP_ENV` to `local`, `development`, or `production`. URL defaults change per environment; override any value explicitly.

## Storage

Set `STORAGE_MODE=cosmos` (default) for the hybrid layout:

| Backend | Contents |
| ------- | -------- |
| **Cosmos DB** (`COSMOS_*`) | Households, members, **accounts** (bank/brokerage), **holdings**, tax profiles, scenarios, integration tokens, sync state |
| **Azure SQL** (`AZURE_SQL_*`) | **Transactions** only |

Local Docker (see `npm run dev:deps`):

- Cosmos emulator: `https://localhost:8081` + emulator key in `local.settings.json.example`
- SQL Server: `localhost:1433`, database `portfolio`, user `sa`

Alternative: `STORAGE_MODE=disk` stores all data in `.local-data/` (no Cosmos/SQL). `STORAGE_MODE=memory` is for tests.

## SimpleFIN

| Variable | Description |
| -------- | ----------- |
| `SIMPLEFIN_ACCESS_URL` | Claimed Access URL (`https://user:pass@beta-bridge.simplefin.org/simplefin`). Optional if you use **Connections → Connect** (saved to `.local-secrets.json` locally or Key Vault in Azure). |
| `SIMPLEFIN_ACCESS_URL__LOCAL_HOUSEHOLD` | Per-household override. Suffix = household id with `-` → `_`, uppercased. Example household `local-household` → `LOCAL_HOUSEHOLD`. |

**Setup tokens** (base64 from SimpleFIN Bridge) are **not** env vars — paste them in the web app Connections page once.

## SnapTrade

| Variable | Description |
| -------- | ----------- |
| `SNAPTRADE_CLIENT_ID` | SnapTrade client id |
| `SNAPTRADE_CONSUMER_KEY` | SnapTrade consumer key |
| `SNAPTRADE_WEBHOOK_SECRET` | Webhook HMAC secret |
| `SNAPTRADE_REDIRECT_URL` | OAuth callback URL (optional; defaults from `API_PUBLIC_BASE_URL`) |

## URLs

| Variable | Description |
| -------- | ----------- |
| `API_PUBLIC_BASE_URL` | Public API base (no `/api` suffix). Used for SnapTrade callback defaults. |
| `WEB_APP_URL` | Frontend origin (CORS / links). |

## Files

- `local.values.example.json` — local dev (`APP_ENV=local`)
- `development.values.example.json` — dev deployment
- `production.values.example.json` — production deployment
