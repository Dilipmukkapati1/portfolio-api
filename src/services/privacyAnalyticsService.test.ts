import { describe, expect, it } from "vitest";
import type { Account, Holding } from "@portfolio/contracts";
import { computeUninvestedCash } from "./privacyAnalyticsService.js";

const now = new Date().toISOString();

function account(overrides: Partial<Account>): Account {
  return {
    id: overrides.accountId ?? "account-1",
    householdId: "hh1",
    accountId: "account-1",
    source: "simplefin",
    displayName: "Checking",
    currency: "USD",
    balance: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: overrides.holdingId ?? "holding-1",
    householdId: "hh1",
    holdingId: "holding-1",
    accountId: "account-1",
    symbol: "CASH",
    quantity: 0,
    currency: "USD",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("computeUninvestedCash", () => {
  it("sums bank cash and brokerage cash holdings", () => {
    const accounts = [
      account({
        accountId: "checking",
        accountType: "depository",
        balance: 5_000,
        displayName: "Checking",
      }),
      account({
        accountId: "brokerage",
        accountType: "investment",
        balance: 50_000,
        displayName: "Brokerage",
      }),
    ];
    const holdings = [
      holding({
        accountId: "brokerage",
        holdingId: "voo",
        symbol: "VOO",
        quantity: 10,
        marketValue: 42_000,
      }),
      holding({
        accountId: "brokerage",
        holdingId: "cash",
        symbol: "CASH",
        quantity: 8_000,
        marketValue: 8_000,
      }),
    ];

    expect(computeUninvestedCash(accounts, holdings)).toBe(13_000);
  });

  it("counts residual brokerage cash when there is no cash holding row", () => {
    const accounts = [
      account({
        accountId: "brokerage",
        accountType: "investment",
        balance: 50_000,
        displayName: "Brokerage",
      }),
    ];
    const holdings = [
      holding({
        accountId: "brokerage",
        holdingId: "voo",
        symbol: "VOO",
        quantity: 10,
        marketValue: 42_000,
      }),
    ];

    expect(computeUninvestedCash(accounts, holdings)).toBe(8_000);
  });

  it("does not count invested securities as uninvested cash", () => {
    const accounts = [
      account({
        accountId: "brokerage",
        accountType: "investment",
        balance: 42_000,
        displayName: "Brokerage",
      }),
    ];
    const holdings = [
      holding({
        accountId: "brokerage",
        holdingId: "voo",
        symbol: "VOO",
        quantity: 10,
        marketValue: 42_000,
      }),
    ];

    expect(computeUninvestedCash(accounts, holdings)).toBe(0);
  });

  it("excludes credit, loan, and inactive accounts", () => {
    const accounts = [
      account({
        accountId: "checking",
        accountType: "checking",
        balance: 1_000,
      }),
      account({
        accountId: "card",
        accountType: "credit",
        balance: 2_000,
        displayName: "Credit Card",
      }),
      account({
        accountId: "inactive",
        accountType: "savings",
        balance: 3_000,
        isActive: false,
      }),
    ];

    expect(computeUninvestedCash(accounts, [])).toBe(1_000);
  });

  it("returns zero for SnapTrade accounts with securities but no cash", () => {
    const accounts = [
      account({
        accountId: "snaptrade",
        source: "snaptrade",
        accountType: "investment",
        balance: 0,
        displayName: "SnapTrade IRA",
      }),
    ];
    const holdings = [
      holding({
        accountId: "snaptrade",
        holdingId: "aapl",
        symbol: "AAPL",
        quantity: 10,
        marketValue: 2_000,
      }),
    ];

    expect(computeUninvestedCash(accounts, holdings)).toBe(0);
  });

  it("counts cash-category and money market holdings as uninvested cash", () => {
    const accounts = [
      account({
        accountId: "brokerage",
        source: "snaptrade",
        accountType: "investment",
        balance: 0,
        displayName: "SnapTrade Brokerage",
      }),
    ];
    const holdings = [
      holding({
        accountId: "brokerage",
        holdingId: "aapl",
        symbol: "AAPL",
        quantity: 10,
        marketValue: 10_000,
      }),
      holding({
        accountId: "brokerage",
        holdingId: "vmfxx",
        symbol: "VMFXX",
        description: "Vanguard Federal Money Market Fund",
        quantity: 1,
        marketValue: 2_260,
        category: "cash",
      }),
    ];

    expect(computeUninvestedCash(accounts, holdings)).toBe(2_260);
  });
});
