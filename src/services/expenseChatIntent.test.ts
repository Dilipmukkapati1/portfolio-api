import { describe, expect, it } from "vitest";
import {
  buildExpenseChatBlocks,
  detectExpenseChatIntent,
} from "./expenseChatIntent.js";

const baseContext = {
  timeRange: {
    startDate: "2026-06-01",
    endDate: "2026-06-23",
    label: "June 2026",
  },
  summaryUnavailable: false,
  totalSpend: 4200,
  totalCredits: 8000,
  transactionCount: 42,
  monthlyBudgetTotal: 5000,
  categoryBudgets: [
    {
      category: "food",
      label: "Food",
      spent: 900,
      budget: 600,
      overBudget: true,
    },
    {
      category: "transport",
      label: "Transport",
      spent: 200,
      budget: 400,
      overBudget: false,
    },
  ],
  spendByAccount: { Checking: 3000, "Credit card": 1200 },
  spendByDay: [
    { date: "2026-06-01", spend: 120 },
    { date: "2026-06-02", spend: 80 },
  ],
  topMerchants: [
    { merchant: "Amazon", spend: 500, count: 4 },
    { merchant: "Whole Foods", spend: 300, count: 6 },
  ],
};

describe("detectExpenseChatIntent", () => {
  it("detects distinct intents", () => {
    expect(detectExpenseChatIntent("Which categories am I over budget on?")).toBe(
      "over_budget"
    );
    expect(detectExpenseChatIntent("Show my spending trend this month")).toBe(
      "spending_trend"
    );
    expect(detectExpenseChatIntent("Where did I spend the most?")).toBe(
      "top_merchants"
    );
    expect(detectExpenseChatIntent("Compare spending by account")).toBe(
      "by_account"
    );
  });

  it("does not route broad questions to total_spend", () => {
    expect(detectExpenseChatIntent("Where did I spend the most?")).not.toBe(
      "total_spend"
    );
    expect(detectExpenseChatIntent("Which categories am I over budget on?")).not.toBe(
      "total_spend"
    );
  });
});

describe("buildExpenseChatBlocks", () => {
  it("returns different block shapes per intent", () => {
    const overBudget = buildExpenseChatBlocks(
      "over_budget",
      baseContext,
      "over budget"
    );
    const trend = buildExpenseChatBlocks(
      "spending_trend",
      baseContext,
      "trend"
    );
    const merchants = buildExpenseChatBlocks(
      "top_merchants",
      baseContext,
      "merchants"
    );

    expect(overBudget.some((b) => b.type === "table")).toBe(true);
    expect(trend.some((b) => b.type === "line_chart")).toBe(true);
    expect(merchants.some((b) => b.type === "bar_chart")).toBe(true);
    expect(JSON.stringify(overBudget)).not.toEqual(JSON.stringify(trend));
  });
});
