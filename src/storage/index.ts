import { ensureCosmosReady, isCosmosConfigured } from "../cosmos/bootstrap.js";
import { configureCosmosTlsForEmulator } from "../cosmos/client.js";
import { CosmosPortfolioStore } from "./cosmosStore.js";
import { MemoryPortfolioStore } from "./memoryStore.js";
import type { PortfolioDataStore } from "./types.js";

let store: PortfolioDataStore | null = null;
let initPromise: Promise<PortfolioDataStore> | null = null;

function shouldPreferMemory(): boolean {
  const mode = (process.env.STORAGE_MODE ?? "").toLowerCase();
  return mode === "memory" || mode === "inmemory";
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

export async function getDataStore(): Promise<PortfolioDataStore> {
  if (store) return store;
  if (!initPromise) {
    initPromise = (async (): Promise<PortfolioDataStore> => {
      if (shouldPreferMemory()) {
        store = new MemoryPortfolioStore();
        console.log("[portfolio-api] Storage: memory (STORAGE_MODE=memory)");
        return store;
      }
      const cosmosOk = await probeCosmos();
      if (cosmosOk) {
        store = new CosmosPortfolioStore();
        console.log("[portfolio-api] Storage: cosmos");
        return store;
      }
      store = new MemoryPortfolioStore();
      console.log("[portfolio-api] Storage: memory (cosmos fallback)");
      return store;
    })();
  }
  return initPromise;
}

export function resetDataStoreForTests(): void {
  store = null;
  initPromise = null;
}
