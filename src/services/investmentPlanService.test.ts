import { describe, expect, it } from "vitest";
import type { Holding } from "@portfolio/contracts";
import { aggregateActualHoldings, dedupePlanInstruments } from "./investmentPlanService.js";

describe("aggregateActualHoldings", () => {
  it("rolls up holdings by symbol across accounts", () => {
    const holdings: Holding[] = [
      {
        id: "1",
        householdId: "hh-1",
        holdingId: "h1",
        accountId: "a1",
        symbol: "VTI",
        quantity: 10,
        marketValue: 1000,
        category: "etf",
        currency: "USD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "2",
        householdId: "hh-1",
        holdingId: "h2",
        accountId: "a2",
        symbol: "VTI",
        quantity: 5,
        marketValue: 500,
        category: "etf",
        currency: "USD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const aggregated = aggregateActualHoldings(holdings);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.symbol).toBe("VTI");
    expect(aggregated[0]?.marketValue).toBe(1500);
    expect(aggregated[0]?.assetClass).toBe("index-funds");
  });
});

describe("dedupePlanInstruments", () => {
  it("merges duplicate tickers with last winning", () => {
    const result = dedupePlanInstruments([
      {
        id: "1",
        name: "VTI — Total US Market",
        assetClass: "index-funds",
        unit: "percent",
        value: 10,
        sortOrder: 0,
      },
      {
        id: "2",
        name: "VTI — Updated",
        assetClass: "index-funds",
        unit: "percent",
        value: 22,
        sortOrder: 1,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(22);
    expect(result[0]?.ticker).toBe("VTI");
  });

  it("keeps distinct tickers as separate instruments", () => {
    const result = dedupePlanInstruments([
      {
        id: "1",
        name: "VTI — Total US Market",
        assetClass: "index-funds",
        unit: "percent",
        value: 30,
        sortOrder: 0,
      },
      {
        id: "2",
        name: "AAPL — Apple",
        assetClass: "stocks",
        unit: "percent",
        value: 10,
        sortOrder: 1,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.ticker).sort()).toEqual(["AAPL", "VTI"]);
  });
});
