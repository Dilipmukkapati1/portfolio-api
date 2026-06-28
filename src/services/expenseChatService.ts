import type {
  ExpenseChatBlock,
  ExpenseChatHistoryMessage,
  ExpenseChatMessage,
  ExpenseChatRequest,
  ExpenseChatResponse,
  ExpenseChatTimeRange,
  ExpensePlan,
  TransactionSummaryResponse,
} from "@portfolio/contracts";
import {
  EXPENSE_CHAT_MAX_RANGE_DAYS,
  ExpenseChatModelOutputSchema,
  categoryDisplayLabel,
  extractTimeRangeFromMessage,
  monthlyBudgetTotal,
  resolveExpenseChatTimeRange,
  visibleCategories,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import {
  OpenRouterNotConfiguredError,
  openRouterExtractJson,
} from "../lib/openrouter.js";
import {
  buildExpenseChatBlocks,
  detectExpenseChatIntent,
  type ExpenseChatAnalysisContext,
} from "./expenseChatIntent.js";
import { getOrCreatePlan } from "./expensePlanService.js";
import {
  summarizePeriod,
  summarizeSpendByDay,
  summarizeTopMerchants,
} from "./transactionSummaryService.js";

type ExpenseChatContext = ExpenseChatAnalysisContext & {
  plan: ExpensePlan;
  summary: TransactionSummaryResponse;
};

function buildCategoryBudgets(
  plan: ExpensePlan,
  summary: TransactionSummaryResponse,
  timeRange: ExpenseChatTimeRange
): ExpenseChatContext["categoryBudgets"] {
  const days =
    Math.floor(
      (new Date(`${timeRange.endDate}T00:00:00`).getTime() -
        new Date(`${timeRange.startDate}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;
  const monthFraction = days / 30;

  return visibleCategories(plan.categories).map((cat) => {
    const spent = summary.spendByCategory[cat.category] ?? 0;
    const budget = cat.monthlyBudget * monthFraction;
    return {
      category: cat.category,
      label: categoryDisplayLabel(cat.category, plan.categories),
      spent: Math.round(spent * 100) / 100,
      budget: Math.round(budget * 100) / 100,
      overBudget: budget > 0 && spent > budget,
    };
  });
}

async function loadExpenseChatContext(
  householdId: string,
  timeRange: ExpenseChatTimeRange
): Promise<ExpenseChatContext> {
  const plan = await getOrCreatePlan(householdId);

  let summary: TransactionSummaryResponse = {
    totalCredits: 0,
    totalSpend: 0,
    spendByCategory: {},
    spendByAccount: {},
    transactionCount: 0,
  };
  let summaryUnavailable = false;
  let spendByDay: Array<{ date: string; spend: number }> = [];
  let topMerchants: Array<{ merchant: string; spend: number; count: number }> =
    [];

  try {
    [summary, spendByDay, topMerchants] = await Promise.all([
      summarizePeriod(householdId, {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      }),
      summarizeSpendByDay(householdId, {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      }),
      summarizeTopMerchants(householdId, {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
        limit: 12,
      }),
    ]);
  } catch {
    summaryUnavailable = true;
  }

  const categoryBudgets = buildCategoryBudgets(plan, summary, timeRange);

  return {
    timeRange,
    summary,
    summaryUnavailable,
    plan,
    spendByDay,
    topMerchants,
    categoryBudgets,
    totalSpend: summary.totalSpend,
    totalCredits: summary.totalCredits,
    transactionCount: summary.transactionCount,
    monthlyBudgetTotal: monthlyBudgetTotal(
      plan.categories,
      plan.monthlyExpenseTotal ?? 0,
      plan.budgetAllocationMode ?? "dollar"
    ),
    spendByAccount: summary.spendByAccount,
  };
}

function toAnalysisContext(context: ExpenseChatContext): ExpenseChatAnalysisContext {
  return {
    timeRange: context.timeRange,
    summaryUnavailable: context.summaryUnavailable,
    totalSpend: context.totalSpend,
    totalCredits: context.totalCredits,
    transactionCount: context.transactionCount,
    monthlyBudgetTotal: context.monthlyBudgetTotal,
    categoryBudgets: context.categoryBudgets,
    spendByAccount: context.spendByAccount,
    spendByDay: context.spendByDay,
    topMerchants: context.topMerchants,
  };
}

function blocksToPlainText(blocks: ExpenseChatBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.markdown.trim());
    } else if (block.type === "table") {
      parts.push(block.title ?? "Table");
    } else {
      parts.push(block.title ?? block.type.replace("_", " "));
    }
  }
  return parts.join("\n\n").slice(0, 4000) || "Here's your expense analysis.";
}

function mergeExpenseChatTextBlock(
  deterministic: ExpenseChatBlock[],
  llmBlocks: ExpenseChatBlock[]
): ExpenseChatBlock[] {
  const llmText = llmBlocks.find((b) => b.type === "text");
  if (!llmText || llmText.type !== "text") {
    return deterministic;
  }

  const visuals = deterministic.filter((b) => b.type !== "text");
  return [llmText, ...visuals];
}

async function tryEnhanceWithLlm(
  message: string,
  context: ExpenseChatContext,
  history: ExpenseChatHistoryMessage[],
  deterministicBlocks: ExpenseChatBlock[]
): Promise<{ blocks: ExpenseChatBlock[] }> {
  try {
    const output = await openRouterExtractJson({
      messages: [
        {
          role: "system",
          content: `Return JSON only: { "blocks": [{ "type":"text", "markdown":"..." }] }.
Write one concise text block answering the user; charts are added separately.
Do not choose date ranges — the server sets the analysis window from the user's message.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: message,
            currentTimeRange: context.timeRange,
            intent: detectExpenseChatIntent(message),
            history: history.slice(-4),
            totals: {
              totalSpend: context.totalSpend,
              transactionCount: context.transactionCount,
            },
          }),
        },
      ],
      parse: (value) => ExpenseChatModelOutputSchema.parse(value),
    });

    return {
      blocks: mergeExpenseChatTextBlock(deterministicBlocks, output.blocks),
    };
  } catch (err) {
    if (!(err instanceof OpenRouterNotConfiguredError)) {
      console.warn("[expense-chat] LLM enhancement skipped", err);
    }
    return {
      blocks: deterministicBlocks,
    };
  }
}

export async function buildExpenseChatResponse(
  householdId: string,
  request: ExpenseChatRequest
): Promise<ExpenseChatResponse> {
  const message = request.message.trim();
  const history = request.history ?? [];

  const messageRange = extractTimeRangeFromMessage(message);
  const { range, wasClamped } = resolveExpenseChatTimeRange(messageRange);

  const context = await loadExpenseChatContext(householdId, range);

  const intent = detectExpenseChatIntent(message);
  let blocks = buildExpenseChatBlocks(
    intent,
    toAnalysisContext(context),
    message
  );

  if (intent === "general") {
    const { blocks: enhancedBlocks } = await tryEnhanceWithLlm(
      message,
      context,
      history,
      blocks
    );
    blocks = enhancedBlocks;
  }

  const assistantMessage: ExpenseChatMessage = {
    id: randomUUID(),
    role: "assistant",
    content: blocksToPlainText(blocks),
    blocks,
    createdAt: new Date().toISOString(),
  };

  let rangeNotice: string | undefined;
  if (wasClamped) {
    rangeNotice = `Analysis limited to the latest ${EXPENSE_CHAT_MAX_RANGE_DAYS} days (${range.label}).`;
  }

  return {
    message: assistantMessage,
    timeRange: range,
    rangeNotice,
  };
}

export { mergeExpenseChatTextBlock };
