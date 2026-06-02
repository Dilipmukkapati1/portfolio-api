import { describe, expect, it } from "vitest";
import {
  computeInstrumentProjection,
  type FundProfile,
} from "@portfolio/contracts";

const profile: FundProfile = {
  ticker: "VTI",
  return1y: 0.124,
  return3y: 0.082,
  return5y: 0.095,
  annualizedReturn: 0.098,
  dividendYield: 0.013,
  yearsSinceInception: 18,
  inceptionLabel: "2006",
  expenseRatio: 0.0003,
  feeKind: "expense_ratio",
};

describe("projections handler parity", () => {
  it("matches contracts output for sample instrument projection", () => {
    const projection = computeInstrumentProjection(profile, 100_000, "5y", true);
    expect(projection).not.toBeNull();
    expect(projection!.values[0]).toBe(100_000);
    expect(projection!.milestones).toHaveLength(4);
    expect(projection!.milestones[0]?.years).toBe(10);
  });
});
