import { describe, expect, it } from "vitest";
import { dedupePlanInstruments, planWarnings } from "../services/investmentPlanService.js";
import { buildHouseholdPlanSummary } from "@portfolio/contracts";

describe("investment plan handler logic", () => {
  it("returns over-allocation warning", () => {
    const summary = buildHouseholdPlanSummary({
      netWorth: 100_000,
      instruments: [
        {
          id: "1",
          name: "VTI",
          assetClass: "index-funds",
          unit: "percent",
          value: 120,
          sortOrder: 0,
        },
      ],
      actualTotalDollars: 0,
      valuesUnlocked: true,
    });
    expect(planWarnings(summary)).toEqual(["Plan exceeds 100% of net worth"]);
  });

  it("dedupes tickers on PUT merge", () => {
    const instruments = dedupePlanInstruments([
      {
        id: "a",
        name: "AAPL",
        assetClass: "stocks",
        unit: "percent",
        value: 5,
        sortOrder: 0,
      },
      {
        id: "b",
        name: "AAPL — Apple",
        assetClass: "stocks",
        unit: "percent",
        value: 12,
        sortOrder: 1,
      },
    ]);
    expect(instruments).toHaveLength(1);
    expect(instruments[0]?.value).toBe(12);
  });
});
