import type { Household, CreateHouseholdRequest, UpdateHouseholdRequest } from "@portfolio/contracts";
import { getContainer } from "../client.js";

const CONTAINER = "households";

export class HouseholdRepository {
  async get(householdId: string): Promise<Household | null> {
    const container = getContainer(CONTAINER);
    try {
      const { resource } = await container
        .item(householdId, householdId)
        .read<Household>();
      return resource ?? null;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async create(
    householdId: string,
    data: CreateHouseholdRequest
  ): Promise<Household> {
    const now = new Date().toISOString();
    const doc: Household = {
      id: householdId,
      householdId,
      displayName: data.displayName,
      state: data.state,
      filingStatus: data.filingStatus,
      dependents: data.dependents ?? 0,
      persona: data.persona,
      createdAt: now,
      updatedAt: now,
    };
    const container = getContainer(CONTAINER);
    await container.items.create(doc);
    return doc;
  }

  async update(
    householdId: string,
    data: UpdateHouseholdRequest
  ): Promise<Household> {
    const existing = await this.get(householdId);
    if (!existing) {
      throw new Error("Household not found");
    }
    const updated: Household = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const container = getContainer(CONTAINER);
    await container.item(householdId, householdId).replace(updated);
    return updated;
  }

  async updateNetWorthSummary(
    householdId: string,
    summary: Household["netWorthSummary"]
  ): Promise<void> {
    const existing = await this.get(householdId);
    if (!existing) return;
    existing.netWorthSummary = summary;
    existing.updatedAt = new Date().toISOString();
    const container = getContainer(CONTAINER);
    await container.item(householdId, householdId).replace(existing);
  }
}

export const householdRepository = new HouseholdRepository();
