import type { Account, Holding, Member, TransactionSummaryResponse } from "@portfolio/contracts";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { accountValue, holdingValue, redactTransactionSummary } from "./privacyRedact.js";
import { summarizePeriod } from "./transactionSummaryService.js";

const SAFE_WITHDRAWAL_RATE = 0.04;

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundPercent((part / total) * 100);
}

function currentMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyTransactionSummary(): TransactionSummaryResponse {
  return {
    totalCredits: 0,
    totalSpend: 0,
    spendByCategory: {},
    transactionCount: 0,
  };
}

async function summarizePeriodOrEmpty(
  householdId: string,
  range: { startDate?: string; endDate?: string }
): Promise<{ summary: TransactionSummaryResponse; summaryUnavailable: boolean }> {
  try {
    return {
      summary: await summarizePeriod(householdId, {
        startDate: range.startDate ?? currentMonthStart(),
        endDate: range.endDate ?? today(),
      }),
      summaryUnavailable: false,
    };
  } catch (err) {
    console.warn(
      "[privacy-analytics] transaction summary unavailable; returning portfolio analytics without spend aggregates",
      err
    );
    return { summary: emptyTransactionSummary(), summaryUnavailable: true };
  }
}

function passiveIncomeAnnual(members: Member[]): number {
  return members.reduce(
    (sum, member) =>
      sum +
      member.incomeSources
        .filter((source) => source.type === "interest" || source.type === "dividends")
        .reduce((inner, source) => inner + source.amount, 0),
    0
  );
}

function holdingAllocation(holdings: Holding[]) {
  const byCategory = new Map<string, number>();
  for (const holding of holdings) {
    const key = holding.category ?? "other";
    byCategory.set(key, (byCategory.get(key) ?? 0) + holdingValue(holding));
  }
  const total = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
  return [...byCategory.entries()]
    .map(([id, value]) => ({ id, label: id, percent: percent(value, total) }))
    .sort((a, b) => b.percent - a.percent);
}

function accountSections(accounts: Account[], holdings: Holding[]) {
  const buckets = new Map<string, number>();
  for (const account of accounts) {
    const type = account.accountType ?? account.source ?? "other";
    buckets.set(type, (buckets.get(type) ?? 0) + accountValue(account, holdings));
  }
  const total = [...buckets.values()].reduce((sum, value) => sum + value, 0);
  return [...buckets.entries()]
    .map(([id, value]) => ({ id, label: id, percent: percent(value, total) }))
    .sort((a, b) => b.percent - a.percent);
}

export function computeFreedomScore(input: {
  holdings: Holding[];
  members: Member[];
  summary: TransactionSummaryResponse;
}) {
  const totalInvestments = input.holdings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0
  );
  const annualExpenses = input.summary.totalSpend * 12;
  const annualIncome =
    totalInvestments * SAFE_WITHDRAWAL_RATE + passiveIncomeAnnual(input.members);
  const score =
    input.summary.totalSpend <= 0
      ? null
      : Math.min(100, Math.max(0, Math.round((annualIncome / annualExpenses) * 100)));

  return { score, annualIncome, annualExpenses };
}

export async function getDashboardAnalytics(
  householdId: string,
  range: { startDate?: string; endDate?: string } = {}
) {
  const [accounts, holdings, members, summaryResult] = await Promise.all([
    accountRepository.listByHousehold(householdId),
    holdingRepository.listByHousehold(householdId),
    memberRepository.listByHousehold(householdId),
    summarizePeriodOrEmpty(householdId, range),
  ]);
  const { summary, summaryUnavailable } = summaryResult;
  const freedomScore = computeFreedomScore({ holdings, members, summary });
  const netWorth = accounts.reduce(
    (sum, account) => sum + accountValue(account, holdings),
    0
  );

  return {
    accounts,
    holdings,
    members,
    summary,
    locked: {
      privacyMode: "locked" as const,
      valuesUnlocked: false as const,
      allocation: holdingAllocation(holdings),
      spendByCategoryPercent: redactTransactionSummary(summary).spendByCategoryPercent,
      transactionCount: summary.transactionCount,
      summaryUnavailable,
      accountSections: accountSections(accounts, holdings),
      freedomScore: {
        privacyMode: "locked" as const,
        valuesUnlocked: false as const,
        score: freedomScore.score,
      },
    },
    unlocked: {
      privacyMode: "unlocked" as const,
      valuesUnlocked: true as const,
      allocation: holdingAllocation(holdings),
      spendByCategoryPercent: redactTransactionSummary(summary).spendByCategoryPercent,
      transactionCount: summary.transactionCount,
      summaryUnavailable,
      accountSections: accountSections(accounts, holdings),
      freedomScore: {
        privacyMode: "unlocked" as const,
        valuesUnlocked: true as const,
        ...freedomScore,
      },
      netWorth,
      uninvestedCash: accounts
        .filter((account) => account.source !== "snaptrade")
        .reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0),
    },
  };
}
