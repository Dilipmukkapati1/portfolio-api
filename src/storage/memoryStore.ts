import type {
  Account,
  CreateHouseholdRequest,
  CreateMemberRequest,
  Holding,
  Household,
  IntegrationToken,
  Member,
  SaveMembersRequest,
  SyncState,
  TaxProfile,
  Transaction,
  TransactionFilter,
  TransactionListResponse,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
} from "@portfolio/contracts";
import { resolvePrimaryState, taxProfileDocumentId } from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "../lib/transactionCursor.js";
import type { PortfolioStoreCore } from "./types.js";

export interface MemoryStoreSnapshot {
  households: Household[];
  memberData: Record<string, Member[]>;
  taxProfileData: Record<string, TaxProfile[]>;
  accountData: Record<string, Account[]>;
  transactionData: Record<string, Transaction[]>;
  holdingData: Record<string, Holding[]>;
  integrationTokens: Record<string, IntegrationToken[]>;
  syncState: Record<string, SyncState[]>;
  webhookEvents: Array<{ key: string; householdId: string; eventId: string }>;
}

function partitionMap<T extends { householdId: string; id: string }>() {
  return new Map<string, Map<string, T>>();
}

function getPartition<T extends { householdId: string; id: string }>(
  root: Map<string, Map<string, T>>,
  householdId: string
): Map<string, T> {
  let part = root.get(householdId);
  if (!part) {
    part = new Map();
    root.set(householdId, part);
  }
  return part;
}

export class MemoryPortfolioStore implements PortfolioStoreCore {
  readonly mode = "memory" as const;

  private households = new Map<string, Household>();
  private memberData = partitionMap<Member>();
  private taxProfileData = partitionMap<TaxProfile>();
  private accountData = partitionMap<Account>();
  private transactionData = partitionMap<Transaction>();
  private holdingData = partitionMap<Holding>();
  private integrationTokens = partitionMap<IntegrationToken>();
  private syncState = partitionMap<SyncState>();
  private webhookEvents = new Map<string, { householdId: string; eventId: string }>();

  household = {
    list: async () => [...this.households.values()],

    get: async (householdId: string) =>
      this.households.get(householdId) ?? null,

    create: async (householdId: string, data: CreateHouseholdRequest) => {
      const now = new Date().toISOString();
      const primaryState = resolvePrimaryState(data);
      const doc: Household = {
        id: householdId,
        householdId,
        displayName: data.displayName,
        primaryState,
        state: primaryState,
        persona: data.persona,
        settings: data.settings,
        createdAt: now,
        updatedAt: now,
      };
      this.households.set(householdId, doc);
      return doc;
    },

    update: async (householdId: string, data: UpdateHouseholdRequest) => {
      const existing = this.households.get(householdId);
      if (!existing) throw new Error("Household not found");
      const primaryState =
        data.primaryState || data.state
          ? resolvePrimaryState({
              primaryState: data.primaryState,
              state: data.state ?? existing.state,
            })
          : existing.primaryState ?? existing.state;
      const updated: Household = {
        ...existing,
        ...data,
        primaryState,
        state: primaryState,
        updatedAt: new Date().toISOString(),
      };
      this.households.set(householdId, updated);
      return updated;
    },

    delete: async (householdId: string) => {
      if (!this.households.has(householdId)) return false;
      this.households.delete(householdId);
      this.memberData.delete(householdId);
      this.taxProfileData.delete(householdId);
      this.accountData.delete(householdId);
      this.transactionData.delete(householdId);
      this.holdingData.delete(householdId);
      this.integrationTokens.delete(householdId);
      this.syncState.delete(householdId);
      for (const key of [...this.webhookEvents.keys()]) {
        if (key.startsWith(`${householdId}:`)) {
          this.webhookEvents.delete(key);
        }
      }
      return true;
    },

    updateNetWorthSummary: async (
      householdId: string,
      summary: Household["netWorthSummary"]
    ) => {
      const existing = this.households.get(householdId);
      if (!existing) return;
      existing.netWorthSummary = summary;
      existing.updatedAt = new Date().toISOString();
    },
  };

