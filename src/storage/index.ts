import { ensureCosmosReady, isCosmosConfigured } from "../cosmos/bootstrap.js";
import { configureCosmosTlsForEmulator } from "../cosmos/client.js";
import { probeSql } from "../sql/client.js";
import { sqlTransactionStore } from "../sql/transactionStore.js";
import { CosmosPortfolioStore } from "./cosmosStore.js";
import {
  createCompositeStore,
  createCompositeStoreWithSql,
  unavailableTransactions,
} from "./compositeStore.js";
import { createDiskPortfolioStore } from "./diskStore.js";
import { MemoryPortfolioStore } from "./memoryStore.js";
import type { PortfolioDataStore } from "./types.js";

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

async function probeCosmos(): Promise<boolean> {
  if (!isCosmosConfigured()) return false;
  try {
    configureCosmosTlsForEmulator();
    await ensureCosmosReady();
    return true;
  } catch (err) {
    console.warn(
      "[portfolio-api] Cosmos DB unavailable; using in-memory storage for this session.",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

async function resolveCoreStore(): Promise<PortfolioDataStore> {
  if (shouldPreferMemory()) {
    console.log("[portfolio-api] Storage core: memory (STORAGE_MODE=memory)");
    return new MemoryPortfolioStore();
  }

  const cosmosOk = await probeCosmos();
  if (cosmosOk) {
    console.log("[portfolio-api] Storage core: cosmos");
    return new CosmosPortfolioStore();
  }

  if (shouldUseDisk()) {
    console.log("[portfolio-api] Storage core: disk (STORAGE_MODE=disk, cosmos unavailable)");
    return createDiskPortfolioStore();
  }

  console.log("[portfolio-api] Storage core: memory (cosmos fallback)");
  return new MemoryPortfolioStore();
}

export async function getDataStore(): Promise<PortfolioDataStore> {
  if (store) return store;
  if (!initPromise) {
    initPromise = (async (): Promise<PortfolioDataStore> => {
      const sqlOk = await probeSql();
      const explicitLocal = shouldUseDisk() || shouldPreferMemory();

      if (explicitLocal && !sqlOk) {
        store = await resolveCoreStore();
        console.warn(
          "[portfolio-api] Transactions require Azure SQL. Set AZURE_SQL_* and run npm run db:migrate."
        );
        return store;
      }

      const core = await resolveCoreStore();

      if (sqlOk) {
        store = createCompositeStoreWithSql(core, sqlTransactionStore);
        console.log(
          "[portfolio-api] Storage: composite (core → cosmos/disk/memory, transactions → Azure SQL)"
        );
        return store;
      }

      if (explicitLocal) {
        store = core;
        return store;
      }

      store = createCompositeStore(core, unavailableTransactions());
      console.warn(
        "[portfolio-api] Azure SQL unavailable; transaction routes will fail until SQL is configured."
      );
      return store;
    })();
  }
  return initPromise;
}

export function resetDataStoreForTests(): void {
  store = null;
  initPromise = null;
}
