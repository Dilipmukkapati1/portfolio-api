import { getConfig, readHouseholdEnv } from "./config.js";

/** Map Key Vault secret names to environment variables (local / App Settings). */
export function getEnvSecret(name: string): string | undefined {
  const { integrations } = getConfig();

  switch (name) {
    case "simplefin-access-url":
      return integrations.simplefin.accessUrl;
    case "snaptrade-client-id":
      return integrations.snaptrade.clientId;
    case "snaptrade-consumer-key":
      return integrations.snaptrade.consumerKey;
    case "snaptrade-webhook-secret":
      return integrations.snaptrade.webhookSecret;
    default:
      break;
  }

  if (name.startsWith("simplefin-access-url-")) {
    const householdId = name.slice("simplefin-access-url-".length);
    return integrations.simplefin.accessUrlForHousehold(householdId);
  }

  if (name.startsWith("snaptrade-user-secret-")) {
    const householdId = name.slice("snaptrade-user-secret-".length);
    return readHouseholdEnv("SNAPTRADE_USER_SECRET", householdId);
  }

  return undefined;
}
