import { describe, expect, it } from "vitest";
import { mapSearchRow, mapToFundProfile } from "./mapToFundProfile.js";

describe("mapToFundProfile", () => {
  it("maps quote and price change into decimal returns", () => {
    const profile = mapToFundProfile({
      ticker: "VTI",
      quote: {
        symbol: "VTI",
        name: "Vanguard Total Stock Market ETF",
        price: 250.5,
        changesPercentage: 1.2,
        marketCap: 1_000_000_000_000,
        volume: 5_000_000,
        exchange: "NYSE",
        currency: "USD",
      },
      priceChange: {
        symbol: "VTI",
        "1Y": 12.4,
        "3Y": 8.2,
        "5Y": 9.5,
        "10Y": 9.8,
      },
      etf: {
        symbol: "VTI",
        expenseRatio: 0.03,
        dividendYield: 1.3,
        inceptionDate: "2001-05-24",
      },
      asOf: "2026-06-03T12:00:00.000Z",
    });

    expect(profile.ticker).toBe("VTI");
    expect(profile.name).toContain("Vanguard");
    expect(profile.price).toBe(250.5);
    expect(profile.return1y).toBeCloseTo(0.124);
    expect(profile.return5y).toBeCloseTo(0.095);
    expect(profile.priceChange1d).toBeCloseTo(0.012);
    expect(profile.expenseRatio).toBeCloseTo(0.0003);
    expect(profile.dividendYield).toBeCloseTo(0.013);
    expect(profile.dataSource).toBe("fmp");
    expect(profile.assetType).toBe("etf");
  });
});

describe("mapSearchRow", () => {
  it("normalizes search rows", () => {
    expect(
      mapSearchRow({
        symbol: "aapl",
        name: "Apple Inc.",
        exchangeShortName: "NASDAQ",
      })
    ).toEqual({
      ticker: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      assetType: "stock",
    });
  });
});
