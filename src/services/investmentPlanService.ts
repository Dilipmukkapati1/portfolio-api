import type {
  Account,
  AggregatedPlanFees,
  FundProfile,
  Holding,
  InvestmentPlan,
  PlannedInstrument,
} from "@portfolio/contracts";
import {
  ASSET_CLASS_ORDER,
  buildAllocationSegments,
  buildHouseholdPlanSummary,
  buildInstrumentExecutionRollups,
  categorizeInvestment,
  computeAggregatedPlanFees,
  computePlanExecutionOutlook,
  feeFieldsForPlannedInstrument,
  feeSnapshotFromProfile,
  hasPersistedFeeSnapshot,
  inferAssetClassFromName,
  mapCategoryToAssetClass,
  normalizeInvestmentCategory,
  sumByClass,
  tickerFromName,
  type AssetClass,
} from "@portfolio/contracts";
import { getInstrumentDataProvider } from "./instrumentDataProvider.js";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { investmentPlanRepository } from "../cosmos/repositories/investmentPlanRepository.js";
import { accountValue, holdingValue } from "./privacyRedact.js";

type AggregatedActualHolding = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  marketValue: number;
};

function resolveHoldingCategory(holding: Holding) {
  if (holding.category) {
    return normalizeInvestmentCategory(holding.category);
  }
  return categorizeInvestment({
    symbol: holding.symbol,
    description: holding.description,
  });
}

function displayNameForHolding(holding: Holding): string {
  if (holding.description?.trim()) return holding.description.trim();
  return holding.symbol.trim().toUpperCase();
}

export function aggregateActualHoldings(holdings: Holding[]): AggregatedActualHolding[] {
  const bySymbol = new Map<string, AggregatedActualHolding>();

  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase() || "UNKNOWN";
    const value = holdingValue(holding);
    if (value <= 0) continue;

    const category = resolveHoldingCategory(holding);
    const assetClass = mapCategoryToAssetClass(category);
    const existing = bySymbol.get(symbol);

    if (existing) {
      existing.marketValue += value;
      continue;
    }

    bySymbol.set(symbol, {
      symbol,
      name: displayNameForHolding(holding),
      assetClass,
      marketValue: value,
    });
  }

  return [...bySymbol.values()];
}

function actualByAssetClass(
  aggregated: AggregatedActualHolding[]
): Record<AssetClass, number> {
  const out = Object.fromEntries(
    ASSET_CLASS_ORDER.map((c) => [c, 0])
  ) as Record<AssetClass, number>;
  for (const holding of aggregated) {
    out[holding.assetClass] += holding.marketValue;
  }
  return out;
}

export async function getNetWorth(householdId: string): Promise<number> {
  const household = await householdRepository.get(householdId);
  const summaryNw = household?.netWorthSummary?.netWorth;
  if (summaryNw != null && Number.isFinite(summaryNw) && summaryNw > 0) {
    return summaryNw;
  }

  const [accounts, holdings] = await Promise.all([
    accountRepository.listByHousehold(householdId),
    holdingRepository.listByHousehold(householdId),
  ]);
  return sumAccountBalances(accounts, holdings);
}

function sumAccountBalances(accounts: Account[], holdings: Holding[]): number {
  return accounts.reduce(
    (sum, account) => sum + accountValue(account, holdings),
    0
  );
}

function emptyPlan(householdId: string): InvestmentPlan {
  return {
    id: `plan-${householdId}`,
    householdId,
    instruments: [],
    updatedAt: new Date().toISOString(),
  };
}

async function fetchProfilesByTicker(
  instruments: PlannedInstrument[]
): Promise<Map<string, FundProfile>> {
  const provider = getInstrumentDataProvider();
  const profileByTicker = new Map<string, FundProfile>();

  await Promise.all(
    instruments.map(async (item) => {
      const ticker = (item.ticker ?? tickerFromName(item.name)).toUpperCase();
      if (profileByTicker.has(ticker)) return;
      const profile = await provider.getProfile(ticker);
      if (profile) profileByTicker.set(ticker, profile);
    })
  );

  return profileByTicker;
}

function snapshotInstrumentFees(
  item: PlannedInstrument,
  profileByTicker: Map<string, FundProfile>
): PlannedInstrument {
  const ticker = (item.ticker ?? tickerFromName(item.name)).toUpperCase();
  const profile = profileByTicker.get(ticker);
  const now = new Date().toISOString();

  if (!profile) {
    return {
      ...item,
      expenseRatio: 0,
      feeKind: "none",
      profileAsOf: now,
    };
  }

  return {
    ...item,
    ...feeSnapshotFromProfile(profile),
    profileAsOf: profile.asOf ?? now,
  };
}

export async function enrichInstrumentsWithFeeSnapshots(
  instruments: PlannedInstrument[]
): Promise<PlannedInstrument[]> {
  if (instruments.length === 0) return instruments;
  const profileByTicker = await fetchProfilesByTicker(instruments);
  return instruments.map((item) => snapshotInstrumentFees(item, profileByTicker));
}

