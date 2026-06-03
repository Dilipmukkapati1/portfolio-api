import type { ExpensePlan } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class ExpensePlanRepository {
  async get(householdId: string): Promise<ExpensePlan | null> {
    const store = await getDataStore();
    return store.expensePlans.get(householdId);
  }

  async upsert(plan: ExpensePlan): Promise<ExpensePlan> {
    const store = await getDataStore();
    return store.expensePlans.upsert(plan);
  }

  async delete(householdId: string): Promise<boolean> {
    const store = await getDataStore();
    return store.expensePlans.delete(householdId);
  }
}

export const expensePlanRepository = new ExpensePlanRepository();
