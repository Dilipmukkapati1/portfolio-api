import { defaultTaxYear, normalizeHousehold } from "@portfolio/contracts";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { enrichHousehold, recomputeTaxProfile } from "./householdTaxService.js";

export async function ensureDefaultHousehold(householdId: string) {
  let household = await householdRepository.get(householdId);
  if (!household) {
    const year = new Date().getFullYear();
    household = await householdRepository.create(householdId, {
      displayName: "My Household",
      primaryState: "CA",
      state: "CA",
      persona: "w2_employee",
      settings: {
        currency: "USD",
        timezone: "America/New_York",
        defaultTaxYear: year,
        advisorAutoSave: true,
      },
    });
  }

  const members = await memberRepository.listByHousehold(householdId);
  if (members.length === 0) {
    await memberRepository.create(householdId, {
      name: "Primary earner",
      relationship: "self",
      isActive: true,
      incomeSources: [],
      contributions: [],
    });
    const normalized = normalizeHousehold(household);
    await recomputeTaxProfile(householdId, defaultTaxYear(normalized));
  }

  return enrichHousehold(household);
}
