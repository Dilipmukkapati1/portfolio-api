import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { getConfig } from "./config.js";

const credential = new DefaultAzureCredential();
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getSecretClient(): SecretClient | null {
  const { keyVaultName } = getConfig();
  if (!keyVaultName) return null;
  const url = `https://${keyVaultName}.vault.azure.net`;
  return new SecretClient(url, credential);
}

export async function getSecret(name: string): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Local env fallback (same names as Key Vault)
  const envMap: Record<string, string | undefined> = {
    "simplefin-access-url": process.env.SIMPLEFIN_ACCESS_URL,
    "snaptrade-client-id": process.env.SNAPTRADE_CLIENT_ID,
    "snaptrade-consumer-key": process.env.SNAPTRADE_CONSUMER_KEY,
    "snaptrade-webhook-secret": process.env.SNAPTRADE_WEBHOOK_SECRET,
  };
  if (envMap[name]) {
    return envMap[name];
  }

  const client = getSecretClient();
  if (!client) return undefined;

  try {
    const secret = await client.getSecret(name);
    const value = secret.value;
    if (value) {
      cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return value;
  } catch {
    return undefined;
  }
}

export function secretNameForSimplefin(householdId: string): string {
  return `simplefin-access-url-${householdId}`;
}

export async function setSecret(
  name: string,
  value: string
): Promise<boolean> {
  const client = getSecretClient();
  if (!client) {
    // Local dev: cannot write to KV without vault
    return false;
  }
  await client.setSecret(name, value);
  cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return true;
}
