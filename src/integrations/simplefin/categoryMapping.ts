import type { TransactionCategory } from "@portfolio/contracts";

const PROVIDER_CATEGORY_RULES: Array<{
  pattern: RegExp;
  category: TransactionCategory;
}> = [
  { pattern: /food|restaurant|dining|grocery|groceries|coffee|starbucks/i, category: "food" },
  { pattern: /transfer|payment|zelle|venmo|paypal/i, category: "transfer" },
  { pattern: /invest|brokerage|vanguard|fidelity|schwab|robinhood/i, category: "investment" },
  { pattern: /rent|mortgage|housing|landlord/i, category: "housing" },
  { pattern: /utility|electric|gas bill|water|internet|phone/i, category: "utilities" },
  { pattern: /uber|lyft|gas|fuel|parking|transit/i, category: "transport" },
  { pattern: /medical|health|pharmacy|hospital|cvs|walgreens/i, category: "healthcare" },
  { pattern: /insurance|premium/i, category: "insurance" },
  { pattern: /netflix|spotify|hulu|entertainment|movie/i, category: "entertainment" },
  { pattern: /amazon|target|walmart|shopping|retail/i, category: "shopping" },
  { pattern: /education|tuition|school|book/i, category: "education" },
  { pattern: /tax|irs|property tax/i, category: "taxes" },
  { pattern: /fee|charge|service fee|atm/i, category: "fees" },
  { pattern: /payroll|salary|deposit|income|direct dep/i, category: "income" },
];

export function mapProviderCategory(
  providerCategory: string
): TransactionCategory | null {
  const normalized = providerCategory.trim();
  if (!normalized) return null;

  for (const rule of PROVIDER_CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.category;
    }
  }

  return null;
}

export function readSimpleFinProviderCategory(
  extra: Record<string, unknown> | undefined
): string | undefined {
  const raw = extra?.category;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}
