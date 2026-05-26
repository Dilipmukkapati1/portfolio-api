export type AppEnv = "local" | "development" | "production";

const ENV_DEFAULTS = {
  local: {
    apiPublicBaseUrl: "http://localhost:7071",
    webAppUrl: "http://localhost:3000",
  },
  development: {
    apiPublicBaseUrl: "https://YOUR-DEV-FUNCTION.azurewebsites.net",
    webAppUrl: "https://YOUR-DEV-WEB.azurestaticapps.net",
  },
  production: {
    apiPublicBaseUrl: "https://YOUR-PROD-FUNCTION.azurewebsites.net",
    webAppUrl: "https://YOUR-PROD-WEB.azurestaticapps.net",
  },
} as const;

function parseAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "local").toLowerCase();
  if (raw === "development" || raw === "dev") return "development";
  if (raw === "production" || raw === "prod") return "production";
  return "local";
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Household id `local-household` → env suffix `LOCAL_HOUSEHOLD`. */
export function householdEnvSuffix(householdId: string): string {
  return householdId.replace(/-/g, "_").toUpperCase();
}

/** Read `BASE__HOUSEHOLD` override, then fall back to `BASE`. */
export function readHouseholdEnv(
  baseName: string,
  householdId: string
): string | undefined {
  const householdValue = readEnv(`${baseName}__${householdEnvSuffix(householdId)}`);
  if (householdValue) return householdValue;
  return readEnv(baseName);
}

export function getConfig() {
  const appEnv = parseAppEnv();
  const defaults = ENV_DEFAULTS[appEnv];

  return {
    appEnv,
    cosmosEndpoint: readEnv("COSMOS_ENDPOINT") ?? "",
    cosmosKey: readEnv("COSMOS_KEY"),
    cosmosDatabase:
      readEnv("COSMOS_DATABASE") ??
      "portfolio-dev",
    keyVaultName: readEnv("KEY_VAULT_NAME"),
    queueName: readEnv("PORTFOLIO_QUEUE_NAME") ?? "portfolio-sync",
    defaultHouseholdId: readEnv("DEFAULT_HOUSEHOLD_ID") ?? "local-household",
    authPassword: readEnv("AUTH_PASSWORD") ?? "portfolio",
    authSecret: readEnv("AUTH_SECRET") ?? "portfolio-dev-secret",
    privacyJwtSecret:
      readEnv("PRIVACY_JWT_SECRET") ??
      readEnv("AUTH_SECRET") ??
      "portfolio-dev-secret",
    apiPublicBaseUrl: readEnv("API_PUBLIC_BASE_URL") ?? defaults.apiPublicBaseUrl,
    webAppUrl: readEnv("WEB_APP_URL") ?? defaults.webAppUrl,
    integrations: {
      simplefin: {
        /** Claimed SimpleFIN Access URL (optional if using Connections UI). */
        accessUrl: readEnv("SIMPLEFIN_ACCESS_URL"),
        accessUrlForHousehold: (householdId: string) =>
          readHouseholdEnv("SIMPLEFIN_ACCESS_URL", householdId),
      },
      snaptrade: {
        clientId: readEnv("SNAPTRADE_CLIENT_ID"),
        consumerKey: readEnv("SNAPTRADE_CONSUMER_KEY"),
        webhookSecret: readEnv("SNAPTRADE_WEBHOOK_SECRET"),
        redirectUrl: readEnv("SNAPTRADE_REDIRECT_URL"),
      },
    },
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
