import { describe, expect, it } from "vitest";
import type { ExpenseChatBlock } from "@portfolio/contracts";
import { mergeExpenseChatTextBlock } from "./expenseChatService.js";

describe("mergeExpenseChatTextBlock", () => {
  it("keeps intent-specific charts when the LLM returns generic visuals", () => {
    const deterministic: ExpenseChatBlock[] = [
      { type: "text", markdown: "Over budget summary" },
      {
        type: "line_chart",
        title: "Daily spend",
        labels: ["Jun 1"],
        series: [{ name: "Spend", values: [100] }],
      },
    ];
    const llmBlocks: ExpenseChatBlock[] = [
      { type: "text", markdown: "Generic LLM answer" },
      {
        type: "pie_chart",
        title: "Generic pie",
        data: [{ label: "Other", value: 100 }],
      },
    ];

    const merged = mergeExpenseChatTextBlock(deterministic, llmBlocks);

    expect(merged[0]).toEqual({
      type: "text",
      markdown: "Generic LLM answer",
    });
    expect(merged[1]?.type).toBe("line_chart");
    expect(merged).toHaveLength(2);
  });

  it("returns deterministic blocks when the LLM provides no text", () => {
    const deterministic: ExpenseChatBlock[] = [
      { type: "text", markdown: "Merchant summary" },
      {
        type: "bar_chart",
        title: "Top merchants",
        labels: ["Amazon"],
        series: [{ name: "Spend", values: [50] }],
      },
    ];

    const merged = mergeExpenseChatTextBlock(deterministic, []);

    expect(merged).toEqual(deterministic);
  });
});
