import { afterEach, describe, expect, it } from "vitest";
import { getDataStore, resetDataStoreForTests } from "./index.js";

describe("members.replaceAll", () => {
  afterEach(() => {
    resetDataStoreForTests();
    delete process.env.STORAGE_MODE;
  });

  it("persists incomeSources and contributions on members", async () => {
    process.env.STORAGE_MODE = "memory";
    const store = await getDataStore();
    await store.household.create("hh1", {
      displayName: "Test",
      primaryState: "CA",
      persona: "w2_employee",
    });

    const saved = await store.members.replaceAll("hh1", {
      members: [
        {
          name: "Alex",
          relationship: "self",
          isActive: true,
          incomeSources: [{ id: "inc-1", type: "wages", amount: 120000 }],
          contributions: [{ id: "c-1", type: "401k", amount: 23000 }],
        },
      ],
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.incomeSources[0]?.amount).toBe(120000);

    const reloaded = await store.members.listByHousehold("hh1");
    expect(reloaded[0]?.incomeSources).toEqual([
      { id: "inc-1", type: "wages", amount: 120000 },
    ]);
    expect(reloaded[0]?.contributions[0]?.amount).toBe(23000);
  });
});
