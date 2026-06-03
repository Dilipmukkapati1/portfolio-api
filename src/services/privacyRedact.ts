import type {
  Account,
  Holding,
  Household,
  Member,
  RedactedAccount,
  RedactedHolding,
  RedactedHousehold,
  RedactedMember,
  RedactedTaxProfile,
  RedactedTransaction,
  TaxProfile,
  Transaction,
  TransactionSummaryResponse,
} from "@portfolio/contracts";

type TransactionPage = {
  transactions: Transaction[];
  hasMore: boolean;
  nextCursor?: string;
};

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundPercent((part / total) * 100);
}

export function holdingValue(holding: Pick<Holding, "marketValue" | "quantity" | "price">): number {
  return Math.max(0, holding.marketValue ?? holding.quantity * (holding.price ?? 0));
}

export function accountValue(account: Account, holdings: Holding[]): number {
  const accountHoldings = holdings.filter((h) => h.accountId === account.accountId);
  const holdingsValue = accountHoldings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0
  );
  if (holdingsValue > 0) return holdingsValue;
  return Math.max(0, account.balance ?? 0);
}

export function redactHoldings(holdings: Holding[]): RedactedHolding[] {
  const total = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const byCategory = new Map<string, number>();
  const byAccount = new Map<string, number>();

  for (const holding of holdings) {
    const value = holdingValue(holding);
    byCategory.set(
      holding.category ?? "other",
      (byCategory.get(holding.category ?? "other") ?? 0) + value
    );
    byAccount.set(holding.accountId, (byAccount.get(holding.accountId) ?? 0) + value);
  }

  return holdings.map((holding) => {
    const {
      householdId: _householdId,
      quantity: _quantity,
      price: _price,
      marketValue: _marketValue,
      costBasis: _costBasis,
      currency: _currency,
      ...safe
    } = holding;
    const value = holdingValue(holding);
    return {
      ...safe,
      portfolioPercent: percent(value, total),
      categoryPercent: percent(value, byCategory.get(holding.category ?? "other") ?? 0),
      accountPercent: percent(value, byAccount.get(holding.accountId) ?? 0),
    };
  });
}

export function redactAccounts(
  accounts: Account[],
  holdings: Holding[]
): RedactedAccount[] {
  const values = new Map(
    accounts.map((account) => [account.accountId, accountValue(account, holdings)])
  );
  const total = [...values.values()].reduce((sum, value) => sum + value, 0);

  return accounts.map((account) => {
    const {
      householdId: _householdId,
      balance: _balance,
      currency: _currency,
      ...safe
    } = account;
    const value = values.get(account.accountId) ?? 0;
    return {
      ...safe,
      percentOfNetWorth: percent(value, total),
    };
  });
}

export function redactTransactions(page: TransactionPage) {
  return {
    privacyMode: "locked" as const,
    valuesUnlocked: false as const,
    transactions: page.transactions.map(redactTransaction),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
}

export function redactTransaction(transaction: Transaction): RedactedTransaction {
  const {
    householdId: _householdId,
    amount,
    currency: _currency,
    ...safe
  } = transaction;
  return {
    ...safe,
    direction: amount >= 0 ? "credit" : "debit",
  };
}

export function redactTransactionSummary(summary: TransactionSummaryResponse) {
  const spendTotal = Object.values(summary.spendByCategory).reduce(
    (sum, amount) => sum + Math.max(0, amount),
    0
  );
  const accountTotal = Object.values(summary.spendByAccount ?? {}).reduce(
    (sum, amount) => sum + Math.max(0, amount),
    0
  );
  const spendByCategoryPercent: Record<string, number> = {};
  for (const [category, amount] of Object.entries(summary.spendByCategory)) {
    spendByCategoryPercent[category] = percent(Math.max(0, amount), spendTotal);
  }
  const spendByAccountPercent: Record<string, number> = {};
  for (const [account, amount] of Object.entries(summary.spendByAccount ?? {})) {
    spendByAccountPercent[account] = percent(Math.max(0, amount), accountTotal);
  }
  return {
    privacyMode: "locked" as const,
    valuesUnlocked: false as const,
    spendByCategoryPercent,
    spendByAccountPercent,
    transactionCount: summary.transactionCount,
  };
}

export function unlockedTransactionSummary(summary: TransactionSummaryResponse) {
  const redacted = redactTransactionSummary(summary);
  return {
    privacyMode: "unlocked" as const,
    valuesUnlocked: true as const,
    ...summary,
    spendByCategoryPercent: redacted.spendByCategoryPercent,
    spendByAccountPercent: redacted.spendByAccountPercent,
  };
}

export function redactHousehold(household: Household): RedactedHousehold {
  const {
    netWorthSummary: _netWorthSummary,
    monthlySpendSummary: _monthlySpendSummary,
    ...safe
  } = household;
  return safe;
}

export function redactMembers(members: Member[]): RedactedMember[] {
  const totalIncome = members.reduce(
    (sum, member) =>
      sum +
      member.incomeSources.reduce((inner, source) => inner + source.amount, 0),
    0
  );

  return members.map((member) => {
    const {
      householdId: _householdId,
      incomeSources,
      contributions: _contributions,
      ...safe
    } = member;
    const income = incomeSources.reduce((sum, source) => sum + source.amount, 0);
    return {
      ...safe,
      percentOfHouseholdIncome: totalIncome > 0 ? percent(income, totalIncome) : undefined,
    };
  });
}

export function redactTaxProfile(profile: TaxProfile): RedactedTaxProfile {
  const {
    householdId: _householdId,
    inputs: _inputs,
    withholding: _withholding,
    estimatedPayments: _estimatedPayments,
    contributionLimits,
    lastEstimate,
    ...safe
  } = profile;

  return {
    ...safe,
    contributionLimits: contributionLimits?.map((limit) => ({
      type: limit.type,
      memberId: limit.memberId,
      contributionUsedPercent:
        limit.limit > 0 ? percent(limit.contributed, limit.limit) : undefined,
    })),
    lastEstimate: lastEstimate
      ? {
          taxYear: lastEstimate.taxYear,
          effectiveRate: lastEstimate.effectiveRate,
          marginalRate: lastEstimate.marginalRate,
        }
      : undefined,
  };
}
