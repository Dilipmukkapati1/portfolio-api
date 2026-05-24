import type { Transaction, TransactionFilter } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class TransactionRepository {
  async list(
    householdId: string,
    filter: TransactionFilter = { limit: 100 }
  ): Promise<Transaction[]> {
    const store = await getDataStore();
    return store.transactions.list(householdId, filter);
  }

  async upsert(txn: Transaction): Promise<Transaction> {
    const store = await getDataStore();
    return store.transactions.upsert(txn);
  }

  async get(householdId: string, txnId: string): Promise<Transaction | null> {
    const store = await getDataStore();
    return store.transactions.get(householdId, txnId);
  }

  async replace(txn: Transaction): Promise<Transaction> {
    const store = await getDataStore();
    return store.transactions.replace(txn);
  }
}

export const transactionRepository = new TransactionRepository();
