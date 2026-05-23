import type { Account, Transaction } from "@portfolio/contracts";
import { accountRepository } from "../../cosmos/repositories/accountRepository.js";
import { transactionRepository } from "../../cosmos/repositories/transactionRepository.js";
import { householdRepository } from "../../cosmos/repositories/householdRepository.js";
import { integrationRepository } from "../../cosmos/repositories/integrationRepository.js";
import { getSecret, secretNameForSimplefin } from "../../lib/keyvault.js";
import { categorizeTransaction } from "../manual/categorize.js";
import { SimpleFinClient } from "./client.js";

export async function syncSimplefinForHousehold(
  householdId: string
): Promise<{ accounts: number; transactions: number }> {
  const secretName = secretNameForSimplefin(householdId);
  let accessUrl = await getSecret(secretName);
  if (!accessUrl) {
    accessUrl = await getSecret("simplefin-access-url");
  }
  if (!accessUrl) {
    throw new Error("SimpleFIN Access URL not configured");
  }

  const client = new SimpleFinClient(accessUrl);
  const data = await client.fetchAccounts();
  const now = new Date().toISOString();
  let txnCount = 0;

  for (const sfAccount of data.accounts ?? []) {
    const accountId = `sf-${sfAccount.id}`;
    const balance = parseFloat(sfAccount.balance) || 0;
    const account: Account = {
      id: accountId,
      householdId,
      accountId,
      source: "simplefin",
      externalId: sfAccount.id,
      displayName: sfAccount.name,
      institutionName: sfAccount.org?.name,
      balance,
      currency: sfAccount.currency ?? "USD",
      isActive: true,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await accountRepository.upsert(account);

    for (const sfTxn of sfAccount.transactions ?? []) {
      const txnId = `sf-txn-${sfTxn.id}`;
      const amount = parseFloat(sfTxn.amount) || 0;
      const date = sfTxn.posted
        ? new Date(sfTxn.posted * 1000).toISOString().slice(0, 10)
        : now.slice(0, 10);
      const description =
        sfTxn.description ?? sfTxn.payee ?? "Transaction";
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
        createdAt: now,
        updatedAt: now,
      };
      await transactionRepository.upsert(txn);
      txnCount++;
    }
  }

  await integrationRepository.upsertSyncState({
    id: "simplefin",
    householdId,
    provider: "simplefin",
    status: "success",
    lastSyncedAt: now,
    updatedAt: now,
    errorCount: 0,
  });

  await recomputeNetWorth(householdId);
  return { accounts: data.accounts?.length ?? 0, transactions: txnCount };
}

async function recomputeNetWorth(householdId: string): Promise<void> {
  const accounts = await accountRepository.listByHousehold(householdId);
  const holdings = await (
    await import("../../cosmos/repositories/holdingRepository.js")
  ).holdingRepository.listByHousehold(householdId);

  const cashBalance = accounts
    .filter((a) => a.source === "simplefin" || a.source === "manual")
    .reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const investmentValue = holdings.reduce(
    (sum, h) => sum + (h.marketValue ?? 0),
    0
  );
  const totalAssets = cashBalance + investmentValue;
  const totalLiabilities = accounts
    .filter((a) => (a.balance ?? 0) < 0)
    .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0);

  await householdRepository.updateNetWorthSummary(householdId, {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    cashBalance,
    investmentValue,
    updatedAt: new Date().toISOString(),
  });
}

export { recomputeNetWorth };
