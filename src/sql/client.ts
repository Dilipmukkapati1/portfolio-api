import sql from "mssql";
import { getSecret } from "../lib/keyvault.js";
import { getConfig } from "../lib/config.js";
import { getEnvSecret } from "../lib/envSecrets.js";

let pool: sql.ConnectionPool | null = null;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

const TRANSIENT_CODES = new Set([
  "ETIMEOUT",
  "ECONNCLOSED",
  "ECONNRESET",
  "ESOCKET",
  "ELOGIN",
]);

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function isSqlConfigured(): boolean {
  if (readEnv("AZURE_SQL_CONNECTION_STRING")) return true;
  if (getEnvSecret("azure-sql-connection-string")) return true;
  const { keyVaultName } = getConfig();
  if (keyVaultName && readEnv("AZURE_SQL_DATABASE")) return true;
  const server = readEnv("AZURE_SQL_SERVER");
  const database = readEnv("AZURE_SQL_DATABASE");
  const user = readEnv("AZURE_SQL_USER");
  const password = readEnv("AZURE_SQL_PASSWORD");
  return Boolean(server && database && user && password);
}

async function resolveConnectionString(): Promise<string> {
  const direct =
    readEnv("AZURE_SQL_CONNECTION_STRING") ??
    (await getSecret("azure-sql-connection-string"));
  if (direct) return direct;

  const server = readEnv("AZURE_SQL_SERVER");
  const database = readEnv("AZURE_SQL_DATABASE") ?? "sqldb-dev";
  const user = readEnv("AZURE_SQL_USER");
  const password = readEnv("AZURE_SQL_PASSWORD");
  if (!server || !user || !password) {
    throw new Error("Azure SQL is not configured");
  }

  const encrypt = readEnv("AZURE_SQL_ENCRYPT") !== "false";
  const host = server.includes(",") ? server : `${server},1433`;
  return [
    `Server=tcp:${host}`,
    `Database=${database}`,
    `User Id=${user}`,
    `Password=${password}`,
    `Encrypt=${encrypt}`,
    encrypt ? "TrustServerCertificate=false" : "TrustServerCertificate=true",
    "Connection Timeout=30",
  ].join(";");
}

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (!poolPromise) {
    poolPromise = (async () => {
      const connectionString = await resolveConnectionString();
      const next = new sql.ConnectionPool(connectionString);
      next.on("error", (err: Error) => {
        console.warn("[portfolio-api] SQL pool error", err.message);
        pool = null;
        poolPromise = null;
      });
      await next.connect();
      pool = next;
      return next;
    })();
  }
  return poolPromise;
}

export async function probeSql(attempts = 3): Promise<boolean> {
  if (!isSqlConfigured()) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      const p = await getSqlPool();
      await p.request().query("SELECT 1 AS ok");
      return true;
    } catch (err) {
      pool = null;
      poolPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /40613|40615|40197|40501|timeout|paused|not currently available/i.test(
        message
      );
      if (i < attempts - 1 && retryable) {
        console.warn(
          `[portfolio-api] Azure SQL probe attempt ${i + 1} failed (${message}); retrying…`
        );
        await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
        continue;
      }
      console.warn("[portfolio-api] Azure SQL unavailable:", message);
      return false;
    }
  }
  return false;
}

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const message = (err as { message?: string }).message ?? "";
  return /40613|40615|40197|40501|49918|49919|49920|timeout/i.test(message);
}

export async function withSqlRetry<T>(
  operation: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || i === attempts - 1) throw err;
      pool = null;
      poolPromise = null;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

export function resetSqlPoolForTests(): void {
  pool = null;
  poolPromise = null;
}