async function hydratePlanFeeSnapshots(plan: InvestmentPlan): Promise<InvestmentPlan> {
  const missing = plan.instruments.filter((item) => !hasPersistedFeeSnapshot(item));
  if (missing.length === 0) return plan;

  const profileByTicker = await fetchProfilesByTicker(missing);
  const instruments = plan.instruments.map((item) =>
    hasPersistedFeeSnapshot(item)
      ? item
      : snapshotInstrumentFees(item, profileByTicker)
  );
  const updatedAt = new Date().toISOString();

  return investmentPlanRepository.upsert({
    ...plan,
    instruments,
    updatedAt,
  });
}

export async function getPlan(householdId: string): Promise<InvestmentPlan> {
  const existing = await investmentPlanRepository.get(householdId);
  if (!existing) return emptyPlan(householdId);
  return hydratePlanFeeSnapshots(existing);
}

export function dedupePlanInstruments(
  instruments: Array<Omit<PlannedInstrument, "ticker"> & { ticker?: string }>
): PlannedInstrument[] {
  const byTicker = new Map<string, PlannedInstrument>();
  instruments.forEach((item, index) => {
    const ticker = (item.ticker ?? tickerFromName(item.name)).toUpperCase();
    byTicker.set(ticker, {
      ...item,
      ticker,
      sortOrder: item.sortOrder ?? index,
      assetClass: item.assetClass ?? inferAssetClassFromName(item.name),
    });
  });
  return [...byTicker.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function buildPlanFees(
  plan: InvestmentPlan,
  netWorth: number
): Promise<AggregatedPlanFees | null> {
  if (plan.instruments.length === 0 || netWorth <= 0) return null;

  const needsLiveProfile = plan.instruments.filter(
    (item) => !hasPersistedFeeSnapshot(item)
  );
  const profileByTicker =
    needsLiveProfile.length > 0
      ? await fetchProfilesByTicker(needsLiveProfile)
      : new Map<string, FundProfile>();

  return computeAggregatedPlanFees({
    instruments: plan.instruments,
    netWorth,
    profileForInstrument: (item) => {
      if (hasPersistedFeeSnapshot(item)) {
        return feeFieldsForPlannedInstrument(item);
      }
      const ticker = (item.ticker ?? tickerFromName(item.name)).toUpperCase();
      return (
        profileByTicker.get(ticker) ?? { expenseRatio: 0, feeKind: "none" }
      );
    },
  });
}

export async function buildAllocationRollup(
  householdId: string,
  valuesUnlocked: boolean
) {
  const [plan, holdings, netWorth] = await Promise.all([
    getPlan(householdId),
    holdingRepository.listByHousehold(householdId),
    getNetWorth(householdId),
  ]);

  const aggregated = aggregateActualHoldings(holdings);
  const actualTotals = actualByAssetClass(aggregated);
  const actualTotal = Object.values(actualTotals).reduce((s, v) => s + v, 0);
  const planByClass = sumByClass(plan.instruments, netWorth);

  const instrumentRollups = buildInstrumentExecutionRollups({
    instruments: plan.instruments,
    netWorth,
    actualHoldings: aggregated.map((h) => ({
      symbol: h.symbol,
      marketValue: h.marketValue,
    })),
    valuesUnlocked,
  });
  const planFees = await buildPlanFees(plan, netWorth);

  return {
    netWorth,
    actualTotalDollars: valuesUnlocked ? actualTotal : null,
    classes: buildAllocationSegments(
      planByClass,
      actualTotals,
      actualTotal,
      valuesUnlocked
    ),
    instrumentRollups,
    executionOutlook: computePlanExecutionOutlook(instrumentRollups),
    planFees,
  };
}

export async function buildSummary(householdId: string, valuesUnlocked: boolean) {
  const [plan, holdings, netWorth] = await Promise.all([
    getPlan(householdId),
    holdingRepository.listByHousehold(householdId),
    getNetWorth(householdId),
  ]);

  const aggregated = aggregateActualHoldings(holdings);
  const actualTotal = aggregated.reduce((s, h) => s + h.marketValue, 0);
  const [base, planFees] = await Promise.all([
    Promise.resolve(
      buildHouseholdPlanSummary({
        netWorth,
        instruments: plan.instruments,
        actualTotalDollars: actualTotal,
        valuesUnlocked,
      })
    ),
    buildPlanFees(plan, netWorth),
  ]);

  return {
    summary: {
      ...base,
      privacyMode: valuesUnlocked ? ("unlocked" as const) : ("locked" as const),
      valuesUnlocked,
    },
    planFees,
  };
}

export function planWarnings(summary: { overAllocated: boolean }): string[] {
  if (!summary.overAllocated) return [];
  return ["Plan exceeds 100% of net worth"];
}
