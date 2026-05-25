import { describe, expect, it } from "vitest";
import { MemoryPortfolioStore } from "./memoryStore.js";
import type { Transaction } from "@portfolio/contracts";

function makeTxn(
  id: string,
  date: string,
  amount: number
): Transaction {
  return {
    id,
    householdId: "h1",
    txnId: `txn-${id}`,
    accountId: "a1",
    source: "simplefin",
    amount,
    currency: "USD",
    date,
    description: `Txn ${id}`,
    category: "other",
    categorySource: "auto",
    pending: false,
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
  };
}

describe("transaction pagination", () => {
  it("returns pages in date/id order with cursor", async () => {
    const store = new MemoryPortfolioStore();
    await store.transactions.upsert(makeTxn("c", "2026-05-03", -10));
    await store.transactions.upsert(makeTxn("b", "2026-05-02", 20));
    await store.transactions.upsert(makeTxn("a", "2026-05-01", -5));

    const first = await store.transactions.list("h1", { limit: 2 });
    expect(first.transactions.map((t) => t.id)).toEqual(["c", "b"]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await store.transactions.list("h1", {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.transactions.map((t) => t.id)).toEqual(["a"]);
    expect(second.hasMore).toBe(false);
  });
});
