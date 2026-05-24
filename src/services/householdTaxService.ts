import {
  buildTaxProfileFromMembers,
  defaultTaxYear,
  legacyTaxProfileFromHousehold,
  normalizeHousehold,
  type Household,
  type Member,
  type TaxProfile,
  taxProfileDocumentId,
} from "@portfolio/contracts";
import { estimateFederalTax, loadRulePack } from "@portfolio/tax-engine";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { taxProfileRepository } from "../cosmos/repositories/taxProfileRepository.js";

export async function enrichHousehold(household: Household): Promise<Household> {
  const normalized = normalizeHousehold(household);
  const year = defaultTaxYear(normalized);
  let profile = await taxProfileRepository.get(normalized.householdId, year);
  if (!profile) {
    profile = legacyTaxProfileFromHousehold(normalized, year);
  }
  if (!profile) {
    return normalized;
  }
  return {
    ...normalized,
    filingStatus: profile.filingStatus,
    dependents: profile.dependentCount,
  };
}

export async function recomputeTaxProfile(
  householdId: string,
  taxYear: number,
  options?: { filingStatus?: TaxProfile["filingStatus"] }
): Promise<TaxProfile> {
  const household = await householdRepository.get(householdId);
  if (!household) {
    throw new Error("Household not found");
  }
  const members = await memberRepository.listByHousehold(householdId);
  const existing = await taxProfileRepository.get(householdId, taxYear);
  const rules = loadRulePack(2025);
  const profile = buildTaxProfileFromMembers(household, members, {
    taxYear,
    filingStatus: options?.filingStatus ?? existing?.filingStatus,
    existing,
    rules: {
      retirement401kLimit: rules.retirement401kLimit,
      hsaFamilyLimit: rules.hsaFamilyLimit,
      hsaSingleLimit: rules.hsaSingleLimit,
    },
  });
  const estimate = estimateFederalTax(profile.inputs, rules);
  profile.lastEstimate = estimate;
  profile.lastEstimatedAt = new Date().toISOString();
  return taxProfileRepository.upsert(profile);
}

export async function getOrCreateTaxProfile(
  householdId: string,
  taxYear: number
): Promise<TaxProfile | null> {
  const existing = await taxProfileRepository.get(householdId, taxYear);
  if (existing) return existing;

  const household = await householdRepository.get(householdId);
  if (!household) return null;

  const legacy = legacyTaxProfileFromHousehold(household, taxYear);
  if (legacy) {
    await taxProfileRepository.upsert(legacy);
    return legacy;
  }

  const members = await memberRepository.listByHousehold(householdId);
  if (members.length === 0) return null;

  return recomputeTaxProfile(householdId, taxYear);
}

export function taxProfileId(householdId: string, taxYear: number): string {
  return taxProfileDocumentId(householdId, taxYear);
}
