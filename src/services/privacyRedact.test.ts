import { describe, expect, it } from "vitest";
import type { Account, Holding, Transaction, TransactionSummaryResponse } from "@portfolio/contracts";
import {
  redactAccounts,
  redactHoldings,
  redactTransactionSummary,
  redactTransactions,
} from "./privacyRedact.js";

const now = new Date().toISOString();
const forbiddenKeys = new Set([
  "amount",
  "balance",
  "marketValue",
  "quantity",
  "price",
  "costBasis",
  "totalSpend",
  "totalCredits",
  "spendByCategory",
]);

function collectForbiddenKeys(value: unknown, hits = new Set<string>()) {
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, hits);
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) hits.add(key);
    collectForbiddenKeys(child, hits);
  }
  return hits;
}

describe("privacy redaction", () => {
  it("omits monetary keys from locked holdings, accounts, and transactions", () => {
    const holdings: Holding[] = [
      {
        id: "h1",
        householdId: "hh1",
        holdingId: "h1",
        accountId: "a1",
        symbol: "VTI",
        quantity: 10,
        price: 100,
        marketValue: 1000,
        costBasis: 800,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const accounts: Account[] = [
      {
        id: "a1",
        householdId: "hh1",
        accountId: "a1",
        source: "snaptrade",
        displayName: "Brokerage",
        balance: 1000,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "t1",
        householdId: "hh1",
        txnId: "t1",
        accountId: "a1",
        amount: -42,
        date: "2026-01-01",
        description: "Grocery",
        category: "food",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const redacted = {
      holdings: redactHoldings(holdings),
      accounts: redactAccounts(accounts, holdings),
      transactions: redactTransactions({ transactions, hasMore: false }),
    };

    expect([...collectForbiddenKeys(redacted)]).toEqual([]);
    expect(redacted.holdings[0]!.portfolioPercent).toBe(100);
    expect(redacted.transactions.transactions[0]!.direction).toBe("debit");
  });

  it("returns percent-only transaction summaries when locked", () => {
    const summary: TransactionSummaryResponse = {
      totalCredits: 500,
      totalSpend: 200,
      spendByCategory: {
        food: 50,
        housing: 150,
      },
      transactionCount: 4,
    };

    const redacted = redactTransactionSummary(summary);

    expect([...collectForbiddenKeys(redacted)]).toEqual([]);
    expect(redacted.spendByCategoryPercent).toEqual({
      food: 25,
      housing: 75,
    });
    expect(redacted.transactionCount).toBe(4);
  });
});
