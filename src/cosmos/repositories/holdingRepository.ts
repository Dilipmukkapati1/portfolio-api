import type { Holding } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class HoldingRepository {
  async listByHousehold(householdId: string): Promise<Holding[]> {
    const store = await getDataStore();
    return store.holdings.listByHousehold(householdId);
  }

  async upsert(holding: Holding): Promise<Holding> {
    const store = await getDataStore();
    return store.holdings.upsert(holding);
  }

  async delete(householdId: string, id: string): Promise<void> {
    const store = await getDataStore();
    await store.holdings.delete(householdId, id);
  }
}

export const holdingRepository = new HoldingRepository();
