import { describe, expect, it, vi } from "vitest";
import { CompositeInstrumentDataProvider } from "./compositeInstrumentDataProvider.js";
import type { InstrumentDataProvider } from "./instrumentDataProvider.types.js";

describe("CompositeInstrumentDataProvider", () => {
  it("falls back to stub search when live returns empty", async () => {
    const live: InstrumentDataProvider = {
      search: vi.fn().mockResolvedValue([]),
      getProfile: vi.fn().mockResolvedValue(null),
    };
    const composite = new CompositeInstrumentDataProvider(live);
    const results = await composite.search("VTI", 3);
    expect(results.some((r) => r.ticker === "VTI")).toBe(true);
  });

  it("merges live price with stub projection defaults", async () => {
    const live: InstrumentDataProvider = {
      search: vi.fn(),
      getProfile: vi.fn().mockResolvedValue({
        ticker: "VTI",
        name: "Vanguard Total Stock Market ETF",
        price: 250,
        return1y: 0,
        return3y: 0,
        return5y: 0,
        annualizedReturn: 0,
        dividendYield: 0,
        yearsSinceInception: 1,
        inceptionLabel: "—",
        expenseRatio: 0,
        feeKind: "expense_ratio",
        dataSource: "fmp",
      }),
    };
    const composite = new CompositeInstrumentDataProvider(live);
    const profile = await composite.getProfile("VTI");
    expect(profile?.price).toBe(250);
    expect(profile?.return5y).toBeGreaterThan(0);
  });
});
