import fs from "node:fs";
import path from "node:path";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { getConfig } from "./config.js";
import { getEnvSecret } from "./envSecrets.js";

const credential = new DefaultAzureCredential();
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const LOCAL_SECRETS_FILE = path.join(process.cwd(), ".local-secrets.json");
const localMemory = new Map<string, string>();

function getSecretClient(): SecretClient | null {
  const { keyVaultName } = getConfig();
  if (!keyVaultName) return null;
  const url = `https://${keyVaultName}.vault.azure.net`;
  return new SecretClient(url, credential);
}

function readLocalSecretsFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(LOCAL_SECRETS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

function getLocalSecret(name: string): string | undefined {
  const cached = localMemory.get(name);
  if (cached) return cached;

  const fromFile = readLocalSecretsFile()[name];
  if (fromFile) {
    localMemory.set(name, fromFile);
  }
  return fromFile;
}

function setLocalSecret(name: string, value: string): boolean {
  localMemory.set(name, value);
  const all = { ...readLocalSecretsFile(), [name]: value };
  fs.writeFileSync(LOCAL_SECRETS_FILE, `${JSON.stringify(all, null, 2)}\n`);
  return true;
}

function envSecretPrefix(): string {
  const { appEnv } = getConfig();
  if (appEnv === "production") return "prod-";
  if (appEnv === "development") return "dev-";
  return "";
}

/** Map logical secret names to Key Vault names (dev-/prod- prefix in Azure). */
function keyVaultSecretNames(logicalName: string): string[] {
  const prefix = envSecretPrefix();
  if (!prefix || logicalName.startsWith(prefix)) return [logicalName];
  return [`${prefix}${logicalName}`, logicalName];
}

function cacheSecret(name: string, value: string): void {
  cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function getSecret(name: string): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const fromEnv = getEnvSecret(name);
  if (fromEnv) {
    return fromEnv;
  }

  const local = getLocalSecret(name);
  if (local) {
    return local;
  }

  const client = getSecretClient();
  if (!client) return undefined;

  for (const kvName of keyVaultSecretNames(name)) {
    try {
      const secret = await client.getSecret(kvName);
      const value = secret.value;
      if (value) {
        cacheSecret(name, value);
        return value;
      }
    } catch {
      // try next candidate name
    }
  }
  return undefined;
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
    return setLocalSecret(name, value);
  }
  const [kvName] = keyVaultSecretNames(name);
  await client.setSecret(kvName, value);
  cacheSecret(name, value);
  return true;
}
