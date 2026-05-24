import type { Account, Holding, Transaction } from "@portfolio/contracts";
import { categorizeInvestment } from "@portfolio/contracts";
import { accountRepository } from "../../cosmos/repositories/accountRepository.js";
import { transactionRepository } from "../../cosmos/repositories/transactionRepository.js";
import { householdRepository } from "../../cosmos/repositories/householdRepository.js";
import { integrationRepository } from "../../cosmos/repositories/integrationRepository.js";
import { holdingRepository } from "../../cosmos/repositories/holdingRepository.js";
import { getSecret, secretNameForSimplefin } from "../../lib/keyvault.js";
import { categorizeTransaction } from "../manual/categorize.js";
import {
  SimpleFinClient,
  assertValidAccessUrl,
  collectSimpleFinErrors,
  extractSimpleFinHoldings,
  formatSimpleFinErrors,
  partitionSimpleFinErrors,
  type SimpleFinAccount,
  type SimpleFinHolding,
} from "./client.js";
import {
  buildConnectionIndex,
  defaultTransactionStartDate,
  SIMPLEFIN_DEFAULT_TRANSACTION_DAYS,
  hasSimpleFinSecurities,
  inferAccountType,
  resolveInstitutionName,
  resolveSyncedAccountType,
  simpleFinAccountDocumentId,
  simpleFinExternalId,
} from "./accountMapping.js";

export type SimpleFinSyncResult = {
  accounts: number;
  transactions: number;
  holdings: number;
  warnings?: string[];
};

