import { describe, expect, it } from "vitest";
import { buildDefaultExpensePlan } from "@portfolio/contracts";

describe("expense plan defaults", () => {
  it("creates plan with food category visible", () => {
    const plan = buildDefaultExpensePlan("hh-1");
    const food = plan.categories.find((c) => c.category === "food");
    expect(food?.hidden).toBe(false);
    expect(food?.monthlyBudget).toBe(0);
  });

  it("hides income and transfer categories", () => {
    const plan = buildDefaultExpensePlan("hh-1");
    expect(plan.categories.find((c) => c.category === "income")?.hidden).toBe(true);
    expect(plan.categories.find((c) => c.category === "transfer")?.hidden).toBe(true);
  });
});
