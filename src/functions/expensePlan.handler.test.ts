import { describe, expect, it } from "vitest";
import { buildDefaultExpensePlan } from "@portfolio/contracts";
import { UpsertExpensePlanRequestSchema } from "@portfolio/contracts";

describe("expense plan handler validation", () => {
  it("accepts valid upsert payload", () => {
    const plan = buildDefaultExpensePlan("hh-1");
    const parsed = UpsertExpensePlanRequestSchema.safeParse({
      categories: plan.categories,
      mappingRules: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid mapping rule match type", () => {
    const parsed = UpsertExpensePlanRequestSchema.safeParse({
      mappingRules: [
        {
          id: "r1",
          matchType: "invalid",
          pattern: "test",
          category: "food",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
