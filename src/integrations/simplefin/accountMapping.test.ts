import { describe, expect, it } from "vitest";
import {
  buildConnectionIndex,
  hardRefreshStartDate,
  incrementalStartDate,
  inferAccountType,
  isInitialSimplefinSync,
  resolveInstitutionName,
  resolveSimplefinSyncWindow,
  resolveSyncedAccountType,
  simpleFinAccountDocumentId,
  simpleFinExternalId,
} from "./accountMapping.js";
import type { SimpleFinAccount } from "./client.js";

describe("simpleFinExternalId", () => {
  it("combines connection and account ids", () => {
    expect(simpleFinExternalId("CON-1", "Demo Savings")).toBe(
      "CON-1:Demo Savings"
    );
  });
});

describe("simpleFinAccountDocumentId", () => {
  it("slugifies segments for stable ids", () => {
    expect(simpleFinAccountDocumentId("CON-SIMPLEFIN-DEMO", "Demo Savings")).toBe(
      "sf-CON_SIMPLEFIN_DEMO-Demo_Savings"
    );
  });
});

describe("resolveInstitutionName", () => {
  it("uses connection org_name from v2 connections list", () => {
    const connections = buildConnectionIndex([
      {
        conn_id: "CON-SIMPLEFIN-DEMO",
        name: "SimpleFIN Demo",
        org_name: "SimpleFIN Bridge",
      },
    ]);
    const account: SimpleFinAccount = {
      id: "Demo Savings",
      name: "SimpleFIN Savings",
      balance: "100",
      currency: "USD",
      conn_id: "CON-SIMPLEFIN-DEMO",
    };
    expect(resolveInstitutionName(account, connections)).toBe(
      "SimpleFIN Bridge"
    );
  });

  it("falls back to conn_name on account", () => {
    const account: SimpleFinAccount = {
      id: "1",
      name: "Checking",
      balance: "0",
      currency: "USD",
      conn_name: "My Bank - Jeff",
    };
    expect(resolveInstitutionName(account, new Map())).toBe("My Bank - Jeff");
  });
});

describe("inferAccountType", () => {
  it("detects credit accounts by name", () => {
    expect(inferAccountType("Chase Visa Credit Card")).toBe("credit");
  });

  it("treats credit union checking as depository", () => {
    expect(inferAccountType("Cardinal Credit Union Checking")).toBe("depository");
  });

  it("detects checking accounts", () => {
    expect(inferAccountType("SimpleFIN Checking")).toBe("depository");
  });
});

describe("resolveSyncedAccountType", () => {
  it("defaults unknown positive-balance accounts to depository", () => {
    expect(resolveSyncedAccountType("Premier Plus", 12_500, [])).toBe(
      "depository"
    );
  });

  it("classifies negative balances without a name hint as credit", () => {
    expect(resolveSyncedAccountType("Rewards", -800, [])).toBe("credit");
  });

  it("uses investment only when securities are present", () => {
    expect(
      resolveSyncedAccountType("Individual", 50_000, [
        {
          id: "h1",
          symbol: "VOO",
          shares: "10",
          market_value: "4000",
        },
      ])
    ).toBe("investment");
  });

  it("does not mark checking as investment when holdings array is empty", () => {
    expect(resolveSyncedAccountType("Everyday Checking", 2500, [])).toBe(
      "depository"
    );
  });
});

describe("resolveSimplefinSyncWindow", () => {
  it("uses hard refresh for the first sync", () => {
    expect(
      resolveSimplefinSyncWindow({
        hasSimplefinAccounts: false,
        lastSyncedAt: undefined,
        accountLastSyncedAt: [],
      })
    ).toEqual({
      mode: "hard",
      startDate: hardRefreshStartDate(),
    });
  });

  it("uses incremental sync from the last sync timestamp", () => {
    const lastSyncedAt = "2026-05-20T12:00:00.000Z";
    const window = resolveSimplefinSyncWindow({
      hasSimplefinAccounts: true,
      lastSyncedAt,
      accountLastSyncedAt: [lastSyncedAt],
    });

    expect(window.mode).toBe("incremental");
    expect(Number(window.startDate)).toBeLessThanOrEqual(
      Number(incrementalStartDate(lastSyncedAt))
    );
  });

  it("detects initial sync when accounts or sync state are missing", () => {
    expect(isInitialSimplefinSync(false, undefined)).toBe(true);
    expect(isInitialSimplefinSync(true, undefined)).toBe(true);
    expect(
      isInitialSimplefinSync(true, "2026-05-20T12:00:00.000Z")
    ).toBe(false);
  });
});
