import type {
  Account,
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
  computePlanExecutionOutlook,
  inferAssetClassFromName,
  mapCategoryToAssetClass,
  normalizeInvestmentCategory,
  sumByClass,
  tickerFromName,
  type AssetClass,
} from "@portfolio/contracts";
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

export async function getPlan(householdId: string): Promise<InvestmentPlan> {
  const existing = await investmentPlanRepository.get(householdId);
  if (existing) return existing;
  return {
    id: `plan-${householdId}`,
    householdId,
    instruments: [],
    updatedAt: new Date().toISOString(),
  };
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
  const base = buildHouseholdPlanSummary({
    netWorth,
    instruments: plan.instruments,
    actualTotalDollars: actualTotal,
    valuesUnlocked,
  });

  return {
    ...base,
    privacyMode: valuesUnlocked ? ("unlocked" as const) : ("locked" as const),
    valuesUnlocked,
  };
}

export function planWarnings(summary: { overAllocated: boolean }): string[] {
  if (!summary.overAllocated) return [];
  return ["Plan exceeds 100% of net worth"];
}
