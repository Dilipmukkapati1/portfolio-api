import type { Transaction, TransactionFilter } from "@portfolio/contracts";
import { getContainer } from "../client.js";

const CONTAINER = "transactions";

export class TransactionRepository {
  async list(
    householdId: string,
    filter: TransactionFilter = { limit: 100 }
  ): Promise<Transaction[]> {
    const container = getContainer(CONTAINER);
    let query = "SELECT * FROM c WHERE c.householdId = @hid";
    const parameters: { name: string; value: string | number }[] = [
      { name: "@hid", value: householdId },
    ];

    if (filter.accountId) {
      query += " AND c.accountId = @aid";
      parameters.push({ name: "@aid", value: filter.accountId });
    }
    if (filter.category) {
      query += " AND c.category = @cat";
      parameters.push({ name: "@cat", value: filter.category });
    }
    if (filter.startDate) {
      query += " AND c.date >= @start";
      parameters.push({ name: "@start", value: filter.startDate });
    }
    if (filter.endDate) {
      query += " AND c.date <= @end";
      parameters.push({ name: "@end", value: filter.endDate });
    }
    query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit";
    parameters.push({ name: "@limit", value: filter.limit ?? 100 });

    const { resources } = await container.items
      .query<Transaction>({ query, parameters })
      .fetchAll();
    return resources;
  }

  async upsert(txn: Transaction): Promise<Transaction> {
    const container = getContainer(CONTAINER);
    const { resource } = await container.items.upsert(txn);
    return resource as unknown as Transaction;
  }
}

export const transactionRepository = new TransactionRepository();
