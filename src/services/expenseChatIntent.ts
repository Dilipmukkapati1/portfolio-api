import type { ExpenseChatBlock, ExpenseChatTimeRange } from "@portfolio/contracts";

export type ExpenseChatIntent =
  | "over_budget"
  | "spending_trend"
  | "top_merchants"
  | "by_account"
  | "category_breakdown"
  | "burn_rate"
  | "total_spend"
  | "general";

export type ExpenseChatAnalysisContext = {
  timeRange: ExpenseChatTimeRange;
  summaryUnavailable: boolean;
  totalSpend: number;
  totalCredits: number;
  transactionCount: number;
  monthlyBudgetTotal: number;
  categoryBudgets: Array<{
    category: string;
    label: string;
    spent: number;
    budget: number;
    overBudget: boolean;
  }>;
  spendByAccount: Record<string, number>;
  spendByDay: Array<{ date: string; spend: number }>;
  topMerchants: Array<{ merchant: string; spend: number; count: number }>;
};

export function detectExpenseChatIntent(message: string): ExpenseChatIntent {
  const m = message.toLowerCase();

  if (
    /over budget|above budget|exceed|over\s+(?:the\s+)?budget|budget\s+(?:gap|miss)|categories.*budget|budget.*categor/.test(
      m
    )
  ) {
    return "over_budget";
  }
  if (
    /trend|over time|daily|day by day|spending pattern|spend(?:ing)?\s+(?:over|by)\s+(?:day|week)/.test(
      m
    )
  ) {
    return "spending_trend";
  }
  if (
    /merchant|vendor|store|where did i spend|top spend|biggest purchase|who did i pay|spend the most|spent the most/.test(
      m
    )
  ) {
    return "top_merchants";
  }
  if (/compare.*account|account.*compare|spending by account|by account|which account/.test(m)) {
    return "by_account";
  }
  if (/account|card|bank/.test(m) && !/accident/.test(m)) {
    return "by_account";
  }
  if (
    /burn rate|monthly burn|run rate|pace|project(?:ed)?\s+(?:spend|monthly)/.test(
      m
    )
  ) {
    return "burn_rate";
  }
  if (
    /categor|breakdown|split|pie|share|percent|distribution|where.*money/.test(
      m
    )
  ) {
    return "category_breakdown";
  }
  if (/total spend|how much.*spent|spent so far|spending total|what did i spend/.test(m)) {
    return "total_spend";
  }
  return "general";
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function buildExpenseChatBlocks(
  intent: ExpenseChatIntent,
  context: ExpenseChatAnalysisContext,
  userMessage: string
): ExpenseChatBlock[] {
  if (context.summaryUnavailable) {
    return [
      {
        type: "text",
        markdown:
          "Transaction data is unavailable right now. Try again after your accounts finish syncing.",
      },
    ];
  }

  const { timeRange, totalSpend, transactionCount } = context;

  switch (intent) {
    case "over_budget": {
      const over = context.categoryBudgets
        .filter((c) => c.overBudget)
        .sort((a, b) => b.spent - a.spent - (a.spent - a.budget));
      const near = context.categoryBudgets
        .filter(
          (c) =>
            !c.overBudget &&
            c.budget > 0 &&
            c.spent >= c.budget * 0.85
        )
        .sort((a, b) => b.spent / b.budget - a.spent / a.budget);

      if (over.length === 0 && near.length === 0) {
        return [
          {
            type: "text",
            markdown: `You're **within budget** for **${timeRange.label}**. Total spend is **$${fmt(totalSpend)}** vs **$${fmt(context.monthlyBudgetTotal)}** monthly plan (prorated for the selected range).`,
          },
          {
            type: "table",
            title: "Budget vs actual by category",
            columns: [
              { key: "label", label: "Category" },
              { key: "spent", label: "Spent", align: "right" },
              { key: "budget", label: "Budget", align: "right" },
              { key: "status", label: "Status", align: "right" },
            ],
            rows: context.categoryBudgets
              .filter((c) => c.budget > 0 || c.spent > 0)
              .sort((a, b) => b.spent - a.spent)
              .slice(0, 12)
              .map((c) => ({
                label: c.label,
                spent: c.spent,
                budget: c.budget,
                status:
                  c.budget <= 0
                    ? "—"
                    : `${Math.round((c.spent / c.budget) * 100)}%`,
              })),
          },
        ];
      }

      return [
        {
          type: "text",
          markdown:
            over.length > 0
              ? `**${over.length}** categor${over.length === 1 ? "y is" : "ies are"} over budget for **${timeRange.label}**.`
              : `No categories are over budget yet, but **${near.length}** are above 85% of plan.`,
        },
        {
          type: "table",
          title: "Over-budget categories",
          columns: [
            { key: "label", label: "Category" },
            { key: "spent", label: "Spent", align: "right" },
            { key: "budget", label: "Budget", align: "right" },
            { key: "over", label: "Over by", align: "right" },
          ],
          rows: over.map((c) => ({
            label: c.label,
            spent: c.spent,
            budget: c.budget,
            over: Math.max(0, c.spent - c.budget),
          })),
        },
      ];
    }

    case "spending_trend": {
      const days = context.spendByDay;
      if (days.length === 0) {
        return [
          {
            type: "text",
            markdown: `No daily spending recorded for **${timeRange.label}**.`,
          },
        ];
      }
      const labels = days.map((d) => shortDate(d.date));
      const values = days.map((d) => Math.round(d.spend));
      const peak = days.reduce(
        (best, d) => (d.spend > best.spend ? d : best),
        days[0]!
      );
      return [
        {
          type: "text",
          markdown: `Daily spending for **${timeRange.label}**. Peak day: **${shortDate(peak.date)}** at **$${fmt(peak.spend)}**.`,
        },
        {
          type: "line_chart",
          title: "Daily spend",
          labels,
          series: [{ name: "Spend", values }],
        },
      ];
    }

    case "top_merchants": {
      const merchants = context.topMerchants.slice(0, 10);
      if (merchants.length === 0) {
        return [
          {
            type: "text",
            markdown: `No merchant-level spending found for **${timeRange.label}**.`,
          },
        ];
      }
      return [
        {
          type: "text",
          markdown: `Top merchants for **${timeRange.label}** by total spend.`,
        },
        {
          type: "bar_chart",
          title: "Top merchants",
          labels: merchants.map((m) =>
            m.merchant.length > 18
              ? `${m.merchant.slice(0, 16)}…`
              : m.merchant
          ),
          series: [
            {
              name: "Spend",
              values: merchants.map((m) => Math.round(m.spend)),
            },
          ],
        },
        {
          type: "table",
          title: "Merchant detail",
          columns: [
            { key: "merchant", label: "Merchant" },
            { key: "spend", label: "Spend", align: "right" },
            { key: "count", label: "Txns", align: "right" },
          ],
          rows: merchants.map((m) => ({
            merchant: m.merchant,
            spend: Math.round(m.spend),
            count: m.count,
          })),
        },
      ];
    }

    case "by_account": {
      const entries = Object.entries(context.spendByAccount).sort(
        (a, b) => b[1] - a[1]
      );
      if (entries.length === 0) {
        return [
          {
            type: "text",
            markdown: `No account-level spending for **${timeRange.label}**.`,
          },
        ];
      }
      return [
        {
          type: "text",
          markdown: `Spending by account for **${timeRange.label}** (total **$${fmt(totalSpend)}**).`,
        },
        {
          type: "bar_chart",
          title: "Spend by account",
          labels: entries.map(([name]) =>
            name.length > 16 ? `${name.slice(0, 14)}…` : name
          ),
          series: [
            {
              name: "Spend",
              values: entries.map(([, v]) => Math.round(v)),
            },
          ],
        },
      ];
    }

    case "burn_rate": {
      const end = new Date(`${timeRange.endDate}T12:00:00`);
      const start = new Date(`${timeRange.startDate}T12:00:00`);
      const daysElapsed = Math.max(
        1,
        Math.floor((end.getTime() - start.getTime()) / (86400000)) + 1
      );
      const dailyAvg = totalSpend / daysElapsed;
      const projectedMonthly = dailyAvg * 30;
      return [
        {
          type: "text",
          markdown: `For **${timeRange.label}**, you've spent **$${fmt(totalSpend)}** over **${daysElapsed}** days — about **$${fmt(dailyAvg)}**/day.`,
        },
        {
          type: "table",
          title: "Burn rate projection",
          columns: [
            { key: "metric", label: "Metric" },
            { key: "value", label: "Amount", align: "right" },
          ],
          rows: [
            { metric: "Total spend (range)", value: totalSpend },
            { metric: "Daily average", value: Math.round(dailyAvg) },
            { metric: "Projected monthly pace", value: Math.round(projectedMonthly) },
            { metric: "Monthly budget plan", value: context.monthlyBudgetTotal },
            {
              metric: "Pace vs budget",
              value:
                context.monthlyBudgetTotal > 0
                  ? `${Math.round((projectedMonthly / context.monthlyBudgetTotal) * 100)}%`
                  : "—",
            },
          ],
        },
      ];
    }

    case "category_breakdown": {
      const cats = context.categoryBudgets
        .filter((c) => c.spent > 0)
        .sort((a, b) => b.spent - a.spent);
      if (cats.length === 0) {
        return [
          {
            type: "text",
            markdown: `No categorized spending for **${timeRange.label}**.`,
          },
        ];
      }
      return [
        {
          type: "text",
          markdown: `Category breakdown for **${timeRange.label}** — **$${fmt(totalSpend)}** total across ${transactionCount} transactions.`,
        },
        {
          type: "pie_chart",
          title: "Spend by category",
          data: cats.slice(0, 10).map((c) => ({
            label: c.label,
            value: Math.round(c.spent),
          })),
          total: Math.round(totalSpend),
        },
        {
          type: "table",
          title: "Category totals",
          columns: [
            { key: "label", label: "Category" },
            { key: "spent", label: "Spent", align: "right" },
            { key: "share", label: "Share", align: "right" },
          ],
          rows: cats.slice(0, 12).map((c) => ({
            label: c.label,
            spent: Math.round(c.spent),
            share:
              totalSpend > 0
                ? `${Math.round((c.spent / totalSpend) * 100)}%`
                : "0%",
          })),
        },
      ];
    }

    case "total_spend": {
      return [
        {
          type: "text",
          markdown: `**${timeRange.label}** debit spending: **$${fmt(totalSpend)}** across ${context.transactionCount} expense transactions (credits and transfers excluded).`,
        },
        {
          type: "table",
          title: "Top categories",
          columns: [
            { key: "label", label: "Category" },
            { key: "spent", label: "Spent", align: "right" },
          ],
          rows: context.categoryBudgets
            .filter((c) => c.spent > 0)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 8)
            .map((c) => ({ label: c.label, spent: Math.round(c.spent) })),
        },
      ];
    }

    case "general":
    default: {
      const trimmed = userMessage.trim();
      const cats = context.categoryBudgets
        .filter((c) => c.spent > 0)
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 6);

      const blocks: ExpenseChatBlock[] = [
        {
          type: "text",
          markdown: `For **${timeRange.label}**: **$${fmt(totalSpend)}** spent across ${transactionCount} transactions.${trimmed ? ` (Re: "${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}")` : ""}`,
        },
      ];

      if (cats.length > 0) {
        blocks.push({
          type: "pie_chart",
          title: "Largest categories",
          data: cats.map((c) => ({
            label: c.label,
            value: Math.round(c.spent),
          })),
          total: Math.round(totalSpend),
        });
      }

      if (context.topMerchants.length > 0) {
        blocks.push({
          type: "table",
          title: "Top merchants",
          columns: [
            { key: "merchant", label: "Merchant" },
            { key: "spend", label: "Spend", align: "right" },
          ],
          rows: context.topMerchants.slice(0, 5).map((m) => ({
            merchant: m.merchant,
            spend: Math.round(m.spend),
          })),
        });
      }

      return blocks;
    }
  }
}
