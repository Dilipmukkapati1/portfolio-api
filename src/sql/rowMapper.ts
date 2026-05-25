import type { Transaction } from "@portfolio/contracts";

export type TransactionRow = {
  id: string;
  household_id: string;
  txn_id: string;
  account_id: string;
  account_name: string | null;
  source: string;
  amount: number;
  currency: string;
  txn_date: Date;
  transacted_at: Date | null;
  posted_at: Date | null;
  description: string;
  memo: string | null;
  merchant: string | null;
  category: string;
  category_source: string;
  provider_category: string | null;
  pending: boolean;
  external_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toIsoDate(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoDateTime(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.toISOString();
}

export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    txnId: row.txn_id,
    accountId: row.account_id,
    accountName: row.account_name ?? undefined,
    source: row.source as Transaction["source"],
    amount: Number(row.amount),
    currency: row.currency.trim(),
    date: toIsoDate(row.txn_date) ?? "",
    transactedAt: toIsoDateTime(row.transacted_at),
    postedAt: toIsoDateTime(row.posted_at),
    description: row.description,
    memo: row.memo ?? undefined,
    merchant: row.merchant ?? undefined,
    category: row.category as Transaction["category"],
    categorySource: row.category_source as Transaction["categorySource"],
    providerCategory: row.provider_category ?? undefined,
    pending: Boolean(row.pending),
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function transactionToRow(txn: Transaction): TransactionRow {
  return {
    id: txn.id,
    household_id: txn.householdId,
    txn_id: txn.txnId,
    account_id: txn.accountId,
    account_name: txn.accountName ?? null,
    source: txn.source,
    amount: txn.amount,
    currency: txn.currency,
    txn_date: new Date(`${txn.date}T00:00:00.000Z`),
    transacted_at: txn.transactedAt ? new Date(txn.transactedAt) : null,
    posted_at: txn.postedAt ? new Date(txn.postedAt) : null,
    description: txn.description,
    memo: txn.memo ?? null,
    merchant: txn.merchant ?? null,
    category: txn.category,
    category_source: txn.categorySource,
    provider_category: txn.providerCategory ?? null,
    pending: txn.pending,
    external_id: txn.externalId ?? null,
    created_at: new Date(txn.createdAt),
    updated_at: new Date(txn.updatedAt),
  };
}
