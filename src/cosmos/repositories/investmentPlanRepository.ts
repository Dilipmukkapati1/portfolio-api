import type { InvestmentPlan } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class InvestmentPlanRepository {
  async get(householdId: string): Promise<InvestmentPlan | null> {
    const store = await getDataStore();
    return store.investmentPlans.get(householdId);
  }

  async upsert(plan: InvestmentPlan): Promise<InvestmentPlan> {
    const store = await getDataStore();
    return store.investmentPlans.upsert(plan);
  }

  async delete(householdId: string): Promise<boolean> {
    const store = await getDataStore();
    return store.investmentPlans.delete(householdId);
  }
}

export const investmentPlanRepository = new InvestmentPlanRepository();