  members = {
    listByHousehold: async (householdId: string) =>
      [...getPartition(this.memberData, householdId).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),

    get: async (householdId: string, memberId: string) =>
      getPartition(this.memberData, householdId).get(memberId) ?? null,

    create: async (householdId: string, data: CreateMemberRequest) => {
      const now = new Date().toISOString();
      const doc: Member = {
        id: randomUUID(),
        householdId,
        name: data.name,
        relationship: data.relationship,
        dateOfBirth: data.dateOfBirth,
        userId: data.userId,
        isActive: data.isActive ?? true,
        incomeSources: data.incomeSources ?? [],
        contributions: data.contributions ?? [],
        createdAt: now,
        updatedAt: now,
      };
      getPartition(this.memberData, householdId).set(doc.id, doc);
      return doc;
    },

    update: async (
      householdId: string,
      memberId: string,
      data: UpdateMemberRequest
    ) => {
      const existing = getPartition(this.memberData, householdId).get(memberId);
      if (!existing) throw new Error("Member not found");
      const updated: Member = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      getPartition(this.memberData, householdId).set(memberId, updated);
      return updated;
    },

    delete: async (householdId: string, memberId: string) => {
      const part = getPartition(this.memberData, householdId);
      if (!part.has(memberId)) return false;
      part.delete(memberId);
      return true;
    },

    replaceAll: async (householdId: string, payload: SaveMembersRequest) => {
      const part = getPartition(this.memberData, householdId);
      part.clear();
      const now = new Date().toISOString();
      const members: Member[] = payload.members.map((m) => {
        const doc: Member = {
          id: m.id ?? randomUUID(),
          householdId,
          name: m.name,
          relationship: m.relationship,
          dateOfBirth: m.dateOfBirth,
          userId: m.userId,
          isActive: m.isActive ?? true,
          incomeSources: m.incomeSources ?? [],
          contributions: m.contributions ?? [],
          createdAt: now,
          updatedAt: now,
        };
        part.set(doc.id, doc);
        return doc;
      });
      return members;
    },

    deleteAllForHousehold: async (householdId: string) => {
      this.memberData.delete(householdId);
    },
  };

  taxProfiles = {
    get: async (householdId: string, taxYear: number) => {
      const id = taxProfileDocumentId(householdId, taxYear);
      return getPartition(this.taxProfileData, householdId).get(id) ?? null;
    },

    upsert: async (profile: TaxProfile) => {
      getPartition(this.taxProfileData, profile.householdId).set(
        profile.id,
        profile
      );
      return profile;
    },

    delete: async (householdId: string, taxYear: number) => {
      const id = taxProfileDocumentId(householdId, taxYear);
      const part = getPartition(this.taxProfileData, householdId);
      if (!part.has(id)) return false;
      part.delete(id);
      return true;
    },

    deleteAllForHousehold: async (householdId: string) => {
      this.taxProfileData.delete(householdId);
    },
  };

  accounts = {
    listByHousehold: async (householdId: string) =>
      [...getPartition(this.accountData, householdId).values()],

    upsert: async (account: Account) => {
      getPartition(this.accountData, account.householdId).set(account.id, account);
      return account;
    },

    findByExternalId: async (
      householdId: string,
      source: string,
      externalId: string
    ) => {
      for (const account of getPartition(this.accountData, householdId).values()) {
        if (account.source === source && account.externalId === externalId) {
          return account;
        }
      }
      return null;
    },
  };

  transactions = {
    list: async (
      householdId: string,
      filter: TransactionFilter = { limit: 100 }
    ): Promise<TransactionListResponse> => {
      const limit = filter.limit ?? 100;
      const cursor = filter.cursor
        ? decodeTransactionCursor(filter.cursor)
        : null;
      if (filter.cursor && !cursor) {
        throw new Error("Invalid cursor");
      }

      let rows = [...getPartition(this.transactionData, householdId).values()];
      if (filter.accountId) {
        rows = rows.filter((t) => t.accountId === filter.accountId);
      }
      if (filter.category) {
        rows = rows.filter((t) => t.category === filter.category);
      }
      if (filter.source) {
        rows = rows.filter((t) => t.source === filter.source);
      }
      if (filter.pending !== undefined) {
        rows = rows.filter((t) => t.pending === filter.pending);
      }
      if (filter.startDate) {
        rows = rows.filter((t) => t.date >= filter.startDate!);
      }
      if (filter.endDate) {
        rows = rows.filter((t) => t.date <= filter.endDate!);
      }
      if (cursor) {
        rows = rows.filter(
          (t) =>
            t.date < cursor.date ||
            (t.date === cursor.date && t.id < cursor.id)
        );
      }
      rows.sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });

