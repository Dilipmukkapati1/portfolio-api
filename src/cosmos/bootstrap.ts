import { getCosmosClient, isEmulatorEndpoint } from "./client.js";
import { getConfig } from "../lib/config.js";
import type { Container } from "@azure/cosmos";

export const CONTAINERS = [
  "households",
  "members",
  "accounts",
  "holdings",
  "taxProfiles",
  "scenarios",
  "projectionRuns",
  "integrationTokens",
  "syncState",
  "webhookEvents",
] as const;

export type CosmosContainerName = (typeof CONTAINERS)[number];

let databaseReady = false;
let databasePromise: Promise<void> | null = null;
let warmupPromise: Promise<void> | null = null;
let creationQueue: Promise<void> = Promise.resolve();

const readyContainers = new Set<CosmosContainerName>();
const containerPromises = new Map<CosmosContainerName, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usingEmulator(): boolean {
  const { cosmosEndpoint } = getConfig();
  return Boolean(cosmosEndpoint && isEmulatorEndpoint(cosmosEndpoint));
}

function usingAzure(): boolean {
  const { cosmosEndpoint } = getConfig();
  return Boolean(cosmosEndpoint && !isEmulatorEndpoint(cosmosEndpoint));
}

function containerPauseMs(): number {
  return usingEmulator() ? 1_000 : 0;
}

function maxCreateAttempts(kind: "database" | "container"): number {
  if (!usingEmulator()) {
    return kind === "database" ? 4 : 4;
  }
  return kind === "database" ? 10 : 12;
}

function retryDelayMs(attempt: number): number {
  const base = usingEmulator() ? 3_000 : 2_000;
  return base * attempt;
}

function isCosmosThrottleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("high demand") ||
    msg.includes("429") ||
    msg.includes("Request rate is large")
  );
}

function isNotFoundError(err: unknown): boolean {
  return (err as { code?: number }).code === 404;
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = creationQueue.then(fn, fn);
  creationQueue = run.then(
    () => sleep(containerPauseMs()),
    () => sleep(containerPauseMs())
  );
  return run;
}

export function resetCosmosBootstrap(): void {
  databaseReady = false;
  databasePromise = null;
  warmupPromise = null;
  creationQueue = Promise.resolve();
  readyContainers.clear();
  containerPromises.clear();
}

export function isCosmosConfigured(): boolean {
  const { cosmosEndpoint, cosmosKey } = getConfig();
  if (!cosmosEndpoint) return false;
  if (cosmosKey) return true;
  return usingAzure();
}

async function createDatabaseIfNeeded(): Promise<void> {
  const { cosmosDatabase } = getConfig();
  const client = getCosmosClient();
  const maxAttempts = maxCreateAttempts("database");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.databases.createIfNotExists({ id: cosmosDatabase });
      return;
    } catch (err) {
      if (!isCosmosThrottleError(err) || attempt === maxAttempts) {
        throw err instanceof Error ? err : new Error("Cosmos DB bootstrap failed");
      }
      console.warn(
        `[portfolio-api] Cosmos database create throttled; retry ${attempt}/${maxAttempts}...`
      );
      await sleep(retryDelayMs(attempt));
    }
  }
}

async function verifyDatabaseExists(): Promise<void> {
  const { cosmosDatabase } = getConfig();
  try {
    await getCosmosClient().database(cosmosDatabase).read();
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new Error(
        `Cosmos database "${cosmosDatabase}" not found in Azure. ` +
          `Use portfolio-dev (terraform) and run: cd portfolio-infra && make apply-dev`
      );
    }
    throw err instanceof Error ? err : new Error("Cosmos DB database lookup failed");
  }
}

async function containerExists(name: CosmosContainerName): Promise<boolean> {
  const { cosmosDatabase } = getConfig();
  try {
    await getCosmosClient().database(cosmosDatabase).container(name).read();
    return true;
  } catch (err) {
    if (isNotFoundError(err)) return false;
    if (isCosmosThrottleError(err)) throw err;
    throw err instanceof Error ? err : new Error(`Cosmos container "${name}" lookup failed`);
  }
}

async function verifyContainerExists(name: CosmosContainerName): Promise<void> {
  if (await containerExists(name)) return;
  throw new Error(
    `Cosmos container "${name}" not found in Azure database. ` +
      `Containers are provisioned by Terraform: cd portfolio-infra && make apply-dev`
  );
}

async function createContainerIfNeeded(name: CosmosContainerName): Promise<void> {
  if (await containerExists(name)) return;

  const { cosmosDatabase } = getConfig();
  const db = getCosmosClient().database(cosmosDatabase);
  const maxAttempts = maxCreateAttempts("container");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.containers.createIfNotExists({
        id: name,
        partitionKey: { paths: ["/householdId"] },
      });
      return;
    } catch (err) {
      if (await containerExists(name)) return;
      if (!isCosmosThrottleError(err) || attempt === maxAttempts) {
        throw err instanceof Error ? err : new Error("Cosmos DB bootstrap failed");
      }
      console.warn(
        `[portfolio-api] Cosmos container "${name}" throttled; retry ${attempt}/${maxAttempts}...`
      );
      await sleep(retryDelayMs(attempt));
    }
  }
}

/** Ensures the Cosmos database exists (or is reachable in Azure). */
export async function ensureCosmosDatabase(): Promise<void> {
  if (databaseReady) return;
  if (!databasePromise) {
    databasePromise = (async () => {
      if (databaseReady) return;
      if (usingAzure()) {
        await verifyDatabaseExists();
      } else {
        await enqueue(() => createDatabaseIfNeeded());
      }
      databaseReady = true;
    })().catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  await databasePromise;
}

/** Ensures a container is ready before reads/writes. */
export async function ensureCosmosContainer(name: CosmosContainerName): Promise<void> {
  if (readyContainers.has(name)) return;

  let pending = containerPromises.get(name);
  if (!pending) {
    if (usingAzure()) {
      pending = (async () => {
        await ensureCosmosDatabase();
        await verifyContainerExists(name);
        readyContainers.add(name);
      })();
    } else {
      pending = enqueue(async () => {
        if (readyContainers.has(name)) return;
        await ensureCosmosDatabase();
        await createContainerIfNeeded(name);
        readyContainers.add(name);
      });
    }
    containerPromises.set(name, pending);
  }

  try {
    await pending;
  } catch (err) {
    containerPromises.delete(name);
    throw err;
  }
}

/** Lightweight readiness check used during storage probe. */
export async function ensureCosmosReady(): Promise<void> {
  await ensureCosmosDatabase();
}

export async function getContainerReady(
  name: CosmosContainerName
): Promise<Container> {
  await ensureCosmosContainer(name);
  const { cosmosDatabase } = getConfig();
  return getCosmosClient().database(cosmosDatabase).container(name);
}

/** Verify containers exist before serving traffic. */
export function warmCosmosContainers(): Promise<void> {
  if (!isCosmosConfigured()) return Promise.resolve();
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    const target = usingAzure() ? "Azure (Terraform-provisioned)" : "emulator (serialized create)";
    console.log(
      `[portfolio-api] Cosmos container warmup starting (${CONTAINERS.length} containers, ${target})...`
    );
    await ensureCosmosDatabase();
    if (usingAzure()) {
      await Promise.all(CONTAINERS.map((name) => ensureCosmosContainer(name)));
    } else {
      for (const containerName of CONTAINERS) {
        await ensureCosmosContainer(containerName);
      }
    }
    console.log("[portfolio-api] Cosmos container warmup finished");
  })().catch((err) => {
    warmupPromise = null;
    throw err;
  });

  return warmupPromise;
}
