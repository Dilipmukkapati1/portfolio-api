import { describe, expect, it } from "vitest";
import { getInstrumentAnalysis } from "./analyzerService.js";

describe("getInstrumentAnalysis", () => {
  it("returns NVDA instrument analysis with bullish trend", () => {
    const analysis = getInstrumentAnalysis("nvda", "quarterly");
    expect(analysis.symbol).toBe("NVDA");
    expect(analysis.companyName).toBe("NVIDIA Corp.");
    expect(analysis.period).toBe("quarterly");
    expect(analysis.momentumScore).toBe(82);
    expect(analysis.trend).toBe("bullish");
    expect(analysis.indicators.length).toBeGreaterThanOrEqual(4);
    expect(analysis.technicalSignals.some((s) => s.label.includes("Golden cross"))).toBe(
      true
    );
  });

  it("scales indicators for yearly period", () => {
    const quarterly = getInstrumentAnalysis("NVDA", "quarterly");
    const yearly = getInstrumentAnalysis("NVDA", "yearly");
    const qRsi = quarterly.indicators.find((i) => i.id === "rsi14")?.value;
    const yRsi = yearly.indicators.find((i) => i.id === "rsi14")?.value;
    expect(yRsi).toBeGreaterThan(qRsi!);
    expect(yearly.period).toBe("yearly");
  });

  it("builds a generic profile for unknown tickers", () => {
    const analysis = getInstrumentAnalysis("XYZ");
    expect(analysis.symbol).toBe("XYZ");
    expect(analysis.companyName).toContain("XYZ");
    expect(analysis.indicators.length).toBe(4);
  });
});
