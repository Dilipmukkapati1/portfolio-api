import {
  countDependents,
  defaultTaxYear,
  enrichPatchWithInferredMembers,
  inferLiquidCashFromMessage,
  inferMemberPatchesFromMessage,
  mergeMemberPatches,
  normalizeHousehold,
  parseHouseholdAutoSavePatch,
  type AdvisorAutoSaveResult,
  type FilingStatus,
  type Household,
  type HouseholdAutoSavePatch,
  type Member,
} from "@portfolio/contracts";
import { loadRulePack } from "@portfolio/tax-engine";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { taxProfileRepository } from "../cosmos/repositories/taxProfileRepository.js";
import {
  OpenRouterNotConfiguredError,
  openRouterExtractJson,
} from "../lib/openrouter.js";
import {
  buildHouseholdExtractionSystemPrompt,
  buildHouseholdExtractionUserMessage,
} from "./householdExtractionPrompt.js";
import { ensureDefaultHousehold } from "./ensureDefaultHousehold.js";
import { saveHouseholdBundle } from "./householdWriteService.js";

const PROFILE_SIGNAL =
  /\b(moved to|live in|state|salary|wage|income|earn|make \$|contribute|401\s*\(?k|403\s*\(?b|hsa|ira|roth|filing|married|single|dependent|child|kid|baby|spouse|persona|household|maxed|max out|display name|tax year|bonus|dcfsa|dependent care|employer match|liquid cash|cash income)\b/i;

const US_STATE_NAMES =
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

export function shouldAttemptExtraction(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 8) return false;
  if (PROFILE_SIGNAL.test(trimmed)) return true;
  if (US_STATE_NAMES.test(trimmed)) return true;
  if (/\b[A-Z]{2}\b/.test(trimmed) && /\b(in|to|from)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function buildCompactSnapshot(
  household: Household,
  members: Member[],
  filingStatus?: FilingStatus
): Record<string, unknown> {
  const normalized = normalizeHousehold(household);
  return {
    displayName: normalized.displayName,
    primaryState: normalized.primaryState ?? normalized.state,
    persona: normalized.persona,
    defaultTaxYear: defaultTaxYear(normalized),
    filingStatus,
    liquidCashSnapshot: normalized.liquidCashSnapshot,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      relationship: m.relationship,
      isActive: m.isActive,
      incomeSources: (m.incomeSources ?? []).map((i) => ({
        type: i.type,
        amount: i.amount,
      })),
      contributions: (m.contributions ?? []).map((c) => ({
        type: c.type,
        amount: c.amount,
      })),
    })),
  };
}

function patchHasUpdates(patch: HouseholdAutoSavePatch): boolean {
  if (patch.displayName != null) return true;
  if (patch.primaryState != null) return true;
  if (patch.persona != null) return true;
  if (patch.filingStatus != null) return true;
  if (patch.defaultTaxYear != null) return true;
  if (patch.liquidCashSnapshot != null) return true;
  if (patch.members && patch.members.length > 0) return true;
  return false;
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return value.toLocaleString("en-US");
  return String(value);
}

