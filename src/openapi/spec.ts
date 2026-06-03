import type { OpenAPIV3 } from "./types.js";

const filingStatusEnum = [
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
] as const;

const personaEnum = [
  "w2_employee",
  "low_income",
  "business_owner",
  "family_with_kids",
] as const;

const transactionCategoryEnum = [
  "income",
  "transfer",
  "housing",
  "utilities",
  "food",
  "transport",
  "healthcare",
  "insurance",
  "entertainment",
  "shopping",
  "education",
  "taxes",
  "fees",
  "investment",
  "other",
  "uncategorized",
] as const;

const investmentCategoryEnum = [
  "cash",
  "stock",
  "etf",
  "mutual_fund",
  "bond",
  "other",
] as const;

const accountSourceEnum = ["simplefin", "snaptrade", "manual"] as const;

export function buildOpenApiSpec(serverUrl: string): OpenAPIV3.Document {
  const spec: OpenAPIV3.Document = {
    openapi: "3.0.3",
    info: {
      title: "Portfolio API",
      version: "0.1.0",
      description:
        "Personal portfolio management API (Azure Functions). MVP auth uses the `x-household-id` header; defaults to `local-household` when omitted.\n\n**Disclaimer:** Tax endpoints return educational estimates only — not tax, legal, or investment advice.",
      contact: { name: "Portfolio" },
    },
    servers: [{ url: serverUrl, description: "Current host" }],
    tags: [
      { name: "System", description: "Health and documentation" },
      { name: "Household", description: "Household profile and settings" },
      { name: "Accounts", description: "Linked financial accounts" },
      { name: "Transactions", description: "Cash transactions and categorization" },
      { name: "Investments", description: "Holdings and net worth" },
      { name: "Investment Plan", description: "Target allocation and projections" },
      { name: "Tax", description: "Federal tax estimates and strategies" },
      { name: "Integrations", description: "SimpleFIN and SnapTrade" },
      { name: "Batch", description: "Heavy jobs (Phase 2+)" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          operationId: "getHealth",
          security: [],
          responses: {
            "200": {
              description: "Service is up",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/api/household": {
        get: {
          tags: ["Household"],
          summary: "Get household",
          operationId: "getHousehold",
          responses: {
            "200": {
              description: "Household record",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Household" },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        post: {
          tags: ["Household"],
          summary: "Create household",
          operationId: "createHousehold",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateHouseholdRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Household" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
        put: {
          tags: ["Household"],
          summary: "Update household (upsert if missing)",
          operationId: "updateHousehold",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateHouseholdRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated household",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Household" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/accounts": {
        get: {
          tags: ["Accounts"],
          summary: "List accounts",
          operationId: "listAccounts",
          responses: {
            "200": {
              description: "Accounts for household",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accounts: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Account" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/transactions": {
        get: {
          tags: ["Transactions"],
          summary: "List transactions",
          operationId: "listTransactions",
          parameters: [
            {
              name: "accountId",
              in: "query",
              schema: { type: "string" },
            },
            {
              name: "category",
              in: "query",
              schema: {
                type: "string",
                enum: [...transactionCategoryEnum],
              },
            },
            { name: "startDate", in: "query", schema: { type: "string" } },
            { name: "endDate", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 100, maximum: 500 },
            },
            {
              name: "cursor",
              in: "query",
              description:
                "Opaque cursor from a previous page's nextCursor (ordered by date desc, id desc)",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Filtered transactions",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      transactions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Transaction" },
                      },
                      hasMore: { type: "boolean" },
                      nextCursor: { type: "string" },
                    },
                    required: ["transactions", "hasMore"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/transactions/summary": {
        get: {
          tags: ["Transactions"],
          summary: "Summarize transactions for a date range",
          operationId: "summarizeTransactions",
          parameters: [
            { name: "startDate", in: "query", required: true, schema: { type: "string" } },
            { name: "endDate", in: "query", required: true, schema: { type: "string" } },
            { name: "accountId", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Period summary",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TransactionSummaryResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "503": { description: "Azure SQL unavailable" },
          },
        },
      },
      "/api/transactions/categorize": {
        post: {
          tags: ["Transactions"],
          summary: "Categorize a transaction",
          operationId: "categorizeTransaction",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CategorizeTransactionRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated transaction",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Transaction" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/holdings": {
        get: {
          tags: ["Investments"],
          summary: "List holdings",
          operationId: "listHoldings",
          responses: {
            "200": {
              description: "Investment holdings",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      holdings: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Holding" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/investment-plan": {
        get: {
          tags: ["Investment Plan"],
          summary: "Get household investment plan",
          operationId: "getInvestmentPlan",
          responses: { "200": { description: "Investment plan document" } },
        },
        put: {
          tags: ["Investment Plan"],
          summary: "Upsert investment plan instruments",
          operationId: "upsertInvestmentPlan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpsertInvestmentPlanRequest" },
              },
            },
          },
          responses: { "200": { description: "Saved plan with summary" } },
        },
      },
      "/api/investment-plan/summary": {
        get: {
          tags: ["Investment Plan"],
          summary: "Plan vs actual summary totals",
          operationId: "getInvestmentPlanSummary",
          responses: { "200": { description: "Household plan summary" } },
        },
      },
      "/api/investment-plan/allocation": {
        get: {
          tags: ["Investment Plan"],
          summary: "Plan and actual allocation by asset class",
          operationId: "getInvestmentPlanAllocation",
          parameters: [
            {
              name: "unit",
              in: "query",
              schema: { type: "string", enum: ["dollar", "percent"] },
            },
          ],
          responses: { "200": { description: "Allocation rollup" } },
        },
      },
      "/api/expense-plan": {
        get: {
          tags: ["Expense Planner"],
          summary: "Get household expense plan",
          operationId: "getExpensePlan",
          responses: { "200": { description: "Expense plan document" } },
        },
        put: {
          tags: ["Expense Planner"],
          summary: "Upsert expense plan budgets and mapping rules",
          operationId: "upsertExpensePlan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpsertExpensePlanRequest" },
              },
            },
          },
          responses: { "200": { description: "Saved expense plan" } },
        },
      },
      "/api/expense-plan/mappings/apply": {
        post: {
          tags: ["Expense Planner"],
          summary: "Apply mapping rules to past transactions",
          operationId: "applyExpenseMappingRules",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplyMappingRulesRequest" },
              },
            },
          },
          responses: { "200": { description: "Apply result" } },
        },
      },
      "/api/instruments/search": {
        get: {
          tags: ["Investment Plan"],
          summary: "Search instrument catalog",
          operationId: "searchInstruments",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Search results" } },
        },
      },
      "/api/instruments/{ticker}/profile": {
        get: {
          tags: ["Investment Plan"],
          summary: "Fund profile for ticker",
          operationId: "getInstrumentProfile",
          parameters: [
            { name: "ticker", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Fund profile" } },
        },
      },
      "/api/projections/instrument": {
        post: {
          tags: ["Investment Plan"],
          summary: "Project single instrument growth",
          operationId: "projectInstrument",
          responses: { "200": { description: "Projection series" } },
        },
      },
      "/api/projections/portfolio": {
        post: {
          tags: ["Investment Plan"],
          summary: "Project portfolio from plan allocations",
          operationId: "projectPortfolio",
          responses: { "200": { description: "Projection series" } },
        },
      },
      "/api/networth": {
        get: {
          tags: ["Investments"],
          summary: "Net worth snapshot",
          operationId: "getNetworth",
          responses: {
            "200": {
              description: "Summary, accounts, and holdings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/NetworthResponse" },
                },
              },
            },
          },
        },
      },
      "/api/tax/estimate": {
        post: {
          tags: ["Tax"],
          summary: "Estimate federal tax",
          operationId: "estimateTax",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TaxYearInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Estimate with disclaimer",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TaxEstimateResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/tax/strategies": {
        get: {
          tags: ["Tax"],
          summary: "Suggest tax strategies",
          operationId: "getTaxStrategies",
          parameters: [
            {
              name: "wages",
              in: "query",
              description: "Annual wages for strategy context",
              schema: { type: "number", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Strategies with disclaimer",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TaxStrategiesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/integrations/simplefin/connect": {
        post: {
          tags: ["Integrations"],
          summary: "Connect SimpleFIN (claim setup token)",
          operationId: "connectSimplefin",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectSimplefinRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Connected; sync may be queued",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/SimplefinConnectResponse",
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/integrations/simplefin/sync": {
        post: {
          tags: ["Integrations"],
          summary: "Sync SimpleFIN data into the local database",
          operationId: "syncSimplefin",
          responses: {
            "200": {
              description: "Completed sync",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SimplefinSyncResult" },
                },
              },
            },
            "429": {
              description: "Daily SimpleFIN request limit (24) reached",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/integrations/snaptrade/connect": {
        post: {
          tags: ["Integrations"],
          summary: "Start SnapTrade OAuth",
          operationId: "connectSnaptrade",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectSnaptradeRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "OAuth redirect URI",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SnaptradeConnectResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/integrations/snaptrade/sync": {
        post: {
          tags: ["Integrations"],
          summary: "Sync SnapTrade data into the local database",
          operationId: "syncSnaptrade",
          responses: {
            "200": {
              description: "Completed sync",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SnaptradeSyncResult" },
                },
              },
            },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/integrations/snaptrade/callback": {
        get: {
          tags: ["Integrations"],
          summary: "SnapTrade OAuth callback",
          operationId: "snaptradeCallback",
          parameters: [
            {
              name: "snaptrade",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Callback acknowledged",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SnaptradeCallbackResponse" },
                },
              },
            },
          },
        },
      },
      "/api/integrations/snaptrade/webhook": {
        post: {
          tags: ["Integrations"],
          summary: "SnapTrade webhook receiver",
          operationId: "snaptradeWebhook",
          security: [{ SnaptradeSignature: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  description: "SnapTrade webhook payload",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook accepted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      received: { type: "boolean" },
                      duplicate: { type: "boolean" },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/batch/submit": {
        post: {
          tags: ["Batch"],
          summary: "Submit batch job (Phase 2+ stub)",
          operationId: "submitBatch",
          responses: {
            "200": {
              description: "Deferred — use queue workers in MVP",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BatchSubmitResponse" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        HouseholdId: {
          type: "apiKey",
          in: "header",
          name: "x-household-id",
          description:
            "Household scope for all data. Defaults to `local-household` when omitted (see DEFAULT_HOUSEHOLD_ID).",
        },
        SnaptradeSignature: {
          type: "apiKey",
          in: "header",
          name: "x-snaptrade-signature",
          description: "HMAC signature from SnapTrade (required in production).",
        },
      },
      responses: {
        BadRequest: {
          description: "Validation or client error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        Unauthorized: {
          description: "Invalid credentials or signature",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        ServerError: {
          description: "Server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: { error: { type: "string" } },
          required: ["error"],
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            service: { type: "string", example: "portfolio-api" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        Household: {
          type: "object",
          properties: {
            id: { type: "string" },
            householdId: { type: "string" },
            displayName: { type: "string" },
            state: { type: "string", minLength: 2, maxLength: 2, example: "CA" },
            filingStatus: { type: "string", enum: [...filingStatusEnum] },
            dependents: { type: "integer", minimum: 0 },
            persona: { type: "string", enum: [...personaEnum] },
            netWorthSummary: { $ref: "#/components/schemas/NetWorthSummary" },
            settings: {
              type: "object",
              properties: {
                currency: { type: "string" },
                timezone: { type: "string" },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateHouseholdRequest: {
          type: "object",
          required: ["displayName", "state", "filingStatus", "persona"],
          properties: {
            displayName: { type: "string", minLength: 1 },
            state: { type: "string", minLength: 2, maxLength: 2 },
            filingStatus: { type: "string", enum: [...filingStatusEnum] },
            dependents: { type: "integer", minimum: 0, default: 0 },
            persona: { type: "string", enum: [...personaEnum] },
          },
        },
        UpdateHouseholdRequest: {
          type: "object",
          properties: {
            displayName: { type: "string" },
            state: { type: "string", minLength: 2, maxLength: 2 },
            filingStatus: { type: "string", enum: [...filingStatusEnum] },
            dependents: { type: "integer", minimum: 0 },
            persona: { type: "string", enum: [...personaEnum] },
          },
        },
        Account: {
          type: "object",
          properties: {
            id: { type: "string" },
            householdId: { type: "string" },
            accountId: { type: "string" },
            source: { type: "string", enum: [...accountSourceEnum] },
            displayName: { type: "string" },
            institutionName: { type: "string" },
            accountType: { type: "string" },
            currency: { type: "string" },
            balance: { type: "number" },
            isActive: { type: "boolean" },
            lastSyncedAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "string" },
            householdId: { type: "string" },
            txnId: { type: "string" },
            accountId: { type: "string" },
            accountName: { type: "string" },
            source: { type: "string", enum: ["simplefin", "snaptrade", "manual"] },
            amount: { type: "number" },
            currency: { type: "string" },
            date: { type: "string" },
            transactedAt: { type: "string", format: "date-time" },
            postedAt: { type: "string", format: "date-time" },
            description: { type: "string" },
            memo: { type: "string" },
            merchant: { type: "string" },
            category: { type: "string", enum: [...transactionCategoryEnum] },
            categorySource: { type: "string", enum: ["auto", "user", "provider"] },
            providerCategory: { type: "string" },
            pending: { type: "boolean" },
            externalId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TransactionSummaryResponse: {
          type: "object",
          properties: {
            totalCredits: { type: "number" },
            totalSpend: { type: "number" },
            spendByCategory: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            spendByAccount: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            spendByCategoryPercent: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            spendByAccountPercent: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            transactionCount: { type: "integer" },
          },
        },
        UpsertExpensePlanRequest: {
          type: "object",
          properties: {
            categories: {
              type: "array",
              items: { $ref: "#/components/schemas/ExpenseCategoryPreference" },
            },
            mappingRules: {
              type: "array",
              items: { $ref: "#/components/schemas/ExpenseMappingRule" },
            },
          },
        },
        ApplyMappingRulesRequest: {
          type: "object",
          properties: {
            ruleIds: { type: "array", items: { type: "string" } },
          },
        },
        ExpenseCategoryPreference: {
          type: "object",
          required: ["category"],
          properties: {
            category: { type: "string", enum: [...transactionCategoryEnum] },
            label: { type: "string" },
            hidden: { type: "boolean" },
            monthlyBudget: { type: "number" },
          },
        },
        ExpenseMappingRule: {
          type: "object",
          required: ["id", "matchType", "pattern", "category"],
          properties: {
            id: { type: "string" },
            matchType: {
              type: "string",
              enum: ["merchant_contains", "merchant_equals", "type_equals"],
            },
            pattern: { type: "string" },
            category: { type: "string", enum: [...transactionCategoryEnum] },
            applyToPast: { type: "boolean" },
            sortOrder: { type: "integer" },
          },
        },
        CategorizeTransactionRequest: {
          type: "object",
          required: ["txnId", "category"],
          properties: {
            txnId: { type: "string" },
            category: { type: "string", enum: [...transactionCategoryEnum] },
          },
        },
        Holding: {
          type: "object",
          properties: {
            id: { type: "string" },
            householdId: { type: "string" },
            holdingId: { type: "string" },
            accountId: { type: "string" },
            symbol: { type: "string" },
            description: { type: "string" },
            quantity: { type: "number" },
            price: { type: "number" },
            marketValue: { type: "number" },
            currency: { type: "string" },
            category: { type: "string", enum: [...investmentCategoryEnum] },
            assetClass: { type: "string" },
            lastSyncedAt: { type: "string", format: "date-time" },
          },
        },
        NetWorthSummary: {
          type: "object",
          properties: {
            totalAssets: { type: "number" },
            totalLiabilities: { type: "number" },
            netWorth: { type: "number" },
            cashBalance: { type: "number" },
            investmentValue: { type: "number" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        NetworthResponse: {
          type: "object",
          properties: {
            summary: {
              oneOf: [
                { $ref: "#/components/schemas/NetWorthSummary" },
                { type: "null" },
              ],
            },
            accounts: {
              type: "array",
              items: { $ref: "#/components/schemas/Account" },
            },
            holdings: {
              type: "array",
              items: { $ref: "#/components/schemas/Holding" },
            },
          },
        },
        TaxYearInput: {
          type: "object",
          required: ["taxYear", "filingStatus"],
          properties: {
            taxYear: { type: "integer", example: 2025 },
            filingStatus: { type: "string", enum: [...filingStatusEnum] },
            wages: { type: "number", default: 0 },
            selfEmploymentIncome: { type: "number", default: 0 },
            interestIncome: { type: "number", default: 0 },
            dividendIncome: { type: "number", default: 0 },
            capitalGainsShort: { type: "number", default: 0 },
            capitalGainsLong: { type: "number", default: 0 },
            otherIncome: { type: "number", default: 0 },
            adjustments: { type: "number", default: 0 },
            itemizedDeductions: { type: "number" },
            standardDeductionOverride: { type: "number" },
            dependents: { type: "integer", minimum: 0, default: 0 },
            retirementContributions: { type: "number", default: 0 },
            hsaContributions: { type: "number", default: 0 },
          },
        },
        TaxEstimate: {
          type: "object",
          properties: {
            taxYear: { type: "integer" },
            adjustedGrossIncome: { type: "number" },
            taxableIncome: { type: "number" },
            standardDeduction: { type: "number" },
            federalTax: { type: "number" },
            effectiveRate: { type: "number" },
            marginalRate: { type: "number" },
            breakdown: { type: "object", additionalProperties: { type: "number" } },
          },
        },
        TaxEstimateResponse: {
          type: "object",
          properties: {
            estimate: { $ref: "#/components/schemas/TaxEstimate" },
            disclaimer: { type: "string" },
          },
        },
        Strategy: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            estimatedSavings: { type: "number" },
            eligibility: { type: "string" },
            risks: { type: "string" },
            missingData: { type: "array", items: { type: "string" } },
            priority: { type: "integer" },
          },
        },
        TaxStrategiesResponse: {
          type: "object",
          properties: {
            strategies: {
              type: "array",
              items: { $ref: "#/components/schemas/Strategy" },
            },
            disclaimer: { type: "string" },
          },
        },
        ConnectSimplefinRequest: {
          type: "object",
          required: ["setupToken"],
          properties: { setupToken: { type: "string" } },
        },
        SimplefinConnectResponse: {
          type: "object",
          properties: {
            connected: { type: "boolean" },
            secretStored: { type: "boolean" },
            message: { type: "string" },
          },
        },
        SimplefinQueuedResponse: {
          type: "object",
          properties: { queued: { type: "boolean", example: true } },
        },
        SimplefinSyncResult: {
          type: "object",
          properties: {
            accountsSynced: { type: "integer" },
            transactionsSynced: { type: "integer" },
            syncedAt: { type: "string", format: "date-time" },
          },
          additionalProperties: true,
        },
        ConnectSnaptradeRequest: {
          type: "object",
          properties: { redirectUrl: { type: "string", format: "uri" } },
        },
        SnaptradeConnectResponse: {
          type: "object",
          properties: {
            redirectUri: { type: "string", format: "uri" },
            userId: { type: "string" },
          },
        },
        SnaptradeCallbackResponse: {
          type: "object",
          properties: {
            status: { type: "string" },
            message: { type: "string" },
          },
        },
        SnaptradeSyncResult: {
          type: "object",
          properties: {
            holdingsSynced: { type: "integer" },
            syncedAt: { type: "string", format: "date-time" },
            message: { type: "string" },
          },
          additionalProperties: true,
        },
        BatchSubmitResponse: {
          type: "object",
          properties: {
            deferred: { type: "boolean" },
            message: { type: "string" },
            householdId: { type: "string" },
          },
        },
      },
    },
    security: [{ HouseholdId: [] }],
  };

  return spec;
}
