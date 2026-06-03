# Investment Plan API

Logical v1 resources mapped to Azure Functions routes under `/api/`.

| Resource | Methods | Route |
|----------|---------|-------|
| Investment plan | GET, PUT | `/api/investment-plan` |
| Plan summary | GET | `/api/investment-plan/summary` |
| Allocation rollup | GET | `/api/investment-plan/allocation` |
| Household plan mirror | GET, PUT | `/api/households/{householdId}/investment-plan` |
| Instrument search | GET | `/api/instruments/search` |
| Fund profile | GET | `/api/instruments/{ticker}/profile` |
| Instrument projection | POST | `/api/projections/instrument` |
| Portfolio projection | POST | `/api/projections/portfolio` |

## Auth headers

| Header | Required | Purpose |
|--------|----------|---------|
| `x-household-id` | Yes (defaults to `local-household` in dev) | Scopes plan and holdings rollup |
| `x-privacy-token` | No | Unlocks actual dollar values in summary/allocation |

Plan targets are always visible. Actual holdings dollars require privacy unlock; composition percents are always returned.

## Denominator rules

| UI surface | Denominator |
|------------|-------------|
| Plan `% NW`, plan dollars | `household.netWorthSummary.netWorth` (fallback: sum of account balances) |
| Actual inner donut ring `%` | Total synced holdings market value |
| Plan outer donut ring `%` | Sum of planned `% NW` by asset class |

Plan and actual rings intentionally use different denominators — the UI compares composition shape, not absolute NW alignment.

---

## GET `/api/investment-plan/summary`

**Response (unlocked)**

```json
{
  "privacyMode": "unlocked",
  "valuesUnlocked": true,
  "summary": {
    "netWorth": 850000,
    "plannedTotalDollars": 722500,
    "plannedTotalPercent": 85,
    "actualTotalDollars": 815000,
    "unallocatedDollars": 127500,
    "unallocatedPercent": 15,
    "instrumentCount": 7,
    "overAllocated": false,
    "privacyMode": "unlocked",
    "valuesUnlocked": true
  }
}
```

**Response (locked)** — `actualTotalDollars` in summary still reflects rollup internally but allocation endpoint nulls per-class dollars.

---

## GET `/api/investment-plan/allocation`

Query `unit=dollar|percent` is a display hint only; both `$` and `%` are always returned per class.

**Response (locked)**

```json
{
  "privacyMode": "locked",
  "valuesUnlocked": false,
  "netWorth": 850000,
  "actualTotalDollars": null,
  "classes": [
    {
      "assetClass": "index-funds",
      "label": "Index Funds",
      "planDollars": 187000,
      "planPercent": 22,
      "actualDollars": null,
      "actualPercent": 28.5
    }
  ]
}
```

---

## GET `/api/investment-plan`

Returns `{ "plan": InvestmentPlan }`. Empty `{ "instruments": [] }` when no document exists (no 404).

---

## PUT `/api/investment-plan`

**Request**

```json
{
  "instruments": [
    {
      "id": "uuid",
      "name": "VTI — Total US Market",
      "assetClass": "index-funds",
      "unit": "percent",
      "value": 22,
      "sortOrder": 0
    }
  ]
}
```

**Response**

```json
{
  "plan": {
    "id": "plan-hh-abc",
    "householdId": "hh-abc",
    "instruments": [],
    "updatedAt": "2026-06-02T12:00:00.000Z"
  },
  "summary": { },
  "warnings": ["Plan exceeds 100% of net worth"]
}
```

Server derives `ticker` from `name`, dedupes by ticker (last wins).

---

## GET `/api/instruments/search?q=VTI&limit=8`

```json
{
  "results": [
    { "ticker": "VTI", "name": "VTI — Total US Market" }
  ]
}
```

**Providers**

| `INSTRUMENT_DATA_PROVIDER` | Behavior |
|----------------------------|----------|
| `stub` (default) | Curated catalog (~13 tickers) with estimated profiles for unknown symbols |
| `fmp` | [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs) live search, quotes, returns, ETF expense ratios. Requires `FMP_API_KEY`. Falls back to stub when the API is unavailable. |

Optional profile fields when using `fmp`: `name`, `price`, `priceChange1d`, `marketCap`, `volume`, `exchange`, `currency`, `assetType`, `dataSource`, `asOf`.

---

## GET `/api/instruments/{ticker}/profile`

```json
{
  "profile": {
    "ticker": "VTI",
    "return1y": 0.124,
    "return3y": 0.082,
    "return5y": 0.095,
    "annualizedReturn": 0.098,
    "dividendYield": 0.013,
    "yearsSinceInception": 18,
    "inceptionLabel": "2006",
    "expenseRatio": 0.0003,
    "feeKind": "expense_ratio"
  }
}
```

---

## POST `/api/projections/instrument`

```json
{
  "ticker": "VTI",
  "principal": 187000,
  "period": "5y",
  "reinvestDividends": true
}
```

**Response**

```json
{
  "projection": {
    "categories": ["Today", "Yr 5", "Yr 10"],
    "values": [187000, 250000, 320000],
    "milestones": [
      { "years": 10, "future": 320000, "gain": 133000, "multiple": 1.71 }
    ],
    "totalPrincipal": 187000,
    "instrumentCount": 1
  }
}
```

DRIP rate: `(1 + priceReturn) × (1 + dividendYield) − 1`.

---

## POST `/api/projections/portfolio`

```json
{
  "netWorth": 850000,
  "instruments": [
    { "name": "VTI — Total US Market", "assetClass": "index-funds", "unit": "percent", "value": 22 }
  ],
  "period": "5y",
  "reinvestDividends": true
}
```

---

## Field glossary (UI → JSON)

| UI label | JSON path |
|----------|-----------|
| Total net worth | `summary.netWorth` |
| Planned total | `summary.plannedTotalDollars` / `summary.plannedTotalPercent` |
| Unallocated | `summary.unallocatedDollars` / `summary.unallocatedPercent` |
| Plan ring slice | `classes[].planPercent` or `planDollars` |
| Actual ring slice | `classes[].actualPercent` (actual dollars when unlocked) |
| Explorer allocation % | PUT `instruments[].value` when `unit: "percent"` |

---

## Cosmos container

Document id: `plan-{householdId}`, partition key `/householdId`.

Provision in Azure: `cd portfolio-infra && make apply-dev`
