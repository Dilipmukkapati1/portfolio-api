import type { PortfolioStoreCore } from "./types.js";
import type { SqlTransactionStore } from "../sql/transactionStore.js";

export class SqlUnavailableError extends Error {
  constructor() {
    super(
      "Azure SQL is not configured or unavailable. Start local SQL (npm run dev:deps && npm run db:migrate) or set AZURE_SQL_* env vars."
    );
    this.name = "SqlUnavailableError";
  }
}

function unavailableTransactions(): PortfolioStoreCore["transactions"] {
  const fail = async (): Promise<never> => {
    throw new SqlUnavailableError();
  };
  return {
    list: fail,
    upsert: fail,
    get: fail,
    replace: fail,
    deleteAllForHousehold: fail,
  };
}

export function createCompositeStore(
  core: PortfolioStoreCore,
  transactions: PortfolioStoreCore["transactions"]
): PortfolioStoreCore {
  return {
    mode: core.mode,
    household: {
      ...core.household,
      delete: async (householdId: string) => {
        await transactions.deleteAllForHousehold(householdId);
        return core.household.delete(householdId);
      },
    },
    members: core.members,
    taxProfiles: core.taxProfiles,
    accounts: core.accounts,
    transactions,
    holdings: core.holdings,
    integrations: core.integrations,
  };
}

export function createCompositeStoreWithSql(
  core: PortfolioStoreCore,
  sqlStore: SqlTransactionStore
): PortfolioStoreCore {
  return createCompositeStore(core, {
    list: (householdId, filter) => sqlStore.list(householdId, filter),
    upsert: (txn) => sqlStore.upsert(txn),
    get: (householdId, txnId) => sqlStore.get(householdId, txnId),
    replace: (txn) => sqlStore.replace(txn),
    deleteAllForHousehold: (householdId) =>
      sqlStore.deleteAllForHousehold(householdId),
  });
}

export { unavailableTransactions };
