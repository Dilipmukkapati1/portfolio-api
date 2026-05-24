import type {
  CreateHouseholdRequest,
  Household,
  UpdateHouseholdRequest,
} from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class HouseholdRepository {
  async list(): Promise<Household[]> {
    const store = await getDataStore();
    const households = await store.household.list();
    return households.sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }

  async get(householdId: string): Promise<Household | null> {
    const store = await getDataStore();
    return store.household.get(householdId);
  }

  async create(
    householdId: string,
    data: CreateHouseholdRequest
  ): Promise<Household> {
    const store = await getDataStore();
    return store.household.create(householdId, data);
  }

  async update(
    householdId: string,
    data: UpdateHouseholdRequest
  ): Promise<Household> {
    const store = await getDataStore();
    return store.household.update(householdId, data);
  }

  async delete(householdId: string): Promise<boolean> {
    const store = await getDataStore();
    return store.household.delete(householdId);
  }

  async deleteMany(householdIds: string[]): Promise<{
    deleted: string[];
    failed: Array<{ householdId: string; reason: string }>;
  }> {
    const deleted: string[] = [];
    const failed: Array<{ householdId: string; reason: string }> = [];

    for (const householdId of householdIds) {
      try {
        const ok = await this.delete(householdId);
        if (ok) deleted.push(householdId);
        else failed.push({ householdId, reason: "Household not found" });
      } catch (err) {
        failed.push({
          householdId,
          reason: err instanceof Error ? err.message : "Delete failed",
        });
      }
    }

    return { deleted, failed };
  }

  async updateNetWorthSummary(
    householdId: string,
    summary: Household["netWorthSummary"]
  ): Promise<void> {
    const store = await getDataStore();
    return store.household.updateNetWorthSummary(householdId, summary);
  }
}

export const householdRepository = new HouseholdRepository();
