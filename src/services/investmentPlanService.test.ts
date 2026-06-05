import { describe, expect, it, vi } from "vitest";
import { computeAggregatedPlanFees } from "@portfolio/contracts";
import type { FundProfile, PlannedInstrument } from "@portfolio/contracts";
import { enrichInstrumentsWithFeeSnapshots } from "./investmentPlanService.js";
import { getInstrumentDataProvider } from "./instrumentDataProvider.js";

vi.mock("./instrumentDataProvider.js", () => ({
  getInstrumentDataProvider: vi.fn(),
}));

const vti: PlannedInstrument = {
  id: "a",
  name: "VTI",
  ticker: "VTI",
  assetClass: "index-funds",
  unit: "percent",
  value: 50,
  sortOrder: 0,
};

describe("plan expense ratio rollup", () => {
  it("weights expense ratios against total net worth", () => {
    const result = computeAggregatedPlanFees({
      instruments: [vti],
      netWorth: 200_000,
      profileForInstrument: () => ({
        expenseRatio: 0.001,
        feeKind: "expense_ratio",
      }),
    });

    expect(result).not.toBeNull();
    expect(result!.annualExpenseDollars).toBeCloseTo(100, 2);
    expect(result!.weightedExpenseRatio).toBeCloseTo(100 / 200_000, 6);
  });
});

describe("enrichInstrumentsWithFeeSnapshots", () => {
  it("snapshots expense ratio and fee kind onto planned instruments", async () => {
    const profile: FundProfile = {
      ticker: "VTI",
      return1y: 0.1,
      return3y: 0.1,
      return5y: 0.1,
      annualizedReturn: 0.1,
      dividendYield: 0.01,
      yearsSinceInception: 10,
      inceptionLabel: "2001",
      expenseRatio: 0.0003,
      feeKind: "expense_ratio",
      dataSource: "stub",
      asOf: "2026-06-04T12:00:00.000Z",
    };

    vi.mocked(getInstrumentDataProvider).mockReturnValue({
      search: vi.fn(),
      getProfile: vi.fn(async (ticker: string) =>
        ticker.toUpperCase() === "VTI" ? profile : null
      ),
    });

    const enriched = await enrichInstrumentsWithFeeSnapshots([vti]);

    expect(enriched[0]).toMatchObject({
      expenseRatio: 0.0003,
      feeKind: "expense_ratio",
      profileDataSource: "stub",
      profileAsOf: "2026-06-04T12:00:00.000Z",
    });
  });
});
