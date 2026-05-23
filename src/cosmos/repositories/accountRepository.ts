import type { Account } from "@portfolio/contracts";
import { getContainer } from "../client.js";

const CONTAINER = "accounts";

export class AccountRepository {
  async listByHousehold(householdId: string): Promise<Account[]> {
    const container = getContainer(CONTAINER);
    const { resources } = await container.items
      .query<Account>({
        query: "SELECT * FROM c WHERE c.householdId = @hid",
        parameters: [{ name: "@hid", value: householdId }],
      })
      .fetchAll();
    return resources;
  }

  async upsert(account: Account): Promise<Account> {
    const container = getContainer(CONTAINER);
    const { resource } = await container.items.upsert(account);
    return resource as unknown as Account;
  }

  async findByExternalId(
    householdId: string,
    source: string,
    externalId: string
  ): Promise<Account | null> {
    const container = getContainer(CONTAINER);
    const { resources } = await container.items
      .query<Account>({
        query:
          "SELECT * FROM c WHERE c.householdId = @hid AND c.source = @src AND c.externalId = @eid",
        parameters: [
          { name: "@hid", value: householdId },
          { name: "@src", value: source },
          { name: "@eid", value: externalId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  }
}

export const accountRepository = new AccountRepository();
