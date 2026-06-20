import {
  defaultTaxYear,
  normalizeHousehold,
  type FilingStatus,
  type Household,
  type HouseholdSettings,
  type Member,
  type Persona,
  type SaveMembersRequest,
} from "@portfolio/contracts";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { recomputeTaxProfile } from "./householdTaxService.js";

export interface SaveHouseholdBundleInput {
  displayName?: string;
  primaryState?: string;
  persona?: Persona;
  defaultTaxYear?: number;
  filingStatus?: FilingStatus;
  members?: Member[];
  settings?: Partial<HouseholdSettings>;
}

function membersToSavePayload(members: Member[]): SaveMembersRequest {
  return {
    members: members.map((m) => ({
      id: m.id,
      name: m.name.trim(),
      relationship: m.relationship,
      dateOfBirth: m.dateOfBirth,
      userId: m.userId,
      isActive: m.isActive,
      incomeSources: m.incomeSources ?? [],
      contributions: m.contributions ?? [],
    })),
  };
}

export async function saveHouseholdBundle(
  householdId: string,
  input: SaveHouseholdBundleInput
): Promise<{ household: Household; members: Member[] }> {
  const existing = await householdRepository.get(householdId);
  if (!existing) {
    throw new Error("Household not found");
  }

  const normalized = normalizeHousehold(existing);
  const taxYear = input.defaultTaxYear ?? defaultTaxYear(normalized);

  const householdUpdate: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    householdUpdate.displayName = input.displayName;
  }
  if (input.primaryState !== undefined) {
    householdUpdate.primaryState = input.primaryState.toUpperCase();
    householdUpdate.state = input.primaryState.toUpperCase();
  }
  if (input.persona !== undefined) {
    householdUpdate.persona = input.persona;
  }
  if (input.defaultTaxYear !== undefined || input.settings) {
    householdUpdate.settings = {
      ...normalized.settings,
      ...input.settings,
      ...(input.defaultTaxYear !== undefined
        ? { defaultTaxYear: input.defaultTaxYear }
        : {}),
    };
  }

  let household = normalized;
  if (Object.keys(householdUpdate).length > 0) {
    household = normalizeHousehold(
      await householdRepository.update(householdId, householdUpdate)
    );
  }

  let members: Member[];
  if (input.members) {
    members = await memberRepository.replaceAll(
      householdId,
      membersToSavePayload(input.members)
    );
  } else {
    members = await memberRepository.listByHousehold(householdId);
  }

  await recomputeTaxProfile(householdId, taxYear, {
    filingStatus: input.filingStatus,
  });

  return { household, members };
}