      const hasMore = rows.length > limit;
      const transactions = hasMore ? rows.slice(0, limit) : rows;
      const last = transactions[transactions.length - 1];

      return {
        transactions,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeTransactionCursor({ date: last.date, id: last.id })
            : undefined,
      };
    },

    upsert: async (txn: Transaction) => {
      getPartition(this.transactionData, txn.householdId).set(txn.id, txn);
      return txn;
    },

    get: async (householdId: string, txnId: string) => {
      const byTxn = [...getPartition(this.transactionData, householdId).values()];
      return byTxn.find((t) => t.txnId === txnId || t.id === txnId) ?? null;
    },

    replace: async (txn: Transaction) => {
      getPartition(this.transactionData, txn.householdId).set(txn.id, txn);
      return txn;
    },

    deleteAllForHousehold: async (householdId: string) => {
      this.transactionData.delete(householdId);
    },
  };

  holdings = {
    listByHousehold: async (householdId: string) =>
      [...getPartition(this.holdingData, householdId).values()],

    upsert: async (holding: Holding) => {
      getPartition(this.holdingData, holding.householdId).set(holding.id, holding);
      return holding;
    },

    delete: async (householdId: string, id: string) => {
      getPartition(this.holdingData, householdId).delete(id);
    },
  };

  integrations = {
    getToken: async (householdId: string, provider: string) =>
      getPartition(this.integrationTokens, householdId).get(provider) ?? null,

    upsertToken: async (token: IntegrationToken) => {
      getPartition(this.integrationTokens, token.householdId).set(
        token.id,
        token
      );
    },

    getSyncState: async (householdId: string, provider: string) =>
      getPartition(this.syncState, householdId).get(provider) ?? null,

    upsertSyncState: async (state: SyncState) => {
      getPartition(this.syncState, state.householdId).set(state.id, state);
    },

    recordWebhookEvent: async (
      householdId: string,
      eventId: string,
      _payload: Record<string, unknown>
    ) => {
      const key = `${householdId}:${eventId}`;
      if (this.webhookEvents.has(key)) return false;
      this.webhookEvents.set(key, { householdId, eventId });
      return true;
    },
  };

  toSnapshot(): MemoryStoreSnapshot {
    return {
      households: [...this.households.values()],
      memberData: partitionMapToArrays(this.memberData),
      taxProfileData: partitionMapToArrays(this.taxProfileData),
      accountData: partitionMapToArrays(this.accountData),
      transactionData: partitionMapToArrays(this.transactionData),
      holdingData: partitionMapToArrays(this.holdingData),
      integrationTokens: partitionMapToArrays(this.integrationTokens),
      syncState: partitionMapToArrays(this.syncState),
      webhookEvents: [...this.webhookEvents.entries()].map(([key, value]) => ({
        key,
        ...value,
      })),
    };
  }

  loadSnapshot(snapshot: MemoryStoreSnapshot): void {
    this.households = new Map(snapshot.households.map((h) => [h.householdId, h]));
    this.memberData = arraysToPartitionMap(snapshot.memberData);
    this.taxProfileData = arraysToPartitionMap(snapshot.taxProfileData);
    this.accountData = arraysToPartitionMap(snapshot.accountData);
    this.transactionData = arraysToPartitionMap(snapshot.transactionData ?? {});
    this.holdingData = arraysToPartitionMap(snapshot.holdingData);
    this.integrationTokens = arraysToPartitionMap(snapshot.integrationTokens);
    this.syncState = arraysToPartitionMap(snapshot.syncState);
    this.webhookEvents = new Map(
      snapshot.webhookEvents.map(({ key, householdId, eventId }) => [
        key,
        { householdId, eventId },
      ])
    );
  }
}

function partitionMapToArrays<T extends { id: string }>(
  root: Map<string, Map<string, T>>
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [householdId, part] of root) {
    out[householdId] = [...part.values()];
  }
  return out;
}

function arraysToPartitionMap<T extends { id: string }>(
  data: Record<string, T[]>
): Map<string, Map<string, T>> {
  const root = new Map<string, Map<string, T>>();
  for (const [householdId, items] of Object.entries(data)) {
    const part = new Map<string, T>();
    for (const item of items) {
      part.set(item.id, item);
    }
    root.set(householdId, part);
  }
  return root;
}
