import type { Account, Holding } from "@portfolio/contracts";
import { accountRepository } from "../../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../../cosmos/repositories/holdingRepository.js";
import { integrationRepository } from "../../cosmos/repositories/integrationRepository.js";
import { getSecret } from "../../lib/keyvault.js";
import { recomputeNetWorth } from "../simplefin/syncService.js";
import { snapTradeClient } from "./client.js";

export async function syncSnaptradeForHousehold(
  householdId: string,
  accountId?: string
): Promise<{ holdings: number }> {
  const token = await integrationRepository.getToken(householdId, "snaptrade");
  if (!token?.externalUserId) {
    throw new Error("SnapTrade not connected for household");
  }

  const userSecret = await getSecret(
    token.keyVaultSecretName
  );
  if (!userSecret) {
    throw new Error("SnapTrade user secret not found");
  }

  const userId = token.externalUserId;
  const accounts = await accountRepository.listByHousehold(householdId);
  const snapAccounts = accounts.filter(
    (a) => a.source === "snaptrade" && (!accountId || a.accountId === accountId)
  );

  const now = new Date().toISOString();
  let holdingCount = 0;

  for (const account of snapAccounts.length > 0
    ? snapAccounts
    : [
        {
          accountId: `st-${householdId}`,
          householdId,
          source: "snaptrade" as const,
        } as Account,
      ]) {
    const positions = await snapTradeClient.fetchHoldings(
      userId,
      userSecret,
      account.accountId
    );

    if (snapAccounts.length === 0) {
      const newAccount: Account = {
        id: account.accountId,
        householdId,
        accountId: account.accountId,
        source: "snaptrade",
        externalId: account.accountId,
        displayName: "SnapTrade Brokerage",
        currency: "USD",
        isActive: true,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await accountRepository.upsert(newAccount);
    }

    for (const pos of positions) {
      const holdingId = `${account.accountId}-${pos.symbol}`;
      const marketValue = pos.units * pos.price;
      const holding: Holding = {
        id: holdingId,
        householdId,
        holdingId,
        accountId: account.accountId,
        symbol: pos.symbol,
        description: pos.description,
        quantity: pos.units,
        price: pos.price,
        marketValue,
        currency: "USD",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await holdingRepository.upsert(holding);
      holdingCount++;
    }
  }

  await integrationRepository.upsertSyncState({
    id: "snaptrade",
    householdId,
    provider: "snaptrade",
    status: "success",
    lastSyncedAt: now,
    updatedAt: now,
    errorCount: 0,
  });

  await recomputeNetWorth(householdId);
  return { holdings: holdingCount };
}
