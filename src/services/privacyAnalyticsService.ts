import {
  categorizeInvestment,
  investmentCategoryLabel,
  normalizeInvestmentCategory,
  type Account,
  type Holding,
  type InvestmentCategory,
  type Member,
  type TransactionSummaryResponse,
} from "@portfolio/contracts";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { accountValue, holdingValue, redactTransactionSummary } from "./privacyRedact.js";
import { summarizePeriod } from "./transactionSummaryService.js";

const SAFE_WITHDRAWAL_RATE = 0.04;
const BANK_ACCOUNT_TYPES = new Set(["depository", "checking", "savings"]);
const CREDIT_ACCOUNT_TYPES = new Set(["credit", "loan"]);

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundPercent((part / total) * 100);
}

function isLikelyBankAccountName(displayName: string): boolean {
  const lower = displayName.toLowerCase();
  return (
    lower.includes("checking") ||
    lower.includes("chequing") ||
    lower.includes("savings") ||
    (lower.includes("cash") && !lower.includes("brokerage"))
  );
}

function isCashHolding(holding: Holding): boolean {
  if (holding.symbol.trim().toUpperCase() === "CASH") return true;
  if (holding.category === "cash") return true;
  return (
    categorizeInvestment({
      symbol: holding.symbol,
      description: holding.description,
    }) === "cash"
  );
}

function hasSecurities(holdings: Holding[]): boolean {
  return holdings.some(
    (holding) =>
      !isCashHolding(holding) &&
      ((holding.marketValue ?? 0) > 0 || holding.quantity > 0)
  );
}

function isCreditAccount(account: Account): boolean {
  const type = (account.accountType ?? "").toLowerCase();
  if (CREDIT_ACCOUNT_TYPES.has(type)) return true;
  if (BANK_ACCOUNT_TYPES.has(type) || type === "investment") return false;

  const name = account.displayName.toLowerCase();
  return (
    name.includes("credit card") ||
    name.includes(" visa") ||
    name.includes(" mastercard") ||
    name.includes(" amex") ||
    name.includes("mortgage")
  );
}

function isInvestmentAccount(
  account: Account,
  holdingsByAccount: Map<string, Holding[]>
): boolean {
  if (account.source === "snaptrade") return true;

  const holdings = holdingsByAccount.get(account.accountId) ?? [];
  if (hasSecurities(holdings)) return true;

  const type = (account.accountType ?? "").toLowerCase();
  if (type !== "investment") return false;

  return !isLikelyBankAccountName(account.displayName);
}

function isBankAccount(
  account: Account,
  holdingsByAccount: Map<string, Holding[]>
): boolean {
  if (isInvestmentAccount(account, holdingsByAccount)) return false;
  if (isCreditAccount(account)) return false;
  if (account.source === "snaptrade") return false;

  const type = (account.accountType ?? "").toLowerCase();
  if (BANK_ACCOUNT_TYPES.has(type)) return true;
  if (type === "credit" || type === "loan") return false;

  return account.source === "simplefin" || account.source === "manual";
}

function holdingsByAccount(holdings: Holding[]): Map<string, Holding[]> {
  const byAccount = new Map<string, Holding[]>();
  for (const holding of holdings) {
    const accountHoldings = byAccount.get(holding.accountId) ?? [];
    accountHoldings.push(holding);
    byAccount.set(holding.accountId, accountHoldings);
  }
  return byAccount;
}

function investmentAccountCashBalance(account: Account, holdings: Holding[]): number {
  if (holdings.length === 0) {
    return Math.max(account.balance ?? 0, 0);
  }

  const cashFromHoldings = holdings
    .filter(isCashHolding)
    .reduce((sum, holding) => sum + holdingValue(holding), 0);
  const securitiesValue = holdings
    .filter((holding) => !isCashHolding(holding))
    .reduce((sum, holding) => sum + holdingValue(holding), 0);

  if (hasSecurities(holdings)) {
    const balance = account.balance ?? 0;
    const residual = balance > 0 ? Math.max(0, balance - securitiesValue) : 0;
    return Math.max(cashFromHoldings, residual);
  }

  return Math.max(cashFromHoldings, Math.max(account.balance ?? 0, 0));
}

function bankAccountCashBalance(account: Account, holdings: Holding[]): number {
  if (holdings.length === 0) {
    return Math.max(account.balance ?? 0, 0);
  }

  const cashFromHoldings = holdings
    .filter(isCashHolding)
    .reduce((sum, holding) => sum + holdingValue(holding), 0);
  if (cashFromHoldings > 0) return cashFromHoldings;

  return Math.max(account.balance ?? 0, 0);
}

export function computeUninvestedCash(
  accounts: Account[],
  holdings: Holding[]
): number {
  const byAccount = holdingsByAccount(holdings);
  let total = 0;

  for (const account of accounts) {
    if (account.isActive === false || isCreditAccount(account)) continue;

    const accountHoldings = byAccount.get(account.accountId) ?? [];
    if (isInvestmentAccount(account, byAccount)) {
      total += investmentAccountCashBalance(account, accountHoldings);
    } else if (isBankAccount(account, byAccount)) {
      total += bankAccountCashBalance(account, accountHoldings);
    }
  }

  return total;
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
    spendByAccount: {},
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

function resolveHoldingCategory(holding: Holding): InvestmentCategory {
  if (holding.category) return normalizeInvestmentCategory(holding.category);
  return categorizeInvestment({
    symbol: holding.symbol,
    description: holding.description,
  });
}

export function holdingAllocation(holdings: Holding[]) {
  const byCategory = new Map<InvestmentCategory, number>();
  for (const holding of holdings) {
    const category = resolveHoldingCategory(holding);
    byCategory.set(category, (byCategory.get(category) ?? 0) + holdingValue(holding));
  }
  const total = [...byCategory.values()].reduce((sum, value) => sum + value, 0);
  return [...byCategory.entries()]
    .map(([id, value]) => ({
      id,
      label: investmentCategoryLabel(id),
      percent: percent(value, total),
    }))
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
  const uninvestedCash = computeUninvestedCash(accounts, holdings);

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
      uninvestedCashPercent: percent(uninvestedCash, netWorth),
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
      uninvestedCash,
    },
  };
}
