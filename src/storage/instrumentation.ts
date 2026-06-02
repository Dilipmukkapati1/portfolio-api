import { logStorageAccess } from "./log.js";
import type { StorageSourceMap } from "./layout.js";
import type { PortfolioDataStore, PortfolioStoreCore } from "./types.js";

type AsyncFn = (...args: never[]) => Promise<unknown>;

function wrapRead<T extends AsyncFn>(
  entity: string,
  source: string,
  fn: T,
  metaFromArgs?: (...args: Parameters<T>) => Record<string, unknown>
): T {
  return (async (...args: Parameters<T>) => {
    logStorageAccess("read", entity, source, metaFromArgs?.(...args));
    return fn(...args);
  }) as T;
}

function wrapWrite<T extends AsyncFn>(
  entity: string,
  source: string,
  fn: T,
  metaFromArgs?: (...args: Parameters<T>) => Record<string, unknown>
): T {
  return (async (...args: Parameters<T>) => {
    logStorageAccess("write", entity, source, metaFromArgs?.(...args));
    return fn(...args);
  }) as T;
}

export function instrumentPortfolioStore(
  store: PortfolioStoreCore,
  sources: StorageSourceMap
): PortfolioDataStore {
  const e = sources.entities;

  return {
    mode: store.mode,
    sources,
    household: {
      list: wrapRead("households", e.households, store.household.list.bind(store.household)),
      get: wrapRead(
        "households",
        e.households,
        store.household.get.bind(store.household),
        (householdId) => ({ householdId })
      ),
      create: wrapWrite(
        "households",
        e.households,
        store.household.create.bind(store.household),
        (householdId) => ({ householdId })
      ),
      update: wrapWrite(
        "households",
        e.households,
        store.household.update.bind(store.household),
        (householdId) => ({ householdId })
      ),
      delete: wrapWrite(
        "households",
        e.households,
        store.household.delete.bind(store.household),
        (householdId) => ({ householdId })
      ),
      updateNetWorthSummary: wrapWrite(
        "households",
        e.households,
        store.household.updateNetWorthSummary.bind(store.household),
        (householdId) => ({ householdId })
      ),
    },
    members: {
      listByHousehold: wrapRead(
        "members",
        e.members,
        store.members.listByHousehold.bind(store.members),
        (householdId) => ({ householdId })
      ),
      get: wrapRead(
        "members",
        e.members,
        store.members.get.bind(store.members),
        (_householdId, memberId) => ({ memberId })
      ),
      create: wrapWrite(
        "members",
        e.members,
        store.members.create.bind(store.members),
        (householdId) => ({ householdId })
      ),
      update: wrapWrite(
        "members",
        e.members,
        store.members.update.bind(store.members),
        (_householdId, memberId) => ({ memberId })
      ),
      delete: wrapWrite(
        "members",
        e.members,
        store.members.delete.bind(store.members),
        (_householdId, memberId) => ({ memberId })
      ),
      replaceAll: wrapWrite(
        "members",
        e.members,
        store.members.replaceAll.bind(store.members),
        (householdId) => ({ householdId })
      ),
      deleteAllForHousehold: wrapWrite(
        "members",
        e.members,
        store.members.deleteAllForHousehold.bind(store.members),
        (householdId) => ({ householdId })
      ),
    },
    taxProfiles: {
      get: wrapRead(
        "taxProfiles",
        e.taxProfiles,
        store.taxProfiles.get.bind(store.taxProfiles),
        (householdId, taxYear) => ({ householdId, taxYear })
      ),
      upsert: wrapWrite("taxProfiles", e.taxProfiles, store.taxProfiles.upsert.bind(store.taxProfiles)),
      delete: wrapWrite(
        "taxProfiles",
        e.taxProfiles,
        store.taxProfiles.delete.bind(store.taxProfiles),
        (householdId, taxYear) => ({ householdId, taxYear })
      ),
      deleteAllForHousehold: wrapWrite(
        "taxProfiles",
        e.taxProfiles,
        store.taxProfiles.deleteAllForHousehold.bind(store.taxProfiles),
        (householdId) => ({ householdId })
      ),
    },
    investmentPlans: {
      get: wrapRead(
        "investmentPlans",
        e.investmentPlans,
        store.investmentPlans.get.bind(store.investmentPlans),
        (householdId) => ({ householdId })
      ),
      upsert: wrapWrite(
        "investmentPlans",
        e.investmentPlans,
        store.investmentPlans.upsert.bind(store.investmentPlans)
      ),
      delete: wrapWrite(
        "investmentPlans",
        e.investmentPlans,
        store.investmentPlans.delete.bind(store.investmentPlans),
        (householdId) => ({ householdId })
      ),
    },
    accounts: {
      listByHousehold: wrapRead(
        "accounts",
        e.accounts,
        store.accounts.listByHousehold.bind(store.accounts),
        (householdId) => ({ householdId })
      ),
      upsert: wrapWrite("accounts", e.accounts, store.accounts.upsert.bind(store.accounts)),
      findByExternalId: wrapRead(
        "accounts",
        e.accounts,
        store.accounts.findByExternalId.bind(store.accounts),
        (householdId, source, externalId) => ({ householdId, source, externalId })
      ),
    },
    transactions: {
      list: wrapRead(
        "transactions",
        e.transactions,
        store.transactions.list.bind(store.transactions),
        (householdId, filter) => ({
          householdId,
          limit: filter?.limit,
          accountId: filter?.accountId,
          source: filter?.source,
        })
      ),
      upsert: wrapWrite(
        "transactions",
        e.transactions,
        store.transactions.upsert.bind(store.transactions)
      ),
      get: wrapRead(
        "transactions",
        e.transactions,
        store.transactions.get.bind(store.transactions),
        (householdId, txnId) => ({ householdId, txnId })
      ),
      replace: wrapWrite(
        "transactions",
        e.transactions,
        store.transactions.replace.bind(store.transactions)
      ),
      deleteAllForHousehold: wrapWrite(
        "transactions",
        e.transactions,
        store.transactions.deleteAllForHousehold.bind(store.transactions),
        (householdId) => ({ householdId })
      ),
    },
    holdings: {
      listByHousehold: wrapRead(
        "holdings",
        e.holdings,
        store.holdings.listByHousehold.bind(store.holdings),
        (householdId) => ({ householdId })
      ),
      upsert: wrapWrite("holdings", e.holdings, store.holdings.upsert.bind(store.holdings)),
      delete: wrapWrite(
        "holdings",
        e.holdings,
        store.holdings.delete.bind(store.holdings),
        (householdId, id) => ({ householdId, id })
      ),
    },
    integrations: {
      getToken: wrapRead(
        "integrationTokens",
        e.integrationTokens,
        store.integrations.getToken.bind(store.integrations),
        (householdId, provider) => ({ householdId, provider })
      ),
      upsertToken: wrapWrite(
        "integrationTokens",
        e.integrationTokens,
        store.integrations.upsertToken.bind(store.integrations)
      ),
      getSyncState: wrapRead(
        "syncState",
        e.syncState,
        store.integrations.getSyncState.bind(store.integrations),
        (householdId, provider) => ({ householdId, provider })
      ),
      upsertSyncState: wrapWrite(
        "syncState",
        e.syncState,
        store.integrations.upsertSyncState.bind(store.integrations)
      ),
      recordWebhookEvent: wrapWrite(
        "webhookEvents",
        e.webhookEvents,
        store.integrations.recordWebhookEvent.bind(store.integrations),
        (householdId, eventId) => ({ householdId, eventId })
      ),
    },
  };
}
