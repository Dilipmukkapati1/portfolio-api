import {
  defaultTaxYear,
  getAdvisorPageDefinition,
  normalizeHousehold,
  prepareTaxInputForEstimate,
  type AdvisorPageContext,
} from "@portfolio/contracts";
import { estimateFederalTax, loadRulePack, suggestStrategies } from "@portfolio/tax-engine";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { taxProfileRepository } from "../cosmos/repositories/taxProfileRepository.js";
import { enrichHousehold, getOrCreateTaxProfile } from "./householdTaxService.js";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";

const DOLLAR_KEY = /amount|balance|value|income|wages|savings|cost|gain|loss|cash|total|room|remaining|contributed|limit|price|basis|tax|payment|budget|spend|net/i;

function redactSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return redactValue(snapshot) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (typeof nested === "number" && DOLLAR_KEY.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactValue(nested);
      }
    }
    return out;
  }
  return value;
}

export function resolvePageContext(
  pageContext?: AdvisorPageContext
): AdvisorPageContext {
  if (!pageContext) {
    const def = getAdvisorPageDefinition("/advisor");
    return {
      sourceRoute: def.route,
      sourceLabel: def.label,
      pageDescription: def.pageDescription,
      scopeTopics: def.scopeTopics,
      outOfScopeHint: def.outOfScopeHint,
      pageSnapshot: {},
      snapshotCapturedAt: new Date().toISOString(),
      starterPrompts: def.defaultStarterPrompts,
    };
  }

  const def = getAdvisorPageDefinition(pageContext.sourceRoute);
  return {
    ...pageContext,
    pageDescription: pageContext.pageDescription || def.pageDescription,
    scopeTopics: pageContext.scopeTopics.length ? pageContext.scopeTopics : def.scopeTopics,
    outOfScopeHint: pageContext.outOfScopeHint || def.outOfScopeHint,
  };
}

export async function buildAdvisorHouseholdContext(
  householdId: string,
  isUnlocked: boolean
): Promise<Record<string, unknown>> {
  const householdRaw = await householdRepository.get(householdId);
  if (!householdRaw) {
    return { error: "Household not found" };
  }

  const enriched = await enrichHousehold(householdRaw);
  const normalized = normalizeHousehold(enriched);
  const taxYear = defaultTaxYear(normalized);
  const [members, taxProfile, accounts, holdings] = await Promise.all([
    memberRepository.listByHousehold(householdId),
    getOrCreateTaxProfile(householdId, taxYear),
    accountRepository.listByHousehold(householdId),
    holdingRepository.listByHousehold(householdId),
  ]);

  const rules = loadRulePack(taxYear);
  const taxInput = taxProfile?.inputs ?? {
    taxYear,
    filingStatus: "single" as const,
    wages: 0,
    selfEmploymentIncome: 0,
    interestIncome: 0,
    dividendIncome: 0,
    capitalGainsShort: 0,
    capitalGainsLong: 0,
    otherIncome: 0,
    adjustments: 0,
    dependents: 0,
    retirementContributions: 0,
    hsaContributions: 0,
  };
  const strategies = suggestStrategies(
    {
      householdId,
      persona: normalized.persona,
      filingStatus: taxInput.filingStatus,
      state: normalized.primaryState ?? normalized.state ?? "CA",
      dependents: taxInput.dependents,
      taxInput,
    },
    rules
  );

  let lastEstimate = taxProfile?.lastEstimate;
  if (!lastEstimate && taxProfile?.inputs) {
    lastEstimate = estimateFederalTax(
      prepareTaxInputForEstimate(taxProfile.inputs),
      rules
    );
  }

  const accountsByTreatment: Record<string, number> = {};
  for (const account of accounts) {
    const key = account.taxTreatment ?? "unknown";
    accountsByTreatment[key] = (accountsByTreatment[key] ?? 0) + 1;
  }

  let unrealizedGainLoss = 0;
  for (const h of holdings) {
    const mv = h.marketValue ?? h.quantity * (h.price ?? 0);
    const basis = h.costBasis ?? 0;
    unrealizedGainLoss += mv - basis;
  }

  const [simplefinSync, snaptradeSync] = await Promise.all([
    integrationRepository.getSyncState(householdId, "simplefin"),
    integrationRepository.getSyncState(householdId, "snaptrade"),
  ]);

  const memberSummary = members.map((m) => ({
    id: m.id,
    name: m.name,
    relationship: m.relationship,
    isActive: m.isActive,
    incomeSourceTypes: (m.incomeSources ?? []).map((s) => s.type),
    contributionTypes: (m.contributions ?? []).map((c) => c.type),
    ...(isUnlocked
      ? {
          incomeSources: m.incomeSources,
          contributions: m.contributions,
        }
      : {}),
  }));

  const base: Record<string, unknown> = {
    household: {
      displayName: normalized.displayName,
      persona: normalized.persona,
      state: normalized.primaryState ?? normalized.state,
      filingStatus: normalized.filingStatus,
      dependents: normalized.dependents,
      taxYear,
    },
    members: memberSummary,
    taxProfile: {
      filingStatus: taxProfile?.filingStatus,
      dependentCount: taxProfile?.dependentCount,
      contributionLimits: isUnlocked
        ? taxProfile?.contributionLimits
        : taxProfile?.contributionLimits?.map((l) => ({
            type: l.type,
            memberId: l.memberId,
            limit: "[redacted]",
            contributed: "[redacted]",
            remaining: "[redacted]",
          })),
      withholding: isUnlocked ? taxProfile?.withholding : { note: "redacted" },
    },
    taxEstimate: isUnlocked
      ? lastEstimate
      : lastEstimate
        ? {
            taxYear: lastEstimate.taxYear,
            effectiveRate: lastEstimate.effectiveRate,
            marginalRate: lastEstimate.marginalRate,
          }
        : null,
    strategies: isUnlocked
      ? strategies
      : strategies.map(({ estimatedSavings: _s, ...rest }) => rest),
    accountsByTreatment,
    holdingsCount: holdings.length,
    unrealizedGainLoss: isUnlocked ? unrealizedGainLoss : "[redacted]",
    topHoldings: holdings.slice(0, 5).map((h) => ({
      symbol: h.symbol,
      category: h.category,
      ...(isUnlocked
        ? {
            marketValue: h.marketValue,
            costBasis: h.costBasis,
            unrealizedGain: (h.marketValue ?? 0) - (h.costBasis ?? 0),
          }
        : { portfolioPercent: "see locked mode" }),
    })),
    dataFreshness: {
      simplefinLastSync: simplefinSync?.lastSyncedAt,
      snaptradeLastSync: snaptradeSync?.lastSyncedAt,
    },
  };

  return base;
}

export function buildAdvisorPromptContext(
  householdContext: Record<string, unknown>,
  pageContext: AdvisorPageContext,
  isUnlocked: boolean
): Record<string, unknown> {
  return {
    page: {
      route: pageContext.sourceRoute,
      label: pageContext.sourceLabel,
      description: pageContext.pageDescription,
      scopeTopics: pageContext.scopeTopics,
      snapshot: isUnlocked
        ? pageContext.pageSnapshot
        : redactSnapshot(pageContext.pageSnapshot),
      snapshotCapturedAt: pageContext.snapshotCapturedAt,
    },
    household: householdContext,
  };
}
