import { afterEach, describe, expect, it } from "vitest";
import { getDataStore, resetDataStoreForTests } from "./index.js";

describe("storage", () => {
  afterEach(() => {
    resetDataStoreForTests();
    delete process.env.STORAGE_MODE;
    delete process.env.COSMOS_ENDPOINT;
  });

  it("uses memory when STORAGE_MODE=memory", async () => {
    process.env.STORAGE_MODE = "memory";
    const store = await getDataStore();
    expect(store.mode).toBe("memory");
    const created = await store.household.create("h1", {
      displayName: "Test",
      primaryState: "CA",
      persona: "w2_employee",
    });
    expect(created.householdId).toBe("h1");
    const accounts = await store.accounts.listByHousehold("h1");
    expect(accounts).toEqual([]);

    await store.household.create("h2", {
      displayName: "Other",
      primaryState: "NY",
      persona: "w2_employee",
    });
    expect((await store.household.list()).map((h) => h.householdId).sort()).toEqual([
      "h1",
      "h2",
    ]);

    expect(await store.household.delete("h1")).toBe(true);
    expect(await store.household.get("h1")).toBeNull();
    expect((await store.household.list()).map((h) => h.householdId)).toEqual(["h2"]);
  });
});
