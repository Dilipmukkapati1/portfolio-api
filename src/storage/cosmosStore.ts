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
  InvestmentPlan,
  ExpensePlan,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
} from "@portfolio/contracts";
import {
  expensePlanDocumentId,
  investmentPlanDocumentId,
  resolvePrimaryState,
  taxProfileDocumentId,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import { getContainerReady } from "../cosmos/bootstrap.js";
import { unavailableTransactions } from "./compositeStore.js";
import type { PortfolioStoreCore } from "./types.js";

export class CosmosPortfolioStore implements PortfolioStoreCore {
  readonly mode = "cosmos" as const;

  transactions = unavailableTransactions();

  household = {
    list: async (): Promise<Household[]> => {
      const { resources } = await (await getContainerReady("households"))
        .items.readAll<Household>()
        .fetchAll();
      return resources ?? [];
    },

    get: async (householdId: string): Promise<Household | null> => {
      const container = (await getContainerReady("households"));
      try {
        const { resource } = await container
          .item(householdId, householdId)
          .read<Household>();
        return resource ?? null;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },

    create: async (
      householdId: string,
      data: CreateHouseholdRequest
    ): Promise<Household> => {
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
      await (await getContainerReady("households")).items.create(doc);
      return doc;
    },

    update: async (
      householdId: string,
      data: UpdateHouseholdRequest
    ): Promise<Household> => {
      const existing = await cosmosPortfolioStore.household.get(householdId);
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
      await (await getContainerReady("households"))
        .item(householdId, householdId)
        .replace(updated);
      return updated;
    },

    delete: async (householdId: string): Promise<boolean> => {
      try {
        await cosmosPortfolioStore.members.deleteAllForHousehold(householdId);
        await cosmosPortfolioStore.taxProfiles.deleteAllForHousehold(householdId);
        await cosmosPortfolioStore.investmentPlans.delete(householdId);
        await cosmosPortfolioStore.expensePlans.delete(householdId);
        await (await getContainerReady("households"))
          .item(householdId, householdId)
          .delete();
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return false;
        throw err;
      }
    },

    updateNetWorthSummary: async (
      householdId: string,
      summary: Household["netWorthSummary"]
    ) => {
      const existing = await cosmosPortfolioStore.household.get(householdId);
      if (!existing) return;
      existing.netWorthSummary = summary;
      existing.updatedAt = new Date().toISOString();
      await (await getContainerReady("households"))
        .item(householdId, householdId)
        .replace(existing);
    },
  };

  members = {
    listByHousehold: async (householdId: string): Promise<Member[]> => {
      const { resources } = await (await getContainerReady("members"))
        .items.query<Member>({
          query: "SELECT * FROM c WHERE c.householdId = @hid",
          parameters: [{ name: "@hid", value: householdId }],
        })
        .fetchAll();
      return resources.sort((a, b) => a.name.localeCompare(b.name));
    },

    get: async (householdId: string, memberId: string): Promise<Member | null> => {
      try {
        const { resource } = await (await getContainerReady("members"))
          .item(memberId, householdId)
          .read<Member>();
        return resource ?? null;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },

    create: async (
      householdId: string,
      data: CreateMemberRequest
    ): Promise<Member> => {
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
      await (await getContainerReady("members")).items.create(doc);
      return doc;
    },

    update: async (
      householdId: string,
      memberId: string,
      data: UpdateMemberRequest
    ): Promise<Member> => {
      const existing = await cosmosPortfolioStore.members.get(
        householdId,
        memberId
      );
      if (!existing) throw new Error("Member not found");
      const updated: Member = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await (await getContainerReady("members"))
        .item(memberId, householdId)
        .replace(updated);
      return updated;
    },

    delete: async (householdId: string, memberId: string): Promise<boolean> => {
      try {
        await (await getContainerReady("members")).item(memberId, householdId).delete();
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return false;
        throw err;
      }
    },

    replaceAll: async (
      householdId: string,
      payload: SaveMembersRequest
    ): Promise<Member[]> => {
      const existing = await cosmosPortfolioStore.members.listByHousehold(
        householdId
      );
      for (const m of existing) {
        await cosmosPortfolioStore.members.delete(householdId, m.id);
      }
      const now = new Date().toISOString();
      const created: Member[] = [];
      for (const m of payload.members) {
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
        await (await getContainerReady("members")).items.create(doc);
        created.push(doc);
      }
      return created;
    },

    deleteAllForHousehold: async (householdId: string) => {
      const members = await cosmosPortfolioStore.members.listByHousehold(
        householdId
      );
      for (const m of members) {
        await (await getContainerReady("members")).item(m.id, householdId).delete();
      }
    },
  };

  taxProfiles = {
    get: async (householdId: string, taxYear: number): Promise<TaxProfile | null> => {
      const id = taxProfileDocumentId(householdId, taxYear);
      try {
        const { resource } = await (await getContainerReady("taxProfiles"))
          .item(id, householdId)
          .read<TaxProfile>();
        return resource ?? null;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },

    upsert: async (profile: TaxProfile): Promise<TaxProfile> => {
      const { resource } = await (await getContainerReady("taxProfiles")).items.upsert(profile);
      return resource as unknown as TaxProfile;
    },

    delete: async (householdId: string, taxYear: number): Promise<boolean> => {
      const id = taxProfileDocumentId(householdId, taxYear);
      try {
        await (await getContainerReady("taxProfiles")).item(id, householdId).delete();
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return false;
        throw err;
      }
    },

    deleteAllForHousehold: async (householdId: string) => {
      const { resources } = await (await getContainerReady("taxProfiles"))
        .items.query<TaxProfile>({
          query: "SELECT * FROM c WHERE c.householdId = @hid",
          parameters: [{ name: "@hid", value: householdId }],
        })
        .fetchAll();
      for (const p of resources) {
        await (await getContainerReady("taxProfiles")).item(p.id, householdId).delete();
      }
    },
  };

  investmentPlans = {
    get: async (householdId: string): Promise<InvestmentPlan | null> => {
      const id = investmentPlanDocumentId(householdId);
      try {
        const { resource } = await (await getContainerReady("investmentPlans"))
          .item(id, householdId)
          .read<InvestmentPlan>();
        return resource ?? null;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },

    upsert: async (plan: InvestmentPlan): Promise<InvestmentPlan> => {
      const { resource } = await (await getContainerReady("investmentPlans")).items.upsert(plan);
      return resource as unknown as InvestmentPlan;
    },

    delete: async (householdId: string): Promise<boolean> => {
      const id = investmentPlanDocumentId(householdId);
      try {
        await (await getContainerReady("investmentPlans")).item(id, householdId).delete();
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return false;
        throw err;
      }
    },
  };

  expensePlans = {
    get: async (householdId: string): Promise<ExpensePlan | null> => {
      const id = expensePlanDocumentId(householdId);
      try {
        const { resource } = await (await getContainerReady("expensePlans"))
          .item(id, householdId)
          .read<ExpensePlan>();
        return resource ?? null;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },

    upsert: async (plan: ExpensePlan): Promise<ExpensePlan> => {
      const { resource } = await (await getContainerReady("expensePlans")).items.upsert(plan);
      return resource as unknown as ExpensePlan;
    },

    delete: async (householdId: string): Promise<boolean> => {
      const id = expensePlanDocumentId(householdId);
      try {
        await (await getContainerReady("expensePlans")).item(id, householdId).delete();
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) return false;
        throw err;
      }
    },
  };

  accounts = {
    listByHousehold: async (householdId: string): Promise<Account[]> => {
      const { resources } = await (await getContainerReady("accounts"))
        .items.query<Account>({
          query: "SELECT * FROM c WHERE c.householdId = @hid",
          parameters: [{ name: "@hid", value: householdId }],
        })
        .fetchAll();
      return resources;
    },

    upsert: async (account: Account): Promise<Account> => {
      const { resource } = await (await getContainerReady("accounts")).items.upsert(account);
      return resource as unknown as Account;
    },

    findByExternalId: async (
      householdId: string,
      source: string,
      externalId: string
    ): Promise<Account | null> => {
      const { resources } = await (await getContainerReady("accounts"))
        .items.query<Account>({
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
    },
  };

  holdings = {
    listByHousehold: async (householdId: string): Promise<Holding[]> => {
      const { resources } = await (await getContainerReady("holdings"))
        .items.query<Holding>({
          query: "SELECT * FROM c WHERE c.householdId = @hid",
          parameters: [{ name: "@hid", value: householdId }],
        })
        .fetchAll();
      return resources;
    },

    upsert: async (holding: Holding): Promise<Holding> => {
      const { resource } = await (await getContainerReady("holdings")).items.upsert(holding);
      return resource as unknown as Holding;
    },

    delete: async (householdId: string, id: string): Promise<void> => {
      await (await getContainerReady("holdings")).item(id, householdId).delete();
    },
  };

  integrations = {
    getToken: async (householdId: string, provider: string) => {
      try {
        const { resource } = await (await getContainerReady("integrationTokens"))
          .item(provider, householdId)
          .read<IntegrationToken>();
        return resource ?? null;
      } catch {
        return null;
      }
    },

    upsertToken: async (token: IntegrationToken) => {
      await (await getContainerReady("integrationTokens")).items.upsert(token);
    },

    getSyncState: async (householdId: string, provider: string) => {
      try {
        const { resource } = await (await getContainerReady("syncState"))
          .item(provider, householdId)
          .read<SyncState>();
        return resource ?? null;
      } catch {
        return null;
      }
    },

    upsertSyncState: async (state: SyncState) => {
      await (await getContainerReady("syncState")).items.upsert(state);
    },

    recordWebhookEvent: async (
      householdId: string,
      eventId: string,
      payload: Record<string, unknown>
    ) => {
      try {
        await (await getContainerReady("webhookEvents")).items.create({
          id: eventId,
          householdId,
          eventId,
          payload,
          receivedAt: new Date().toISOString(),
        });
        return true;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 409) return false;
        throw err;
      }
    },
  };
}

export const cosmosPortfolioStore = new CosmosPortfolioStore();
