import { describe, expect, it } from "vitest";
import { inferMemberPatchesFromMessage } from "@portfolio/contracts";
import { shouldAttemptExtraction } from "./householdAutoSaveService.js";

describe("shouldAttemptExtraction", () => {
  it("skips pure advisory questions", () => {
    expect(shouldAttemptExtraction("What's my biggest tax-saving opportunity?")).toBe(
      false
    );
  });

  it("detects salary updates", () => {
    expect(shouldAttemptExtraction("My salary is now $150,000 per year")).toBe(true);
  });

  it("detects maxed 401k", () => {
    expect(shouldAttemptExtraction("I maxed out my 401k this year")).toBe(true);
  });

  it("detects state moves", () => {
    expect(shouldAttemptExtraction("We moved to Texas last month")).toBe(true);
  });

  it("infers max 401k without LLM", () => {
    const patches = inferMemberPatchesFromMessage(
      "We maxed out 401k contributions",
      [
        {
          id: "m1",
          householdId: "hh1",
          name: "Alex",
          relationship: "self",
          isActive: true,
          incomeSources: [],
          contributions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
    );
    expect(patches[0]?.contributions?.[0]).toMatchObject({
      type: "401k",
      amountExpression: "max",
    });
  });

  it("infers salary without LLM", () => {
    const patches = inferMemberPatchesFromMessage("Salary $150k", [
      {
        id: "m1",
        householdId: "hh1",
        name: "Alex",
        relationship: "self",
        isActive: true,
        incomeSources: [],
        contributions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    expect(patches[0]?.incomeSources?.[0]).toMatchObject({
      type: "wages",
      amount: 150000,
    });
  });
});