function diffPatchChanges(
  before: {
    household: Household;
    members: Member[];
    filingStatus?: FilingStatus;
  },
  after: {
    household: Household;
    members: Member[];
    filingStatus?: FilingStatus;
  },
  patch: HouseholdAutoSavePatch
): AdvisorAutoSaveResult["changes"] {
  const changes: AdvisorAutoSaveResult["changes"] = [];
  const b = normalizeHousehold(before.household);
  const a = normalizeHousehold(after.household);

  if (patch.displayName != null && b.displayName !== a.displayName) {
    changes.push({
      field: "displayName",
      label: "Display name",
      before: b.displayName,
      after: a.displayName,
    });
  }
  if (patch.primaryState != null) {
    const beforeState = b.primaryState ?? b.state;
    const afterState = a.primaryState ?? a.state;
    if (beforeState !== afterState) {
      changes.push({
        field: "primaryState",
        label: "State",
        before: beforeState,
        after: afterState,
      });
    }
  }
  if (patch.persona != null && b.persona !== a.persona) {
    changes.push({
      field: "persona",
      label: "Persona",
      before: b.persona,
      after: a.persona,
    });
  }
  if (patch.filingStatus != null && before.filingStatus !== after.filingStatus) {
    changes.push({
      field: "filingStatus",
      label: "Filing status",
      before: formatValue(before.filingStatus),
      after: formatValue(after.filingStatus),
    });
  }
  if (
    patch.defaultTaxYear != null &&
    defaultTaxYear(b) !== defaultTaxYear(a)
  ) {
    changes.push({
      field: "defaultTaxYear",
      label: "Tax year",
      before: String(defaultTaxYear(b)),
      after: String(defaultTaxYear(a)),
    });
  }
  if (
    patch.liquidCashSnapshot != null &&
    b.liquidCashSnapshot !== a.liquidCashSnapshot
  ) {
    changes.push({
      field: "liquidCashSnapshot",
      label: "Liquid cash",
      before:
        b.liquidCashSnapshot != null
          ? `$${formatValue(b.liquidCashSnapshot)}`
          : undefined,
      after: `$${formatValue(a.liquidCashSnapshot)}`,
    });
  }

  for (const memberPatch of patch.members ?? []) {
    if (memberPatch.remove) {
      changes.push({
        field: `member:${memberPatch.matchName}`,
        label: `Removed member ${memberPatch.matchName}`,
      });
      continue;
    }
    const afterMember = after.members.find(
      (m) =>
        m.name.toLowerCase() ===
          (memberPatch.name ?? memberPatch.matchName).toLowerCase() ||
        m.id === memberPatch.matchName
    );
    if (!afterMember) continue;

    for (const income of memberPatch.incomeSources ?? []) {
      const line = afterMember.incomeSources.find((i) => i.type === income.type);
      if (line) {
        changes.push({
          field: `member:${afterMember.name}:income:${income.type}`,
          label: `${afterMember.name} ${income.type}`,
          after: `$${formatValue(line.amount)}`,
        });
      }
    }
    for (const contrib of memberPatch.contributions ?? []) {
      const beforeMember = before.members.find(
        (m) =>
          m.name.toLowerCase() ===
            (memberPatch.name ?? memberPatch.matchName).toLowerCase() ||
          m.id === memberPatch.matchName
      );
      const beforeLine = beforeMember?.contributions.find(
        (c) => c.type === contrib.type
      );
      const line = afterMember.contributions.find((c) => c.type === contrib.type);
      if (!line) continue;
      const beforeAmount = beforeLine?.amount;
      if (beforeAmount === line.amount && contrib.amountExpression !== "max") {
        continue;
      }
      changes.push({
        field: `member:${afterMember.name}:contribution:${contrib.type}`,
        label: `${afterMember.name} ${contrib.type}`,
        before:
          beforeAmount != null ? `$${formatValue(beforeAmount)}` : undefined,
        after: `$${formatValue(line.amount)}`,
      });
    }
  }

  return changes;
}

