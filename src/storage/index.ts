import {
  ensureCosmosDatabase,
  isCosmosConfigured,
  resetCosmosBootstrap,
  warmCosmosContainers,
} from "../cosmos/bootstrap.js";
import {
  configureCosmosTlsForEmulator,
  resetCosmosClient,
} from "../cosmos/client.js";
import { isSqlConfigured, probeSql } from "../sql/client.js";
import { sqlTransactionStore } from "../sql/transactionStore.js";
import { CosmosPortfolioStore } from "./cosmosStore.js";
import {
  createCompositeStore,
  createCompositeStoreWithSql,
  unavailableTransactions,
} from "./compositeStore.js";
import { createDiskPortfolioStore } from "./diskStore.js";
import { instrumentPortfolioStore } from "./instrumentation.js";
import {
  buildStorageSourceMap,
  formatStorageSourceMap,
  formatStorageSummary,
  type TransactionsBackend,
} from "./layout.js";
import { MemoryPortfolioStore } from "./memoryStore.js";
import type { PortfolioDataStore, PortfolioStoreCore } from "./types.js";

let store: PortfolioDataStore | null = null;
let initPromise: Promise<PortfolioDataStore> | null = null;

function storageMode(): string {
  return (process.env.STORAGE_MODE ?? "").toLowerCase();
}

function shouldPreferMemory(): boolean {
  const mode = storageMode();
  return mode === "memory" || mode === "inmemory";
}

function shouldUseDisk(): boolean {
  const mode = storageMode();
  return mode === "disk" || mode === "file" || mode === "local";
}

function prefersLocalStorage(): boolean {
  return shouldUseDisk() || shouldPreferMemory();
}

function isCosmosStorageMode(): boolean {
  const mode = storageMode();
  return !mode || mode === "cosmos";
}

/** Optional SQL for transactions when STORAGE_MODE=disk|memory (default: all-local). */
function useAzureSqlForTransactions(): boolean {
  if (prefersLocalStorage()) {
    return process.env.USE_AZURE_SQL === "true";
  }
  return isSqlConfigured();
}

function cosmosFallbackCoreStore(): PortfolioStoreCore {
  const fallback = (process.env.COSMOS_FALLBACK ?? "disk").toLowerCase();
  if (fallback === "memory") {
    console.warn(
      "[portfolio-api] Cosmos DB unavailable; core data using in-memory fallback."
    );
    return new MemoryPortfolioStore();
  }

  console.warn(
    "[portfolio-api] Cosmos DB unavailable; core data using disk fallback (.local-data/portfolio-store.json)."
  );
  return createDiskPortfolioStore();
}

async function probeCosmos(): Promise<boolean> {
  if (!isCosmosConfigured()) return false;
  try {
    configureCosmosTlsForEmulator();
    await ensureCosmosDatabase();
    return true;
  } catch (err) {
    console.warn(
      "[portfolio-api] Cosmos DB unavailable.",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

async function resolveCoreStore(): Promise<PortfolioStoreCore> {
  if (shouldPreferMemory()) {
    console.log("[portfolio-api] Storage core: memory (STORAGE_MODE=memory)");
    return new MemoryPortfolioStore();
  }

  if (shouldUseDisk()) {
    console.log("[portfolio-api] Storage core: disk (STORAGE_MODE=disk)");
    return createDiskPortfolioStore();
  }

  const cosmosOk = await probeCosmos();
  if (cosmosOk) {
    console.log(
      "[portfolio-api] Storage core: cosmos (accounts, holdings, households)"
    );
    await warmCosmosContainers();
    return new CosmosPortfolioStore();
  }

  if (isCosmosStorageMode()) {
    return cosmosFallbackCoreStore();
  }

  console.log("[portfolio-api] Storage core: memory (cosmos fallback)");
  return new MemoryPortfolioStore();
}

function finalizeStore(
  core: PortfolioStoreCore,
  transactionsBackend: TransactionsBackend
): PortfolioDataStore {
  const sources = buildStorageSourceMap(core.mode, transactionsBackend);
  console.log(
    `[portfolio-api] Storage sources (${formatStorageSummary(sources)}): ${formatStorageSourceMap(sources)}`
  );
  return instrumentPortfolioStore(core, sources);
}

async function buildStore(): Promise<PortfolioDataStore> {
  if (prefersLocalStorage()) {
    const local = await resolveCoreStore();
    const useSql = useAzureSqlForTransactions() && (await probeSql());
    if (useSql) {
      console.log(
        `[portfolio-api] Storage: composite — ${local.mode} (local core) + Azure SQL (transactions)`
      );
      return finalizeStore(
        createCompositeStoreWithSql(local, sqlTransactionStore),
        "azure-sql"
      );
    }

    console.log(
      `[portfolio-api] Storage: ${local.mode} (local — accounts, transactions, and sync state on disk/in-memory)`
    );
    return finalizeStore(local, "local");
  }

  const sqlOk = useAzureSqlForTransactions() && (await probeSql());
  const core = await resolveCoreStore();

  if (sqlOk) {
    console.log(
      `[portfolio-api] Storage: composite — ${core.mode} (accounts, holdings, households) + Azure SQL (transactions)`
    );
    return finalizeStore(
      createCompositeStoreWithSql(core, sqlTransactionStore),
      "azure-sql"
    );
  }

  if (isCosmosStorageMode()) {
    console.warn(
      "[portfolio-api] Azure SQL unavailable; transactions will fail until SQL is running (npm run azure:local && npm run db:migrate)."
    );
  }

  return finalizeStore(
    createCompositeStore(core, unavailableTransactions()),
    "unavailable"
  );
}

async function ensureDataStore(): Promise<PortfolioDataStore> {
  if (
    store &&
    store.sources.transactions === "unavailable" &&
    isSqlConfigured() &&
    (await probeSql())
  ) {
    console.log(
      "[portfolio-api] Azure SQL is available now; rebuilding storage (was unavailable at cold start)."
    );
    resetStorageConnection();
  }

  if (store) return store;
  if (!initPromise) {
    initPromise = buildStore().then((built) => {
      store = built;
      return built;
    });
  }
  return initPromise;
}

export async function getDataStore(): Promise<PortfolioDataStore> {
  return ensureDataStore();
}

/** Clear cached clients so the next request can reconnect or use disk fallback. */
export function resetStorageConnection(): void {
  store = null;
  initPromise = null;
  resetCosmosBootstrap();
  resetCosmosClient();
}

export function resetDataStoreForTests(): void {
  resetStorageConnection();
}
