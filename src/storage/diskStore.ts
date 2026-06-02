import fs from "node:fs";
import path from "node:path";
import { MemoryPortfolioStore } from "./memoryStore.js";
import type { PortfolioStoreCore } from "./types.js";

const DEFAULT_DISK_PATH = path.join(
  process.cwd(),
  ".local-data",
  "portfolio-store.json"
);

function resolveDiskPath(): string {
  return process.env.LOCAL_STORAGE_PATH ?? DEFAULT_DISK_PATH;
}

function wrapMutations<T extends Record<string, (...args: never[]) => unknown>>(
  target: T,
  persist: () => void,
  mutators: (keyof T)[]
): T {
  const out = { ...target };
  for (const key of mutators) {
    const fn = target[key];
    out[key] = (async (...args: Parameters<T[typeof key]>) => {
      const result = await fn(...args);
      persist();
      return result;
    }) as T[typeof key];
  }
  return out;
}

function loadFromDisk(store: MemoryPortfolioStore, filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const snapshot = JSON.parse(raw) as ReturnType<MemoryPortfolioStore["toSnapshot"]>;
    store.loadSnapshot(snapshot);
  } catch (err) {
    console.warn(
      "[portfolio-api] Failed to load disk storage; starting empty.",
      err instanceof Error ? err.message : err
    );
  }
}

function saveToDisk(store: MemoryPortfolioStore, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store.toSnapshot(), null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

export function createDiskPortfolioStore(
  filePath: string = resolveDiskPath()
): PortfolioStoreCore {
  const inner = new MemoryPortfolioStore();
  loadFromDisk(inner, filePath);
  const persist = () => saveToDisk(inner, filePath);

  return {
    mode: "disk",
    household: wrapMutations(inner.household, persist, [
      "create",
      "update",
      "delete",
      "updateNetWorthSummary",
    ]),
    members: wrapMutations(inner.members, persist, [
      "create",
      "update",
      "delete",
      "replaceAll",
      "deleteAllForHousehold",
    ]),
    taxProfiles: wrapMutations(inner.taxProfiles, persist, [
      "upsert",
      "delete",
      "deleteAllForHousehold",
    ]),
    investmentPlans: wrapMutations(inner.investmentPlans, persist, [
      "upsert",
      "delete",
    ]),
    accounts: wrapMutations(inner.accounts, persist, ["upsert"]),
    transactions: wrapMutations(inner.transactions, persist, [
      "upsert",
      "replace",
      "deleteAllForHousehold",
    ]),
    holdings: wrapMutations(inner.holdings, persist, ["upsert", "delete"]),
    integrations: wrapMutations(inner.integrations, persist, [
      "upsertToken",
      "upsertSyncState",
      "recordWebhookEvent",
    ]),
  };
}
