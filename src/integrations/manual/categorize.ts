import type { TransactionCategory } from "@portfolio/contracts";

const RULES: Array<{ pattern: RegExp; category: TransactionCategory }> = [
  { pattern: /payroll|salary|direct dep/i, category: "income" },
  { pattern: /rent|mortgage|zillow/i, category: "housing" },
  { pattern: /uber|lyft|gas|shell|chevron/i, category: "transport" },
  { pattern: /whole foods|trader|kroger|safeway|restaurant/i, category: "food" },
  { pattern: /amazon|target|walmart/i, category: "shopping" },
  { pattern: /netflix|spotify|hulu/i, category: "entertainment" },
  { pattern: /cvs|walgreens|medical|hospital/i, category: "healthcare" },
  { pattern: /irs|state tax|property tax/i, category: "taxes" },
  { pattern: /transfer|zelle|venmo/i, category: "transfer" },
  { pattern: /vanguard|fidelity|schwab|robinhood/i, category: "investment" },
];

export function categorizeTransaction(
  description: string,
  _amount: number
): TransactionCategory {
  for (const rule of RULES) {
    if (rule.pattern.test(description)) {
      return rule.category;
    }
  }
  return "uncategorized";
}

export async function categorizeHouseholdTransactions(
  householdId: string
): Promise<number> {
  const { transactionRepository } = await import(
    "../../cosmos/repositories/transactionRepository.js"
  );
  const { transactions: txns } = await transactionRepository.list(householdId, {
    limit: 500,
  });
  let updated = 0;
  for (const txn of txns) {
    if (txn.categorySource === "user") continue;
    if (txn.category !== "uncategorized") continue;
    const category = categorizeTransaction(txn.description, txn.amount);
    if (category !== txn.category) {
      txn.category = category;
      txn.categorySource = "auto";
      txn.updatedAt = new Date().toISOString();
      await transactionRepository.upsert(txn);
      updated++;
    }
  }
  return updated;
}