export async function tryAutoSaveHouseholdFromChat(options: {
  householdId: string;
  userMessage: string;
  autoSaveEnabled: boolean;
  isUnlocked: boolean;
}): Promise<AdvisorAutoSaveResult> {
  const disabled: AdvisorAutoSaveResult = {
    enabled: options.autoSaveEnabled,
    attempted: false,
    applied: false,
    changes: [],
  };

  if (!options.autoSaveEnabled) {
    return { ...disabled, skippedReason: "disabled" };
  }
  if (!options.isUnlocked) {
    return { ...disabled, skippedReason: "privacy_locked" };
  }
  if (!shouldAttemptExtraction(options.userMessage)) {
    return { ...disabled, skippedReason: "no_profile_signals" };
  }

  const household = await ensureDefaultHousehold(options.householdId);

  const normalized = normalizeHousehold(household);
  const taxYear = defaultTaxYear(normalized);
  const [members, taxProfile] = await Promise.all([
    memberRepository.listByHousehold(options.householdId),
    taxProfileRepository.get(options.householdId, taxYear),
  ]);

  const filingStatus = taxProfile?.filingStatus;
  const rules = loadRulePack(taxYear);
  const snapshot = buildCompactSnapshot(household, members, filingStatus);
  const inferredMemberPatches = inferMemberPatchesFromMessage(
    options.userMessage,
    members
  );
  const hasRuleBasedUpdates = inferredMemberPatches.length > 0;

  let patch: HouseholdAutoSavePatch = {};
  let llmExtractionFailed = false;

  if (!hasRuleBasedUpdates) {
    try {
      patch = await openRouterExtractJson({
        messages: [
          {
            role: "system",
            content: buildHouseholdExtractionSystemPrompt({
              snapshotJson: JSON.stringify(snapshot, null, 2),
              taxYear,
              limits: {
                retirement401kLimit: rules.retirement401kLimit ?? 23500,
                hsaSingleLimit: rules.hsaSingleLimit ?? 4300,
                hsaFamilyLimit: rules.hsaFamilyLimit ?? 8550,
                fsaHealthLimit: rules.fsaHealthLimit ?? 3300,
                fsaDependentCareLimit: rules.fsaDependentCareLimit ?? 5000,
                fsaDependentCareLimitMfs: rules.fsaDependentCareLimitMfs ?? 2500,
              },
            }),
          },
          {
            role: "user",
            content: buildHouseholdExtractionUserMessage(options.userMessage),
          },
        ],
        parse: parseHouseholdAutoSavePatch,
      });
    } catch (err) {
      if (err instanceof OpenRouterNotConfiguredError) {
        return {
          enabled: true,
          attempted: true,
          applied: false,
          changes: [],
          skippedReason: "extraction_not_configured",
        };
      }
      llmExtractionFailed = true;
      patch = {};
    }
  }

  patch = enrichPatchWithInferredMembers(patch, inferredMemberPatches);

  const inferredCash = inferLiquidCashFromMessage(options.userMessage);
  if (inferredCash != null && patch.liquidCashSnapshot == null) {
    patch = { ...patch, liquidCashSnapshot: inferredCash };
  }

  if (llmExtractionFailed && inferredMemberPatches.length === 0) {
    return {
      enabled: true,
      attempted: true,
      applied: false,
      changes: [],
      skippedReason: "extraction_failed",
    };
  }

  if (!patchHasUpdates(patch)) {
    return {
      enabled: true,
      attempted: true,
      applied: false,
      changes: [],
      skippedReason: "nothing_to_update",
    };
  }

  const effectiveFilingStatus =
    patch.filingStatus ?? filingStatus ?? "single";
  const dependentCount = countDependents(members);
  const contributionContext = {
    taxYear,
    filingStatus: effectiveFilingStatus,
    dependentCount,
    rules: {
      retirement401kLimit: rules.retirement401kLimit,
      hsaSingleLimit: rules.hsaSingleLimit,
      hsaFamilyLimit: rules.hsaFamilyLimit,
      fsaHealthLimit: rules.fsaHealthLimit,
      fsaDependentCareLimit: rules.fsaDependentCareLimit,
      fsaDependentCareLimitMfs: rules.fsaDependentCareLimitMfs,
    },
  };

  let mergedMembers = members;
  if (patch.members && patch.members.length > 0) {
    mergedMembers = mergeMemberPatches(members, patch.members, {
      householdId: options.householdId,
      contributionContext,
    });
  }

  const beforeState = {
    household,
    members,
    filingStatus,
  };

  try {
    const result = await saveHouseholdBundle(options.householdId, {
      displayName: patch.displayName ?? undefined,
      primaryState: patch.primaryState ?? undefined,
      persona: patch.persona ?? undefined,
      defaultTaxYear: patch.defaultTaxYear ?? undefined,
      filingStatus: patch.filingStatus ?? undefined,
      liquidCashSnapshot: patch.liquidCashSnapshot ?? undefined,
      members: patch.members ? mergedMembers : undefined,
    });

    const afterProfile = await taxProfileRepository.get(
      options.householdId,
      taxYear
    );

    const changes = diffPatchChanges(
      beforeState,
      {
        household: result.household,
        members: result.members,
        filingStatus: afterProfile?.filingStatus,
      },
      patch
    );

    if (changes.length === 0) {
      return {
        enabled: true,
        attempted: true,
        applied: false,
        changes: [],
        skippedReason: "nothing_to_update",
      };
    }

    return {
      enabled: true,
      attempted: true,
      applied: true,
      changes,
    };
  } catch {
    return {
      enabled: true,
      attempted: true,
      applied: false,
      changes: [],
      skippedReason: "validation_failed",
    };
  }
}
