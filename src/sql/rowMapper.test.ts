import { describe, expect, it } from "vitest";
import { rowToTransaction, transactionToRow } from "./rowMapper.js";

describe("rowMapper", () => {
  it("round-trips transaction fields", () => {
    const txn = {
      id: "sf-txn-a-1",
      householdId: "hh-1",
      txnId: "sf-txn-a-1",
      accountId: "acct-1",
      accountName: "Chase — Checking",
      source: "simplefin" as const,
      amount: -42.5,
      currency: "USD",
      date: "2026-05-01",
      transactedAt: "2026-05-01T15:00:00.000Z",
      postedAt: "2026-05-02T10:00:00.000Z",
      description: "Coffee shop",
      memo: "AMEX",
      merchant: "Starbucks",
      category: "food" as const,
      categorySource: "provider" as const,
      providerCategory: "restaurants",
      pending: false,
      externalId: "ext-1",
      createdAt: "2026-05-02T10:00:00.000Z",
      updatedAt: "2026-05-02T10:00:00.000Z",
    };

    const row = transactionToRow(txn);
    const back = rowToTransaction(row);

    expect(back).toMatchObject({
      id: txn.id,
      householdId: txn.householdId,
      amount: txn.amount,
      date: txn.date,
      category: txn.category,
      categorySource: txn.categorySource,
      providerCategory: txn.providerCategory,
      memo: txn.memo,
      accountName: txn.accountName,
    });
  });
});