export async function syncSimplefinForHousehold(
  householdId: string
): Promise<SimpleFinSyncResult> {
  const secretName = secretNameForSimplefin(householdId);
  let accessUrl = await getSecret(secretName);
  if (!accessUrl) {
    accessUrl = await getSecret("simplefin-access-url");
  }
  if (!accessUrl) {
    throw new Error("SimpleFIN Access URL not configured");
  }

  assertValidAccessUrl(accessUrl);

  const client = new SimpleFinClient(accessUrl);
  const startDate = defaultTransactionStartDate(SIMPLEFIN_DEFAULT_TRANSACTION_DAYS);
  const data = await client.fetchAccounts(startDate);
  const now = new Date().toISOString();
  const connections = buildConnectionIndex(data.connections);
  const allErrors = collectSimpleFinErrors(data);
  const { fatal, informational } = partitionSimpleFinErrors(allErrors);
  const warnings = [...informational, ...fatal]
    .map((e) => e.msg ?? e.message ?? e.code)
    .filter((msg): msg is string => Boolean(msg));
  const syncedAccountIds = new Set<string>();
  let txnCount = 0;
  let holdingCount = 0;

  for (const sfAccount of data.accounts ?? []) {
    const connId = sfAccount.conn_id ?? "default";
    const externalId = simpleFinExternalId(connId, sfAccount.id);
    const accountId = await resolveAccountDocumentId(
      householdId,
      connId,
      sfAccount
    );
    syncedAccountIds.add(accountId);

    const existing = await accountRepository.findByExternalId(
      householdId,
      "simplefin",
      externalId
    );
    const legacyExisting =
      existing ??
      (await accountRepository.findByExternalId(
        householdId,
        "simplefin",
        sfAccount.id
      ));

    const balance = parseFloat(sfAccount.balance) || 0;
    const sfHoldings = extractSimpleFinHoldings(sfAccount);
    const account: Account = {
      id: accountId,
      householdId,
      accountId,
      source: "simplefin",
      externalId,
      displayName: sfAccount.name,
      institutionName: resolveInstitutionName(sfAccount, connections),
      accountType: resolveSyncedAccountType(
        sfAccount.name,
        balance,
        sfHoldings
      ),
      balance,
      currency: sfAccount.currency ?? "USD",
      isActive: true,
      lastSyncedAt: now,
      createdAt: legacyExisting?.createdAt ?? now,
      updatedAt: now,
    };
    await accountRepository.upsert(account);

    txnCount += await syncAccountTransactions(
      householdId,
      accountId,
      sfAccount,
      now
    );
    holdingCount += await syncAccountHoldings(
      householdId,
      accountId,
      sfAccount,
      now
    );
  }

  await deactivateMissingSimplefinAccounts(householdId, syncedAccountIds, now);

  const previousSyncState = await integrationRepository.getSyncState(
    householdId,
    "simplefin"
  );
  const today = now.slice(0, 10);
  const previousDate = previousSyncState?.lastSyncedAt?.slice(0, 10);
  const dailyRequestCount =
    previousDate === today ? (previousSyncState?.dailyRequestCount ?? 0) + 1 : 1;

  await integrationRepository.upsertSyncState({
    id: "simplefin",
    householdId,
    provider: "simplefin",
    status: "success",
    lastSyncedAt: now,
    dailyRequestCount,
    updatedAt: now,
    errorCount: 0,
    lastError: fatal.length > 0 ? formatSimpleFinErrors(fatal) : undefined,
  });

  await recomputeNetWorth(householdId);
  return {
    accounts: data.accounts?.length ?? 0,
    transactions: txnCount,
    holdings: holdingCount,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function resolveAccountDocumentId(
  householdId: string,
  connId: string,
  sfAccount: SimpleFinAccount
): Promise<string> {
  const externalId = simpleFinExternalId(connId, sfAccount.id);
  const byExternal = await accountRepository.findByExternalId(
    householdId,
    "simplefin",
    externalId
  );
  if (byExternal) return byExternal.accountId;

  const legacy = await accountRepository.findByExternalId(
    householdId,
    "simplefin",
    sfAccount.id
  );
  if (legacy) return legacy.accountId;

  return simpleFinAccountDocumentId(connId, sfAccount.id);
}

async function syncAccountTransactions(
  householdId: string,
  accountId: string,
  sfAccount: SimpleFinAccount,
  now: string
): Promise<number> {
  const existingTxns = await transactionRepository.list(householdId, {
    accountId,
    limit: 500,
  });
  const existingById = new Map(
    existingTxns.map((txn) => [txn.txnId, txn] as const)
  );

  let count = 0;
  for (const sfTxn of sfAccount.transactions ?? []) {
    const txnId = `sf-txn-${accountId}-${sfTxn.id}`;
    const amount = parseFloat(sfTxn.amount) || 0;
    const date = sfTxn.posted
      ? new Date(sfTxn.posted * 1000).toISOString().slice(0, 10)
      : now.slice(0, 10);
    const description =
      sfTxn.description?.trim() ||
      sfTxn.payee?.trim() ||
      sfTxn.memo?.trim() ||
      "Transaction";
    const txn: Transaction = {
      id: txnId,
      householdId,
      txnId,
      accountId,
      amount,
      date,
      description,
      merchant: sfTxn.payee,
      category: categorizeTransaction(description, amount),
      pending: sfTxn.pending ?? false,
      externalId: sfTxn.id,
      createdAt: existingById.get(txnId)?.createdAt ?? now,
      updatedAt: now,
    };
    await transactionRepository.upsert(txn);
    count++;
  }
  return count;
}

const CASH_SYMBOL = "CASH";

function isInvestmentAccount(
  sfAccount: SimpleFinAccount,
  sfHoldings: SimpleFinHolding[]
): boolean {
  return (
    hasSimpleFinSecurities(sfHoldings) ||
    inferAccountType(sfAccount.name) === "investment"
  );
}

function mapSimpleFinHolding(
  h: SimpleFinHolding,
  householdId: string,
  accountId: string,
  sfAccount: SimpleFinAccount,
  now: string,
  createdAt: string
): Holding {
  const symbol = h.symbol?.trim() || h.id;
  const quantity = parseFloat(h.shares ?? "0") || 0;
  const marketValue = parseFloat(h.market_value ?? "0") || undefined;
  const price =
    quantity > 0 && marketValue !== undefined
      ? marketValue / quantity
      : parseFloat(h.purchase_price ?? "0") || undefined;
  const holdingId = `${accountId}-${symbol}`;
  const category = categorizeInvestment({ symbol, description: h.description });
  return {
    id: holdingId,
    householdId,
    holdingId,
    accountId,
    symbol,
    description: h.description,
    quantity,
    price,
    marketValue,
    costBasis: parseFloat(h.cost_basis ?? "") || undefined,
    currency: h.currency?.trim() || sfAccount.currency || "USD",
    category,
    lastSyncedAt: now,
    createdAt,
    updatedAt: now,
  };
}

async function syncAccountHoldings(
  householdId: string,
  accountId: string,
  sfAccount: SimpleFinAccount,
  now: string
): Promise<number> {
  const sfHoldings = extractSimpleFinHoldings(sfAccount);
  if (!isInvestmentAccount(sfAccount, sfHoldings)) {
    return 0;
  }

  const existingHoldings = await holdingRepository.listByHousehold(householdId);
  const existingById = new Map(
    existingHoldings
      .filter((h) => h.accountId === accountId)
      .map((h) => [h.holdingId, h] as const)
  );

  const syncedHoldingIds = new Set<string>();
  let count = 0;
  const balance = parseFloat(sfAccount.balance) || 0;
  let securitiesValue = 0;

  for (const h of sfHoldings) {
    const symbol = h.symbol?.trim() || h.id;
    if (symbol.toUpperCase() === CASH_SYMBOL) continue;

    const mapped = mapSimpleFinHolding(
      h,
      householdId,
      accountId,
      sfAccount,
      now,
      existingById.get(`${accountId}-${symbol}`)?.createdAt ?? now
    );
    securitiesValue += mapped.marketValue ?? 0;
    syncedHoldingIds.add(mapped.holdingId);
    await holdingRepository.upsert(mapped);
    count++;
  }

  const cashAmount =
    sfHoldings.length > 0
      ? Math.max(0, balance - securitiesValue)
      : balance;
  const cashHoldingId = `${accountId}-${CASH_SYMBOL}`;

  if (cashAmount >= 0.01) {
    const existingCash = existingById.get(cashHoldingId);
    const cashHolding: Holding = {
      id: cashHoldingId,
      householdId,
      holdingId: cashHoldingId,
      accountId,
      symbol: CASH_SYMBOL,
      description: "Cash",
      quantity: cashAmount,
      price: 1,
      marketValue: cashAmount,
      currency: sfAccount.currency ?? "USD",
      category: "cash",
      lastSyncedAt: now,
      createdAt: existingCash?.createdAt ?? now,
      updatedAt: now,
    };
    syncedHoldingIds.add(cashHoldingId);
    await holdingRepository.upsert(cashHolding);
    count++;
  }

  for (const existing of existingHoldings) {
    if (existing.accountId !== accountId) continue;
    if (syncedHoldingIds.has(existing.holdingId)) continue;
    await holdingRepository.delete(householdId, existing.id);
  }

  return count;
}

async function deactivateMissingSimplefinAccounts(
  householdId: string,
  syncedAccountIds: Set<string>,
  now: string
): Promise<void> {
  const existing = await accountRepository.listByHousehold(householdId);
  for (const account of existing) {
    if (account.source !== "simplefin" || !account.isActive) continue;
    if (syncedAccountIds.has(account.accountId)) continue;
    await accountRepository.upsert({
      ...account,
      isActive: false,
      updatedAt: now,
    });
  }
}

async function recomputeNetWorth(householdId: string): Promise<void> {
  const accounts = await accountRepository.listByHousehold(householdId);
  const holdings = await holdingRepository.listByHousehold(householdId);
  const accountsWithHoldings = new Set(holdings.map((h) => h.accountId));

  const isBank = (a: Account) =>
    a.accountType === "depository" ||
    a.accountType === "checking" ||
    a.accountType === "savings";
  const isCredit = (a: Account) =>
    a.accountType === "credit" || a.accountType === "loan";

  const cashBalance = accounts
    .filter(
      (a) =>
        a.isActive &&
        (a.source === "simplefin" || a.source === "manual") &&
        isBank(a) &&
        !accountsWithHoldings.has(a.accountId)
    )
    .reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const investmentValueFromHoldings = holdings.reduce(
    (sum, h) => sum + (h.marketValue ?? 0),
    0
  );
  const investmentValueFromAccounts = accounts
    .filter(
      (a) =>
        a.isActive &&
        a.accountType === "investment" &&
        !accountsWithHoldings.has(a.accountId)
    )
    .reduce((sum, a) => sum + Math.max(a.balance ?? 0, 0), 0);
  const investmentValue =
    investmentValueFromHoldings + investmentValueFromAccounts;
  const totalCredit = accounts
    .filter((a) => a.isActive && isCredit(a))
    .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0);
  const totalAssets = cashBalance + investmentValue;
  const totalLiabilities = totalCredit;

  await householdRepository.updateNetWorthSummary(householdId, {
    totalAssets,
    totalLiabilities,
    netWorth: cashBalance - totalCredit + investmentValue,
    cashBalance,
    investmentValue,
    updatedAt: new Date().toISOString(),
  });
}

export { recomputeNetWorth };
