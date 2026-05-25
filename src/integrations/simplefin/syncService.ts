import type { Account, Holding, Transaction } from "@portfolio/contracts";
import { categorizeInvestment } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";
import { formatStorageSourceMap } from "../../storage/layout.js";
import { accountRepository } from "../../cosmos/repositories/accountRepository.js";
import { transactionRepository } from "../../cosmos/repositories/transactionRepository.js";
import { householdRepository } from "../../cosmos/repositories/householdRepository.js";
import { integrationRepository } from "../../cosmos/repositories/integrationRepository.js";
import { holdingRepository } from "../../cosmos/repositories/holdingRepository.js";
import { getSecret, secretNameForSimplefin } from "../../lib/keyvault.js";
import { categorizeTransaction } from "../manual/categorize.js";
import {
  mapProviderCategory,
  readSimpleFinProviderCategory,
} from "./categoryMapping.js";
import { simplefinRequestsRemaining } from "../syncPolicy.js";
import {
  SimpleFinClient,
  assertValidAccessUrl,
  collectSimpleFinErrors,
  extractSimpleFinHoldings,
  formatSimpleFinErrors,
  partitionSimpleFinErrors,
  type SimpleFinAccount,
  type SimpleFinAccountsResponse,
  type SimpleFinHolding,
} from "./client.js";
import {
  buildConnectionIndex,
  hardRefreshStartDate,
  hasSimpleFinSecurities,
  inferAccountType,
  resolveSimplefinSyncWindow,
  resolveInstitutionName,
  resolveOwnerMemberId,
  resolveSyncedAccountType,
  simpleFinAccountDocumentId,
  simpleFinExternalId,
} from "./accountMapping.js";
import { memberRepository } from "../../cosmos/repositories/memberRepository.js";

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

  const store = await getDataStore();
  console.log(
    `[portfolio-api] SimpleFIN sync data sources: ${formatStorageSourceMap(store.sources)}`
  );

  const client = new SimpleFinClient(accessUrl);
  const now = new Date().toISOString();
  const previousSyncState = await integrationRepository.getSyncState(
    householdId,
    "simplefin"
  );
  const existingAccounts = await accountRepository.listByHousehold(householdId);
  const knownSimplefinAccounts = existingAccounts.filter(
    (account) => account.source === "simplefin"
  );
  const syncWindow = resolveSimplefinSyncWindow({
    hasSimplefinAccounts: knownSimplefinAccounts.length > 0,
    lastSyncedAt: previousSyncState?.lastSyncedAt,
    accountLastSyncedAt: knownSimplefinAccounts
      .filter((account) => account.isActive)
      .map((account) => account.lastSyncedAt),
  });

  console.log(
    `[portfolio-api] SimpleFIN sync window: mode=${syncWindow.mode} startDate=${syncWindow.startDate} external=SimpleFIN API`
  );

  let apiRequestCount = 0;
  let data = await client.fetchAccounts(syncWindow.startDate);
  apiRequestCount++;

  const connections = buildConnectionIndex(data.connections);
  const allErrors = collectSimpleFinErrors(data);
  const { fatal, informational } = partitionSimpleFinErrors(allErrors);
  const warnings = [...informational, ...fatal]
    .map((e) => e.msg ?? e.message ?? e.code)
    .filter((msg): msg is string => Boolean(msg));

  const syncedAccountIds = new Set<string>();
  const newAccountIds = new Set<string>();
  let txnCount = 0;
  let holdingCount = 0;

  const firstPass = await processSimplefinResponse(data, {
    householdId,
    now,
    connections,
    existingAccounts,
    syncedAccountIds,
    newAccountIds,
  });
  txnCount += firstPass.transactions;
  holdingCount += firstPass.holdings;

  if (
    syncWindow.mode === "incremental" &&
    newAccountIds.size > 0 &&
    simplefinRequestsRemaining(
      previousSyncState?.lastSyncedAt,
      previousSyncState?.dailyRequestCount,
      apiRequestCount
    ) > 0
  ) {
    const hardData = await client.fetchAccounts(hardRefreshStartDate());
    apiRequestCount++;
    const hardPass = await processSimplefinResponse(hardData, {
      householdId,
      now,
      connections: buildConnectionIndex(hardData.connections),
      existingAccounts,
      syncedAccountIds,
      newAccountIds,
      accountFilter: newAccountIds,
    });
    txnCount += hardPass.transactions;
    holdingCount += hardPass.holdings;
  } else if (
    syncWindow.mode === "incremental" &&
    newAccountIds.size > 0
  ) {
    warnings.push(
      "New SimpleFIN account(s) detected but daily request limit prevented a hard refresh backfill."
    );
  }

  await deactivateMissingSimplefinAccounts(householdId, syncedAccountIds, now);

  const today = now.slice(0, 10);
  const previousDate = previousSyncState?.lastSyncedAt?.slice(0, 10);
  const dailyRequestCount =
    previousDate === today
      ? (previousSyncState?.dailyRequestCount ?? 0) + apiRequestCount
      : apiRequestCount;

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

  console.log(
    `[portfolio-api] SimpleFIN sync complete householdId=${householdId} accounts=${data.accounts?.length ?? 0} transactions=${txnCount} holdings=${holdingCount} writes→accounts=${store.sources.entities.accounts} transactions=${store.sources.entities.transactions} holdings=${store.sources.entities.holdings}`
  );

  return {
    accounts: data.accounts?.length ?? 0,
    transactions: txnCount,
    holdings: holdingCount,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

type ProcessSimplefinResponseOptions = {
  householdId: string;
  now: string;
  connections: ReturnType<typeof buildConnectionIndex>;
  existingAccounts: Account[];
  syncedAccountIds: Set<string>;
  newAccountIds: Set<string>;
  accountFilter?: Set<string>;
};

async function processSimplefinResponse(
  data: SimpleFinAccountsResponse,
  options: ProcessSimplefinResponseOptions
): Promise<{ transactions: number; holdings: number }> {
  let txnCount = 0;
  let holdingCount = 0;
  const members = await memberRepository.listByHousehold(options.householdId);

  for (const sfAccount of data.accounts ?? []) {
    const connId = sfAccount.conn_id ?? "default";
    const externalId = simpleFinExternalId(connId, sfAccount.id);
    const accountId = await resolveAccountDocumentId(
      options.householdId,
      connId,
      sfAccount
    );

    if (options.accountFilter && !options.accountFilter.has(accountId)) {
      continue;
    }

    options.syncedAccountIds.add(accountId);

    const existing = findExistingSimplefinAccount(
      options.existingAccounts,
      externalId,
      sfAccount.id
    );
    if (!existing) {
      options.newAccountIds.add(accountId);
    }

    const balance = parseFloat(sfAccount.balance) || 0;
    const sfHoldings = extractSimpleFinHoldings(sfAccount);
    const conn = sfAccount.conn_id
      ? options.connections.get(sfAccount.conn_id)
      : undefined;
    const ownerMemberId =
      resolveOwnerMemberId(conn?.name ?? sfAccount.conn_name, members) ??
      existing?.ownerMemberId;
    const account: Account = {
      id: accountId,
      householdId: options.householdId,
      accountId,
      source: "simplefin",
      externalId,
      displayName: sfAccount.name,
      institutionName: resolveInstitutionName(sfAccount, options.connections),
      accountType: resolveSyncedAccountType(
        sfAccount.name,
        balance,
        sfHoldings
      ),
      ownerMemberId,
      connectionLabel: conn?.name ?? sfAccount.conn_name,
      balance,
      currency: sfAccount.currency ?? "USD",
      isActive: true,
      lastSyncedAt: options.now,
      createdAt: existing?.createdAt ?? options.now,
      updatedAt: options.now,
    };
    await accountRepository.upsert(account);

    txnCount += await syncAccountTransactions(
      options.householdId,
      account,
      sfAccount,
      options.now
    );
    holdingCount += await syncAccountHoldings(
      options.householdId,
      accountId,
      sfAccount,
      options.now
    );
  }

  return { transactions: txnCount, holdings: holdingCount };
}

function findExistingSimplefinAccount(
  existingAccounts: Account[],
  externalId: string,
  legacyExternalId: string
): Account | null {
  return (
    existingAccounts.find(
      (account) =>
        account.source === "simplefin" && account.externalId === externalId
    ) ??
    existingAccounts.find(
      (account) =>
        account.source === "simplefin" &&
        account.externalId === legacyExternalId
    ) ??
    null
  );
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

function formatTransactionAccountName(account: Account): string {
  const name = account.displayName.trim();
  const institution = account.institutionName?.trim();
  if (institution && institution !== name) {
    return `${institution} — ${name}`;
  }
  return name;
}

async function syncAccountTransactions(
  householdId: string,
  account: Account,
  sfAccount: SimpleFinAccount,
  now: string
): Promise<number> {
  const { transactions: existingTxns } = await transactionRepository.list(
    householdId,
    {
      accountId: account.accountId,
      limit: 500,
    }
  );
  const existingByTxnId = new Map(
    existingTxns.map((txn) => [txn.txnId, txn] as const)
  );
  const existingByExternalId = new Map(
    existingTxns
      .filter((txn) => txn.externalId)
      .map((txn) => [txn.externalId!, txn] as const)
  );

  let count = 0;
  for (const sfTxn of sfAccount.transactions ?? []) {
    const matched =
      existingByExternalId.get(sfTxn.id) ??
      existingByTxnId.get(`sf-txn-${account.accountId}-${sfTxn.id}`);
    const txnId = matched?.txnId ?? `sf-txn-${account.accountId}-${sfTxn.id}`;
    const amount = parseFloat(sfTxn.amount) || 0;
    const postedAt =
      sfTxn.posted && sfTxn.posted > 0
        ? new Date(sfTxn.posted * 1000).toISOString()
        : undefined;
    const transactedAt = sfTxn.transacted_at
      ? new Date(sfTxn.transacted_at * 1000).toISOString()
      : undefined;
    const date = (transactedAt ?? postedAt ?? now).slice(0, 10);
    const description =
      sfTxn.description?.trim() ||
      sfTxn.payee?.trim() ||
      sfTxn.memo?.trim() ||
      "Transaction";
    const providerCategory = readSimpleFinProviderCategory(sfTxn.extra);
    const categoryDecision = resolveSyncedCategory({
      matched,
      providerCategory,
      description,
      amount,
    });

    const txn: Transaction = {
      id: txnId,
      householdId,
      txnId,
      accountId: account.accountId,
      accountName: formatTransactionAccountName(account),
      source: account.source,
      amount,
      currency: account.currency ?? "USD",
      date,
      transactedAt,
      postedAt,
      description,
      memo: sfTxn.memo?.trim() || undefined,
      merchant: sfTxn.payee,
      category: categoryDecision.category,
      categorySource: categoryDecision.categorySource,
      providerCategory,
      pending: sfTxn.pending ?? false,
      externalId: sfTxn.id,
      createdAt: matched?.createdAt ?? now,
      updatedAt: now,
    };
    await transactionRepository.upsert(txn);
    count++;
  }
  return count;
}

function resolveSyncedCategory(input: {
  matched: Transaction | undefined;
  providerCategory: string | undefined;
  description: string;
  amount: number;
}): { category: Transaction["category"]; categorySource: Transaction["categorySource"] } {
  if (input.matched?.categorySource === "user") {
    return {
      category: input.matched.category,
      categorySource: "user",
    };
  }

  if (input.providerCategory) {
    const mapped = mapProviderCategory(input.providerCategory);
    if (mapped) {
      return { category: mapped, categorySource: "provider" };
    }
  }

  if (input.matched && input.matched.category !== "uncategorized") {
    return {
      category: input.matched.category,
      categorySource: input.matched.categorySource ?? "auto",
    };
  }

  return {
    category: categorizeTransaction(input.description, input.amount),
    categorySource: "auto",
  };
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
