import type { PortfolioDataStore } from "./types.js";

export type TransactionsBackend =
  | "azure-sql"
  | "local"
  | "unavailable";

export type StorageSourceMap = {
  core: PortfolioDataStore["mode"];
  transactions: TransactionsBackend;
  entities: {
    households: string;
    members: string;
    accounts: string;
    holdings: string;
    taxProfiles: string;
    investmentPlans: string;
    integrationTokens: string;
    syncState: string;
    webhookEvents: string;
    transactions: string;
  };
};

function coreEntitySource(
  core: PortfolioDataStore["mode"],
  container: string
): string {
  if (core === "cosmos") return `cosmos:${container}`;
  if (core === "disk") return `disk:${container}`;
  return `memory:${container}`;
}

export function buildStorageSourceMap(
  core: PortfolioDataStore["mode"],
  transactions: TransactionsBackend
): StorageSourceMap {
  const txnSource =
    transactions === "azure-sql"
      ? "azure-sql:transactions"
      : transactions === "unavailable"
        ? "unavailable:transactions"
        : coreEntitySource(core, "transactions");

  return {
    core,
    transactions,
    entities: {
      households: coreEntitySource(core, "households"),
      members: coreEntitySource(core, "members"),
      accounts: coreEntitySource(core, "accounts"),
      holdings: coreEntitySource(core, "holdings"),
      taxProfiles: coreEntitySource(core, "taxProfiles"),
      investmentPlans: coreEntitySource(core, "investmentPlans"),
      integrationTokens: coreEntitySource(core, "integrationTokens"),
      syncState: coreEntitySource(core, "syncState"),
      webhookEvents: coreEntitySource(core, "webhookEvents"),
      transactions: txnSource,
    },
  };
}

export function formatStorageSourceMap(sources: StorageSourceMap): string {
  return Object.entries(sources.entities)
    .map(([entity, source]) => `${entity}=${source}`)
    .join(", ");
}

export function formatStorageSummary(sources: StorageSourceMap): string {
  return `core=${sources.core} transactions=${sources.transactions}`;
}

export function areTransactionsAvailable(sources: StorageSourceMap): boolean {
  return sources.transactions !== "unavailable";
}
