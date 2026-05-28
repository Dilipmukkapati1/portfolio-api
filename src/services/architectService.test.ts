import { describe, expect, it } from "vitest";
import { buildSectorHeatmap } from "./architectService.js";

describe("buildSectorHeatmap", () => {
  it("returns weighted sectors with performance and tone", () => {
    const sectors = buildSectorHeatmap("1d");
    expect(sectors.length).toBeGreaterThan(5);
    const tech = sectors.find((s) => s.id === "technology");
    expect(tech?.leadSymbol).toBe("NVDA");
    expect(tech?.livePerfPercent).toBe(4.28);
    expect(tech?.tone).toBe("positive");
    const reit = sectors.find((s) => s.id === "real-estate");
    expect(reit?.tone).toBe("negative");
  });

  it("scales performance for longer timeframes", () => {
    const day = buildSectorHeatmap("1d");
    const month = buildSectorHeatmap("1m");
    const techDay = day.find((s) => s.id === "technology")?.livePerfPercent;
    const techMonth = month.find((s) => s.id === "technology")?.livePerfPercent;
    expect(techMonth).toBeGreaterThan(techDay!);
  });
});
