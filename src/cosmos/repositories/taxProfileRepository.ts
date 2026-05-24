import type { TaxProfile, UpsertTaxProfileRequest } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class TaxProfileRepository {
  async get(householdId: string, taxYear: number): Promise<TaxProfile | null> {
    const store = await getDataStore();
    return store.taxProfiles.get(householdId, taxYear);
  }

  async upsert(profile: TaxProfile): Promise<TaxProfile> {
    const store = await getDataStore();
    return store.taxProfiles.upsert(profile);
  }

  async delete(householdId: string, taxYear: number): Promise<boolean> {
    const store = await getDataStore();
    return store.taxProfiles.delete(householdId, taxYear);
  }
}

export const taxProfileRepository = new TaxProfileRepository();
