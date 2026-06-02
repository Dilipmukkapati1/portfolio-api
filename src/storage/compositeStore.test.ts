import { describe, expect, it, vi } from "vitest";
import { createCompositeStore } from "./compositeStore.js";
import type { PortfolioStoreCore } from "./types.js";

function stubCore(): PortfolioStoreCore {
  return {
    mode: "memory",
    household: {
      list: async () => [],
      get: async () => null,
      create: async (_id, data) => ({
        id: "h1",
        householdId: "h1",
        displayName: data.displayName ?? "",
        state: "NY",
        persona: data.persona,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      update: async () => {
        throw new Error("not implemented");
      },
      delete: vi.fn(async () => true),
      updateNetWorthSummary: async () => {},
    },
    members: {
      listByHousehold: async () => [],
      get: async () => null,
      create: async () => {
        throw new Error("not implemented");
      },
      update: async () => {
        throw new Error("not implemented");
      },
      delete: async () => false,
      replaceAll: async () => [],
      deleteAllForHousehold: async () => {},
    },
    taxProfiles: {
      get: async () => null,
      upsert: async () => {
        throw new Error("not implemented");
      },
      delete: async () => false,
      deleteAllForHousehold: async () => {},
    },
    investmentPlans: {
      get: async () => null,
      upsert: async (plan) => plan,
      delete: async () => false,
    },
    accounts: {
      listByHousehold: async () => [],
      upsert: async (a) => a,
      findByExternalId: async () => null,
    },
    transactions: {
      list: async () => [],
      upsert: async (t) => t,
      get: async () => null,
      replace: async (t) => t,
      deleteAllForHousehold: vi.fn(async () => {}),
    },
    holdings: {
      listByHousehold: async () => [],
      upsert: async (h) => h,
      delete: async () => {},
    },
    integrations: {
      getToken: async () => null,
      upsertToken: async () => {},
      getSyncState: async () => null,
      upsertSyncState: async () => {},
      recordWebhookEvent: async () => true,
    },
  };
}

describe("createCompositeStore", () => {
  it("deletes SQL transactions before deleting household", async () => {
    const core = stubCore();
    const sqlTxns = {
      list: async () => [],
      upsert: async (t: { id: string }) => t,
      get: async () => null,
      replace: async (t: { id: string }) => t,
      deleteAllForHousehold: vi.fn(async () => {}),
    };

    const store = createCompositeStore(core, sqlTxns);
    await store.household.delete("hh-1");

    expect(sqlTxns.deleteAllForHousehold).toHaveBeenCalledWith("hh-1");
    expect(core.household.delete).toHaveBeenCalledWith("hh-1");
  });
});
