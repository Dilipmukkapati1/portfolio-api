import type { Account } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class AccountRepository {
  async listByHousehold(householdId: string): Promise<Account[]> {
    const store = await getDataStore();
    return store.accounts.listByHousehold(householdId);
  }

  async upsert(account: Account): Promise<Account> {
    const store = await getDataStore();
    return store.accounts.upsert(account);
  }

  async findByExternalId(
    householdId: string,
    source: string,
    externalId: string
  ): Promise<Account | null> {
    const store = await getDataStore();
    return store.accounts.findByExternalId(householdId, source, externalId);
  }
}

export const accountRepository = new AccountRepository();
