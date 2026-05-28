import type {
  ArchitectAssetClass,
  ArchitectExecutionAsset,
  ArchitectStrategyAllocation,
  Holding,
} from "@portfolio/contracts";
import { categorizeInvestment } from "@portfolio/contracts";
import type { ArchitectPlanRow } from "../sql/architectStore.js";
import { holdingValue } from "./privacyRedact.js";

const BAR_COLORS = ["purple", "blue", "green", "orange"] as const;

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function inferAssetClass(holding: Holding): ArchitectAssetClass {
  if (holding.assetClass) {
    const normalized = holding.assetClass.toLowerCase();
    if (normalized.includes("bond") || normalized.includes("fixed")) return "bond";
    if (normalized.includes("cash")) return "cash";
    if (
      normalized.includes("equity") ||
      normalized.includes("stock")
    ) {
      return "equity";
    }
  }

  const category = categorizeInvestment({
    symbol: holding.symbol,
    description: holding.description,
  });
  if (category === "bond") return "bond";
  if (category === "cash") return "cash";
  return "equity";
}

function computeActualPercents(holdings: Holding[]): Map<string, number> {
  const investable = holdings.filter((h) => holdingValue(h) > 0);
  const total = investable.reduce((sum, h) => sum + holdingValue(h), 0);
  const bySymbol = new Map<string, number>();

  if (total <= 0) return bySymbol;

  for (const holding of investable) {
    const symbol = holding.symbol.trim().toUpperCase();
    const share = (holdingValue(holding) / total) * 100;
    bySymbol.set(symbol, roundPercent((bySymbol.get(symbol) ?? 0) + share));
  }

  return bySymbol;
}

export function computeStrategyFromHoldings(
  holdings: Holding[]
): ArchitectStrategyAllocation {
  const investable = holdings.filter((h) => holdingValue(h) > 0);
  const total = investable.reduce((sum, h) => sum + holdingValue(h), 0);
  if (total <= 0) {
    return { equitiesPercent: 0, bondsPercent: 0, cashPercent: 0 };
  }

  let equity = 0;
  let bonds = 0;
  let cash = 0;

  for (const holding of investable) {
    const value = holdingValue(holding);
    const assetClass = inferAssetClass(holding);
    if (assetClass === "bond") bonds += value;
    else if (assetClass === "cash") cash += value;
    else equity += value;
  }

  return {
    equitiesPercent: roundPercent((equity / total) * 100),
    bondsPercent: roundPercent((bonds / total) * 100),
    cashPercent: roundPercent((cash / total) * 100),
  };
}

function fillStatus(planned: number, actual: number): number {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return roundPercent(Math.min(100, (actual / planned) * 100));
}

function barColorFor(
  assetClass: ArchitectAssetClass,
  fill: number
): ArchitectExecutionAsset["barColor"] {
  if (fill >= 90) {
    if (assetClass === "bond") return "blue";
    if (assetClass === "cash") return "green";
    return "purple";
  }
  return "orange";
}

export function buildExecutionAssets(
  plan: ArchitectPlanRow,
  holdings: Holding[]
): ArchitectExecutionAsset[] {
  const actualBySymbol = computeActualPercents(holdings);

  return plan.targets.map((target, index) => {
    const symbol = target.symbol.toUpperCase();
    const actualPercent = actualBySymbol.get(symbol) ?? 0;
    const fill = fillStatus(target.plannedPercent, actualPercent);
    return {
      symbol,
      name: target.name,
      assetClass: target.assetClass,
      plannedPercent: target.plannedPercent,
      actualPercent,
      fillStatusPercent: fill,
      barColor: barColorFor(target.assetClass, fill),
    };
  });
}

export function computeInvestableTotal(holdings: Holding[]): number {
  return holdings
    .filter((h) => holdingValue(h) > 0)
    .reduce((sum, h) => sum + holdingValue(h), 0);
}
